import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appSettings,
  approvalDecisions,
  auditEvents,
  budgetRequests,
  emailOutbox,
  userDepartments,
  userRoles,
} from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { runClarificationReminders } from "@/domain/annual/clarification-reminders";
import { decideRequest } from "@/domain/annual/review";
import type { RequestContentInput } from "@/domain/annual/schema";
import { saveDraft, startRequest, submitRequest } from "@/domain/annual/service";
import { ConflictError, RuleError, ValidationError } from "@/domain/errors";
import { accountantCover, accountantRecipients } from "@/domain/notifications/recipients";
import {
  clearDepartmentAway,
  clearMyAway,
  departmentCover,
  getMyAway,
  isAwayAt,
  setDepartmentAway,
  setMyAway,
} from "@/domain/users/away";
import { loadViewer } from "@/domain/users/viewer";
import { ForbiddenError, type Subject } from "@/lib/authz";
import type { Role } from "@/lib/roles";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertCycle, insertDepartment, insertUser } from "./helpers/fixtures";

/*
 * Away (FR-33, FR-38; AC-61, AC-119). The church is in Winnipeg: Oct 20, 2026 is CDT
 * (UTC−5), so a day starts at 05:00 UTC.
 */

const NOW = new Date("2026-10-20T17:00:00Z");
const DAY = 86_400_000;

let t: TestDb;
let db: Db;
let admin: Subject;
let pat: Subject;
let bo: Subject;
let cycleId: string;

const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

async function person(role: Role): Promise<Subject> {
  const row = await insertUser(db, {
    accessStatus: role === "requester" ? "pending_department" : "active",
    pcoLeaderVerified: role === "requester",
    pcoVerifiedAt: NOW,
  });
  await db.insert(userRoles).values({ userId: row.id, role });
  return { id: row.id, roles: [role], departments: [] };
}

async function fresh(subject: Subject): Promise<Subject> {
  const result = await loadViewer(db, subject.id);
  if (!result.ok) throw new Error(`No viewer: ${result.reason}`);
  return result.viewer;
}

const ids = (list: { userId: string }[]) => list.map((r) => r.userId).sort();

async function away(who: Subject, from: string, until?: string) {
  const { version } = await run((tx) => getMyAway(tx, who.id, NOW));
  return run((tx) => setMyAway(tx, who, { from, until, version }, { now: NOW }));
}

async function back(who: Subject) {
  const { version } = await run((tx) => getMyAway(tx, who.id, NOW));
  return run((tx) => clearMyAway(tx, who, { version }));
}

const CONTENT: RequestContentInput = {
  title: "Microphones",
  justification: "Every small group needs one.",
  lines: [{ name: "Microphone", quantity: "2", unitPrice: "100.00" }],
};

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  admin = await person("system_admin");
  pat = await person("accountant");
  bo = await person("backup_approver");
  await db.insert(appSettings).values({ key: "primary_accountant_user_id", value: pat.id });
  cycleId = (await insertCycle(db, admin.id)).id;
});

afterAll(async () => {
  await t?.close();
});

describe("isAwayAt", () => {
  it("is away from the first day until the day back", () => {
    const from = new Date("2026-10-20T05:00:00Z");
    const until = new Date("2026-10-23T05:00:00Z");
    expect(isAwayAt({ from, until }, new Date("2026-10-20T04:59:00Z"))).toBe(false);
    expect(isAwayAt({ from, until }, NOW)).toBe(true);
    expect(isAwayAt({ from, until }, until)).toBe(false);
    expect(isAwayAt({ from, until: null }, new Date("2030-01-01"))).toBe(true);
    expect(isAwayAt(null, NOW)).toBe(false);
  });
});

describe("the Primary accountant's Away (FR-33, AC-61)", () => {
  it("AC-61 while the Primary accountant is Away, new-submission emails go to the backup approver", async () => {
    await away(pat, "2026-10-20", "2026-10-23");
    expect(ids(await run((tx) => accountantRecipients(tx, NOW)))).toEqual([bo.id]);
    const cover = await run((tx) => accountantCover(tx, NOW));
    expect(cover).toMatchObject({ primaryAway: true });
    expect(cover.primaryUntil).toEqual(new Date("2026-10-23T05:00:00Z"));

    const leader = await person("requester");
    const dept = await insertDepartment(db);
    const { requestId } = await run((tx) =>
      startRequest(tx, leader, { cycleId, departmentId: dept.id }),
    );
    const me = await fresh(leader);
    const saved = await run((tx) => saveDraft(tx, me, { id: requestId, version: 1, ...CONTENT }));
    await run((tx) =>
      submitRequest(
        tx,
        me,
        { id: requestId, version: saved.version, idempotencyKey: randomUUID() },
        { now: NOW },
      ),
    );
    const sent = await db
      .select()
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.budgetRequestId, requestId),
          eq(emailOutbox.template, "annual.submitted.accountant"),
        ),
      );
    expect(sent.map((e) => e.toUserId)).toEqual([bo.id]);

    // Back on the 23rd: emails come back to the Primary.
    const after = new Date("2026-10-23T06:00:00Z");
    expect(ids(await run((tx) => accountantRecipients(tx, after)))).toEqual([pat.id]);
    await back(pat);
  });

  it("never leaves nobody: with everyone away, the Primary still gets the emails", async () => {
    await away(pat, "2026-10-20");
    await away(bo, "2026-10-20");
    expect(ids(await run((tx) => accountantRecipients(tx, NOW)))).toEqual([pat.id]);
    expect((await run((tx) => accountantCover(tx, NOW))).primaryAway).toBe(false);
    await back(pat);
    await back(bo);
  });

  it("a future Away starts on its day", async () => {
    await away(pat, "2026-10-22");
    expect(ids(await run((tx) => accountantRecipients(tx, NOW)))).toEqual([pat.id]);
    const later = new Date("2026-10-22T06:00:00Z");
    expect(ids(await run((tx) => accountantRecipients(tx, later)))).toEqual([bo.id]);
    await back(pat);
  });

  it("checks the dates, the role and the version, and audits on and off", async () => {
    await expect(away(pat, "2026-10-22", "2026-10-21")).rejects.toBeInstanceOf(ValidationError);
    await expect(away(pat, "2026-10-01", "2026-10-05")).rejects.toBeInstanceOf(ValidationError);
    await expect(away(pat, "not a day")).rejects.toBeInstanceOf(ValidationError);
    const leader = await person("requester");
    await expect(
      run((tx) => setMyAway(tx, leader, { version: 0 }, { now: NOW })),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await away(pat, "2026-10-20");
    // A form shown before that change is stale.
    await expect(
      run((tx) => setMyAway(tx, pat, { from: "2026-10-21", version: 1 }, { now: NOW })),
    ).rejects.toBeInstanceOf(ConflictError);
    await back(pat);
    const audits = await db
      .select({ type: auditEvents.eventType })
      .from(auditEvents)
      .where(eq(auditEvents.actorUserId, pat.id));
    expect(audits.map((a) => a.type)).toEqual(
      expect.arrayContaining(["user.away_set", "user.away_cleared"]),
    );
  });
});

describe("a department's Primary Away (FR-38, AC-119)", () => {
  async function department() {
    const leader = await person("requester");
    const dept = await insertDepartment(db);
    const { requestId } = await run((tx) =>
      startRequest(tx, leader, { cycleId, departmentId: dept.id }),
    );
    const backup = await insertUser(db, { accessStatus: "active", pcoLeaderVerified: true });
    await db.insert(userRoles).values({ userId: backup.id, role: "requester" });
    return { leader, dept, requestId, backupId: backup.id };
  }

  async function addBackup(departmentId: string, userId: string) {
    await db
      .insert(userDepartments)
      .values({ userId, departmentId, representativeType: "backup", backupRank: 1 });
  }

  it("AC-119 while the Primary is Away, the Backup gets the reminder and the department shows the cover", async () => {
    const { leader, dept, requestId, backupId } = await department();
    const me = await fresh(leader);
    // Away needs someone to cover.
    await expect(
      run((tx) => setDepartmentAway(tx, me, { departmentId: dept.id }, { now: NOW })),
    ).rejects.toBeInstanceOf(RuleError);
    await addBackup(dept.id, backupId);
    // From today (the database's clock stamps the question), back in 2099.
    await run((tx) => setDepartmentAway(tx, me, { departmentId: dept.id, until: "2099-01-01" }));
    const cover = await run((tx) => departmentCover(tx, dept.id));
    expect(cover).toMatchObject({ away: true, backups: [{ userId: backupId }] });

    // The accountant asks a question; a day later (under the 3-day delay) the Backup is reminded.
    const saved = await run((tx) => saveDraft(tx, me, { id: requestId, version: 1, ...CONTENT }));
    await run((tx) =>
      submitRequest(
        tx,
        me,
        { id: requestId, version: saved.version, idempotencyKey: randomUUID() },
        { now: NOW },
      ),
    );
    const [{ version }] = await db
      .select({ version: budgetRequests.version })
      .from(budgetRequests)
      .where(eq(budgetRequests.id, requestId));
    await run((tx) =>
      decideRequest(
        tx,
        pat,
        {
          id: requestId,
          version,
          idempotencyKey: randomUUID(),
          decision: { kind: "return", note: "Which microphones?" },
        },
        { now: NOW },
      ),
    );
    const [question] = await db
      .select({ at: approvalDecisions.createdAt })
      .from(approvalDecisions)
      .where(eq(approvalDecisions.budgetRequestId, requestId));
    await runClarificationReminders(db, new Date(question.at.getTime() + DAY + 60_000));
    const reminded = await db
      .select()
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.budgetRequestId, requestId),
          eq(emailOutbox.template, "annual.clarification_backup_reminder"),
        ),
      );
    expect(reminded.map((e) => e.toUserId)).toEqual([backupId]);

    await run((tx) => clearDepartmentAway(tx, me, { departmentId: dept.id }));
    expect((await run((tx) => departmentCover(tx, dept.id))).away).toBe(false);
  });

  it("only the department's Primary (or the administrator) sets it", async () => {
    const { dept, backupId } = await department();
    await addBackup(dept.id, backupId);
    const backup = await fresh({ id: backupId, roles: ["requester"], departments: [] });
    await expect(
      run((tx) => setDepartmentAway(tx, backup, { departmentId: dept.id }, { now: NOW })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await run((tx) => setDepartmentAway(tx, admin, { departmentId: dept.id }, { now: NOW }));
    expect((await run((tx) => departmentCover(tx, dept.id, NOW))).away).toBe(true);
  });
});
