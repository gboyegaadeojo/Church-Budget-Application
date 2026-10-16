import { randomUUID } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { budgetCycles, emailOutbox, userDepartments, userRoles, users } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { saveDraft, startRequest, submitRequest } from "@/domain/annual/service";
import { daysUntil, runReminders } from "@/domain/cycles/emails";
import {
  changeDeadline,
  closeCycle,
  extendDepartment,
  openCycle,
  reopenCycle,
} from "@/domain/cycles/service";
import {
  acceptProposed,
  mergeProposed,
  rejectProposed,
  removeRepresentative,
  setRepresentative,
} from "@/domain/departments/service";
import { queueFailureDigest } from "@/domain/notifications/failure-digest";
import { addStaff, setUserRoles } from "@/domain/users/admin";
import {
  ACCESS_REQUESTS_PER_DAY,
  emailAccessRequest,
  emailPcoUnavailable,
} from "@/domain/users/emails";
import { applyVerification } from "@/domain/users/verification";
import { loadViewer } from "@/domain/users/viewer";
import type { Subject } from "@/lib/authz";
import type { Role } from "@/lib/roles";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertCycle, insertDepartment, insertUser } from "./helpers/fixtures";

const NOW = new Date("2026-10-20T17:00:00Z");
const DAY = 86_400_000;

let t: TestDb;
let db: Db;
let admin: Subject;
let accountant: Subject;

const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

async function person(roles: Role[], extra: Partial<typeof users.$inferInsert> = {}) {
  const row = await insertUser(db, { accessStatus: "active", ...extra });
  if (roles.length)
    await db.insert(userRoles).values(roles.map((role) => ({ userId: row.id, role })));
  return {
    id: row.id,
    email: row.email,
    roles,
    departments: [],
    version: row.version,
  } as Subject & {
    email: string;
    version: number;
  };
}

const leader = (extra: Partial<typeof users.$inferInsert> = {}) =>
  person(["requester"], { pcoLeaderVerified: true, pcoVerifiedAt: NOW, ...extra });

async function emails(template: string, extra?: ReturnType<typeof eq>) {
  return db
    .select()
    .from(emailOutbox)
    .where(and(eq(emailOutbox.template, template), extra));
}

const to = (rows: { toUserId: string | null }[]) => rows.map((r) => r.toUserId).sort();

async function representing(
  departmentId: string,
  userId: string,
  type: "primary" | "representative" = "primary",
) {
  await db.insert(userDepartments).values({ userId, departmentId, representativeType: type });
}

/** Reads the cycle version first: PGlite has one connection, so no query may run beside a transaction. */
async function runWithVersion<T>(cycleId: string, fn: (tx: Tx, version: number) => Promise<T>) {
  const version = await cycleVersion(cycleId);
  return run((tx) => fn(tx, version));
}

async function cycleVersion(id: string) {
  const [row] = await db
    .select({ v: budgetCycles.version })
    .from(budgetCycles)
    .where(eq(budgetCycles.id, id));
  return row.v;
}

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  admin = await person(["system_admin"]);
  accountant = await person(["accountant"]);
});

afterAll(async () => {
  await t?.close();
});

describe("department emails (FR-03, FR-38)", () => {
  it("AC-14 tells the administrators when a leader joins or proposes a department", async () => {
    const cycle = await insertCycle(db, admin.id, { budgetYear: 2031, name: "FY2031" });
    const listed = await insertDepartment(db);
    const sam = await leader({ accessStatus: "pending_department" });
    await run((tx) => startRequest(tx, sam, { cycleId: cycle.id, departmentId: listed.id }));
    const [joined] = await emails("department.leader_joined");
    expect(joined.toUserId).toBe(admin.id);
    expect(joined.subject).toContain(`joined ${listed.name}`);
    expect(joined.textBody).toContain("Primary");

    const ada = await leader({ accessStatus: "pending_department" });
    await run((tx) =>
      startRequest(tx, ada, { cycleId: cycle.id, otherName: "Media Ministri Team" }),
    );
    const [proposed] = await emails("department.proposed");
    expect(proposed.subject).toBe("New department proposed: Media Ministri Team");
    expect(proposed.status).toBe("pending");
  });

  async function proposal(name: string) {
    const proposer = await leader();
    const dept = await insertDepartment(db, {
      name,
      status: "proposed",
      proposedByUserId: proposer.id,
    });
    await representing(dept.id, proposer.id);
    return { dept, proposer };
  }

  it("AC-16 tells the proposer when the department is added, merged or rejected", async () => {
    const a = await proposal("Hospitality Crew");
    await run((tx) => acceptProposed(tx, admin, { id: a.dept.id, version: a.dept.version }));
    expect(to(await emails("department.accepted"))).toEqual([a.proposer.id]);

    const target = await insertDepartment(db, { name: "Media Team Main" });
    const m = await proposal("Media Teem");
    await run((tx) =>
      mergeProposed(tx, admin, { id: m.dept.id, intoId: target.id, version: m.dept.version }),
    );
    const [merged] = await emails("department.merged");
    expect(merged.toUserId).toBe(m.proposer.id);
    expect(merged.subject).toBe("Media Teem is now part of Media Team Main");

    const r = await proposal("Car Park Ministry");
    await run((tx) =>
      rejectProposed(tx, admin, {
        id: r.dept.id,
        reason: "Use Ushering Team",
        version: r.dept.version,
      }),
    );
    const [rejected] = await emails("department.rejected");
    expect(rejected.toUserId).toBe(r.proposer.id);
    expect(rejected.textBody).toContain("Use Ushering Team");
  });

  it("tells a person when the administrator assigns or removes them, and FR-38 Backup promotion", async () => {
    const dept = await insertDepartment(db);
    const primary = await leader();
    const backup = await leader();
    await run((tx) =>
      setRepresentative(tx, admin, { departmentId: dept.id, userId: primary.id, type: "primary" }),
    );
    await run((tx) =>
      setRepresentative(tx, admin, { departmentId: dept.id, userId: backup.id, type: "backup_1" }),
    );
    const assigned = await emails(
      "department.assigned",
      like(emailOutbox.subject, `%${dept.name}`),
    );
    expect(to(assigned)).toEqual([primary.id, backup.id].sort());
    expect(assigned.find((e) => e.toUserId === backup.id)!.textBody).toContain("Backup 1");

    await run((tx) =>
      removeRepresentative(tx, admin, { departmentId: dept.id, userId: primary.id }),
    );
    const [removed] = await emails(
      "department.removed",
      like(emailOutbox.subject, `%${dept.name}`),
    );
    expect(removed.toUserId).toBe(primary.id);
    const [promoted] = await emails(
      "department.backup_promoted",
      like(emailOutbox.subject, `%${dept.name}`),
    );
    expect(promoted.toUserId).toBe(admin.id);
    const nowPrimary = await emails("department.assigned", eq(emailOutbox.toUserId, backup.id));
    expect(nowPrimary.some((e) => e.textBody.includes("You are now Primary"))).toBe(true);
  });
});

describe("cycle emails (FR-21, 4.3)", () => {
  it("announces opening, closing and reopening to every active department's representatives", async () => {
    const dept = await insertDepartment(db);
    const rep = await leader();
    await representing(dept.id, rep.id);
    const cycle = await insertCycle(db, admin.id, {
      budgetYear: 2032,
      name: "FY2032",
      status: "draft",
      submissionDeadline: new Date(NOW.getTime() + 30 * DAY),
    });
    await runWithVersion(cycle.id, (tx, version) =>
      openCycle(tx, admin, { id: cycle.id, version }, { now: NOW }),
    );
    const opened = await emails("cycle.opened", eq(emailOutbox.cycleId, cycle.id));
    expect(opened.map((e) => e.toUserId)).toContain(rep.id);
    expect(opened[0].subject).toBe("FY2032 budgets are open");
    expect(opened[0].textBody).toContain("Deadline: Nov 19, 2026");

    await runWithVersion(cycle.id, (tx, version) =>
      closeCycle(tx, admin, { id: cycle.id, version }, { now: NOW }),
    );
    expect(
      (await emails("cycle.closed", eq(emailOutbox.cycleId, cycle.id))).length,
    ).toBeGreaterThan(0);
    await runWithVersion(cycle.id, (tx, version) =>
      reopenCycle(
        tx,
        admin,
        {
          id: cycle.id,
          version,
          newDeadline: "2026-12-07T17:00",
          reason: "Board asked",
        },
        { now: NOW },
      ),
    );
    const [reopened] = await emails("cycle.reopened", eq(emailOutbox.toUserId, rep.id));
    expect(reopened.textBody).toContain("Dec 7, 2026");
    expect(reopened.textBody).toContain("Board asked");
  });

  it("a deadline change reaches only departments still to submit; an extension only that department", async () => {
    const cycle = await insertCycle(db, admin.id, {
      budgetYear: 2033,
      name: "FY2033",
      submissionDeadline: new Date(NOW.getTime() + 30 * DAY),
    });
    const waiting = await insertDepartment(db);
    const waitingRep = await leader();
    await representing(waiting.id, waitingRep.id);
    const done = await insertDepartment(db);
    const doneRep = await leader();
    await representing(done.id, doneRep.id);
    const viewer = await loadViewer(db, doneRep.id);
    if (!viewer.ok) throw new Error("no viewer");
    const { requestId } = await run((tx) =>
      startRequest(tx, viewer.viewer, { cycleId: cycle.id, departmentId: done.id }),
    );
    const saved = await run((tx) =>
      saveDraft(tx, viewer.viewer, {
        id: requestId,
        version: 1,
        title: "T",
        justification: "J",
        lines: [{ name: "Mixer", quantity: "1", unitPrice: "10.00" }],
      }),
    );
    await run((tx) =>
      submitRequest(
        tx,
        viewer.viewer,
        { id: requestId, version: saved.version, idempotencyKey: randomUUID() },
        { now: NOW },
      ),
    );

    await runWithVersion(cycle.id, (tx, version) =>
      changeDeadline(
        tx,
        admin,
        {
          id: cycle.id,
          version,
          newDeadline: "2026-12-14T17:00",
          reason: "More time",
        },
        { now: NOW },
      ),
    );
    const changed = await emails("cycle.deadline_changed", eq(emailOutbox.cycleId, cycle.id));
    expect(changed.map((e) => e.toUserId)).toContain(waitingRep.id);
    expect(changed.map((e) => e.toUserId)).not.toContain(doneRep.id);

    await run((tx) =>
      extendDepartment(
        tx,
        admin,
        {
          cycleId: cycle.id,
          departmentId: waiting.id,
          newDeadline: "2026-12-21T17:00",
          reason: "Leader away",
        },
        { now: NOW },
      ),
    );
    const extended = await emails("cycle.deadline_extended", eq(emailOutbox.cycleId, cycle.id));
    expect(to(extended)).toEqual([waitingRep.id]);
    expect(extended[0].textBody).toContain("Dec 21, 2026");
  });
});

describe("daily reminders job", () => {
  it("counts calendar days in the church's time zone", () => {
    const zone = "America/Winnipeg";
    // 11 p.m. in Winnipeg on Nov 22 is already Nov 23 in UTC.
    expect(
      daysUntil(new Date("2026-11-23T05:00:00Z"), new Date("2026-11-30T23:00:00Z"), zone),
    ).toBe(8);
    expect(
      daysUntil(new Date("2026-11-23T15:00:00Z"), new Date("2026-11-30T23:00:00Z"), zone),
    ).toBe(7);
  });

  it("reminds at 7 days and 1 day, once each, then tells the accountant who is outstanding", async () => {
    const freshDb = await createTestDb();
    try {
      const d = freshDb.db;
      const a = await insertUser(d, { accessStatus: "active" });
      await d.insert(userRoles).values({ userId: a.id, role: "accountant" });
      const rep = await insertUser(d, { accessStatus: "active" });
      const dept = await insertDepartment(d, { name: "Ushering Team" });
      await d
        .insert(userDepartments)
        .values({ userId: rep.id, departmentId: dept.id, representativeType: "primary" });
      const deadline = new Date("2026-11-30T23:00:00Z");
      await insertCycle(d, a.id, { submissionDeadline: deadline });

      const at = (iso: string) => runReminders(d, new Date(iso));
      expect(await at("2026-11-22T15:00:00Z")).toEqual({ reminders: 0, deadlinePassed: 0 });
      expect(await at("2026-11-23T15:00:00Z")).toEqual({ reminders: 1, deadlinePassed: 0 });
      expect(await at("2026-11-23T20:00:00Z")).toEqual({ reminders: 0, deadlinePassed: 0 });
      expect(await at("2026-11-29T15:00:00Z")).toEqual({ reminders: 1, deadlinePassed: 0 });
      expect(await at("2026-12-01T15:00:00Z")).toEqual({ reminders: 0, deadlinePassed: 1 });
      expect(await at("2026-12-02T15:00:00Z")).toEqual({ reminders: 0, deadlinePassed: 0 });

      const rows = await d.select().from(emailOutbox);
      expect(rows.map((r) => r.subject).sort()).toEqual([
        "FY2027 budget due in 7 days",
        "FY2027 budget due tomorrow",
        "FY2027 deadline passed: 1 department outstanding",
      ]);
      const passed = rows.find((r) => r.template === "cycle.deadline_passed")!;
      expect(passed.toUserId).toBe(a.id);
      expect(passed.textBody).toContain("Not submitted:\n- Ushering Team");
    } finally {
      await freshDb.close();
    }
  });
});

describe("access emails (FR-01a, FR-21 System)", () => {
  it("tells new staff they have access and a person when their roles change", async () => {
    const { userId } = await run((tx) =>
      addStaff(tx, admin, {
        email: "new.treasurer@example.org",
        displayName: "New Treasurer",
        roles: ["accountant"],
      }),
    );
    const [added] = await emails("access.staff_added", eq(emailOutbox.toUserId, userId));
    expect(added.toEmail).toBe("new.treasurer@example.org");
    expect(added.textBody).toContain("Roles: Accountant");

    const [row] = await db.select().from(users).where(eq(users.id, userId));
    await run((tx) =>
      setUserRoles(tx, admin, {
        userId,
        roles: ["accountant", "church_admin"],
        version: row.version,
      }),
    );
    const [changed] = await emails("access.roles_changed", eq(emailOutbox.toUserId, userId));
    expect(changed.textBody).toContain("Roles: Accountant, Church Administrator");
    expect(changed.textBody).toContain("Previous roles: Accountant");
  });

  it("AC-9 a suspended leader is reported to the administrators and the accountant", async () => {
    const sam = await leader();
    const [row] = await db.select().from(users).where(eq(users.id, sam.id));
    await run((tx) =>
      applyVerification(
        tx,
        row,
        {
          status: "not_leader",
          person: { id: "999", name: "Sam", status: "active", emails: [] },
          fieldValue: "No",
        },
        { now: NOW, actor: { kind: "job" } },
      ),
    );
    const sent = await emails(
      "access.leader_suspended",
      like(emailOutbox.textBody, `%${row.displayName}%`),
    );
    // With no Primary accountant chosen, every accountant is told.
    expect(to(sent)).toEqual(expect.arrayContaining([admin.id, accountant.id]));
  });

  it("reports a Planning Center outage at most once a day", async () => {
    await run((tx) => emailPcoUnavailable(tx, NOW));
    await run((tx) => emailPcoUnavailable(tx, new Date(NOW.getTime() + 60_000)));
    expect(await emails("access.pco_unavailable")).toHaveLength(1);
    await run((tx) => emailPcoUnavailable(tx, new Date(NOW.getTime() + DAY)));
    expect(await emails("access.pco_unavailable")).toHaveLength(2);
  });

  it("sends an access request once a day per address, and caps them overall", async () => {
    const ask = (email: string, offset = 0) =>
      run((tx) =>
        emailAccessRequest(tx, {
          email,
          name: null,
          method: "Planning Center",
          now: new Date(NOW.getTime() + offset),
        }),
      );
    await ask("visitor@example.org");
    await ask("Visitor@Example.org", 1000);
    expect(await emails("access.request")).toHaveLength(1);
    for (let i = 0; i < ACCESS_REQUESTS_PER_DAY + 5; i++)
      await ask(`someone${i}@example.org`, 2000);
    expect(await emails("access.request")).toHaveLength(ACCESS_REQUESTS_PER_DAY);
  });
});

describe("failed-email digest (FR-21)", () => {
  it("lists each failure once, to the administrators", async () => {
    const [row] = await db
      .insert(emailOutbox)
      .values({
        template: "annual.submitted.receipt",
        audience: "requester",
        toEmail: "gone@example.org",
        subject: "Budget received: Old Team",
        textBody: "t",
        htmlBody: "h",
        status: "failed",
        lastError: "Resend 422 validation_error: Invalid `to`",
        updatedAt: NOW,
      })
      .returning();
    expect(await run((tx) => queueFailureDigest(tx, new Date(NOW.getTime() + 1000)))).toBe(1);
    const [digest] = await emails("system.failure_digest");
    expect(digest.toUserId).toBe(admin.id);
    expect(digest.subject).toBe("1 email couldn't be sent");
    expect(digest.textBody).toContain(
      "Budget received: Old Team (to gone@example.org): Resend 422",
    );
    // Nothing new failed since: no second digest.
    expect(await run((tx) => queueFailureDigest(tx, new Date(NOW.getTime() + DAY)))).toBe(0);
    expect(row.id).toBeTruthy();
  });
});
