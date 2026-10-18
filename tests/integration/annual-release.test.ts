import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approvalDecisions,
  auditEvents,
  budgetCycles,
  budgetRequests,
  emailOutbox,
  userRoles,
} from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { listActivity } from "@/domain/analytics/activity";
import type { DecisionInput } from "@/domain/annual/decision";
import { departmentPicker, getRequestView, listMyRequests } from "@/domain/annual/queries";
import {
  getReleaseOverview,
  isHolding,
  releaseNow,
  runScheduledReleases,
  setReleaseSchedule,
} from "@/domain/annual/release";
import { decideRequest, reopenRequest } from "@/domain/annual/review";
import { getReviewView } from "@/domain/annual/review-queries";
import type { RequestContentInput } from "@/domain/annual/schema";
import { saveDraft, startRequest, submitRequest } from "@/domain/annual/service";
import { RuleError, ValidationError } from "@/domain/errors";
import { globalSearch } from "@/domain/search";
import { loadViewer } from "@/domain/users/viewer";
import { ForbiddenError, type Subject } from "@/lib/authz";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertCycle, insertDepartment, insertUser } from "./helpers/fixtures";

/*
 * Scheduled release of annual budget decisions (FR-19a, AC-17 to AC-19). The church is
 * in Winnipeg: Dec 1, 2026 at 9:00 a.m. is 15:00 UTC (Central Standard Time).
 */

const NOW = new Date("2026-10-20T17:00:00Z");
const RELEASE_LOCAL = "2026-12-01T09:00";
const RELEASE_UTC = new Date("2026-12-01T15:00:00Z");
const MESSAGE = "Thank you for your work this year. The board approved the budget on Nov 12.";

let t: TestDb;
let db: Db;
let admin: Subject;
let accountant: Subject;

const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

async function person(role: "accountant" | "requester" | "system_admin"): Promise<Subject> {
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

const CONTENT: RequestContentInput = {
  title: "Microphones",
  justification: "Every small group needs one.",
  lines: [{ name: "Microphone", quantity: "2", unitPrice: "100.00" }],
};

/** A new department with a submitted request from its leader. */
async function submitted(cycleId: string) {
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
  return { me: await fresh(leader), dept, requestId };
}

async function decide(id: string, decision: DecisionInput, now = NOW) {
  const [{ version }] = await db
    .select({ version: budgetRequests.version })
    .from(budgetRequests)
    .where(eq(budgetRequests.id, id));
  return run((tx) =>
    decideRequest(tx, accountant, { id, version, idempotencyKey: randomUUID(), decision }, { now }),
  );
}

async function cycleVersion(id: string) {
  const [row] = await db
    .select({ v: budgetCycles.version })
    .from(budgetCycles)
    .where(eq(budgetCycles.id, id));
  return row.v;
}

async function hold(cycleId: string, releaseAt = RELEASE_LOCAL, message = MESSAGE) {
  const version = await cycleVersion(cycleId);
  return run((tx) =>
    setReleaseSchedule(
      tx,
      accountant,
      { cycleId, version, mode: "scheduled", releaseAt, message },
      { now: NOW },
    ),
  );
}

const emailsAbout = (requestId: string, template: string) =>
  db
    .select()
    .from(emailOutbox)
    .where(and(eq(emailOutbox.budgetRequestId, requestId), eq(emailOutbox.template, template)));

async function decisionsOf(requestId: string) {
  return db
    .select()
    .from(approvalDecisions)
    .where(eq(approvalDecisions.budgetRequestId, requestId));
}

let year = 2040;
async function newCycle() {
  year += 1;
  return insertCycle(db, admin.id, { budgetYear: year, name: `FY${year}` });
}

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  admin = await person("system_admin");
  accountant = await person("accountant");
});

afterAll(async () => {
  await t?.close();
});

describe("isHolding", () => {
  it("holds only in Hold mode before the release time", () => {
    const at = RELEASE_UTC;
    expect(isHolding({ decisionEmailMode: "immediate", decisionReleaseAt: null }, NOW)).toBe(false);
    expect(isHolding({ decisionEmailMode: "scheduled", decisionReleaseAt: at }, NOW)).toBe(true);
    expect(isHolding({ decisionEmailMode: "scheduled", decisionReleaseAt: at }, at)).toBe(false);
  });
});

describe("Send immediately (AC-17)", () => {
  it("AC-17 the department gets the approval email when the accountant confirms", async () => {
    const cycle = await newCycle();
    const { requestId } = await submitted(cycle.id);
    const result = await decide(requestId, { kind: "approve_as_requested" });
    expect(result.heldUntil).toBeNull();
    expect(await emailsAbout(requestId, "annual.approved")).toHaveLength(1);
    const [decision] = await decisionsOf(requestId);
    expect(decision.releasedAt).toEqual(NOW);
  });
});

describe("Hold and release on a schedule (AC-18)", () => {
  it("AC-18 departments see In Review until Dec 1, 9:00 a.m., then all get their emails by 9:15", async () => {
    const cycle = await newCycle();
    const a = await submitted(cycle.id);
    const b = await submitted(cycle.id);
    const c = await submitted(cycle.id);
    await hold(cycle.id);
    const [stored] = await db.select().from(budgetCycles).where(eq(budgetCycles.id, cycle.id));
    expect(stored.decisionReleaseAt).toEqual(RELEASE_UTC);

    // Decisions are saved and locked, with no release time and no email to the department.
    const approved = await decide(a.requestId, { kind: "approve_as_requested" });
    expect(approved.heldUntil).toBe(RELEASE_UTC.toISOString());
    await decide(b.requestId, { kind: "decline", note: "Not this year." });
    expect(await emailsAbout(a.requestId, "annual.approved")).toEqual([]);
    expect(await emailsAbout(b.requestId, "annual.declined")).toEqual([]);
    const [copy] = await emailsAbout(a.requestId, "annual.approved.accountant");
    expect(copy.textBody).toContain("will be sent the approval on Dec 1, 2026");

    // A question is never held.
    await decide(c.requestId, { kind: "return", note: "Which microphones?" });
    expect(await emailsAbout(c.requestId, "annual.returned")).toHaveLength(1);

    // The department sees In Review, no amount, nothing to change, and the release date.
    const theirs = await run((tx) => getRequestView(tx, a.me, a.requestId));
    expect(theirs).toMatchObject({ status: "in_review", decision: null });
    expect(theirs!.heldUntil).toEqual(RELEASE_UTC);
    const mine = await run((tx) => listMyRequests(tx, a.me));
    expect(mine.find((r) => r.id === a.requestId)!.status).toBe("in_review");
    const found = await run((tx) => globalSearch(tx, a.me, "Microphones"));
    expect(found.find((r) => r.href.endsWith(a.requestId))!.detail).toContain("In Review");
    const history = await listActivity(db, a.me, { requestId: a.requestId });
    expect(history.items.map((i) => i.eventType)).not.toContain("annual.approved");

    // The accountant sees the decision straight away.
    const review = await run((tx) => getReviewView(tx, accountant, a.requestId));
    expect(review).toMatchObject({ status: "approved", release: { holding: true } });

    // A day ahead: one warning about the undecided department, however often the job runs.
    const dayBefore = new Date("2026-11-30T15:30:00Z");
    expect(await runScheduledReleases(db, dayBefore)).toMatchObject({ released: 0 });
    await runScheduledReleases(db, dayBefore);
    const warnings = await db
      .select()
      .from(emailOutbox)
      .where(
        and(eq(emailOutbox.cycleId, cycle.id), eq(emailOutbox.template, "annual.release_warning")),
      );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].textBody).toContain(`${c.dept.name}: Submitted, not decided yet`);

    // The 15-minute job after 9:00 releases both held decisions, once.
    const at = new Date("2026-12-01T15:10:00Z");
    expect(await runScheduledReleases(db, at)).toMatchObject({ released: 2, summaries: 1 });
    expect(await runScheduledReleases(db, at)).toMatchObject({ released: 0, summaries: 0 });
    const [email] = await emailsAbout(a.requestId, "annual.approved");
    expect(email.textBody).toContain(MESSAGE);
    expect(await emailsAbout(b.requestId, "annual.declined")).toHaveLength(1);
    const [released] = await decisionsOf(a.requestId);
    expect(released.releasedAt).toEqual(at);
    const audits = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, "annual.decision_released"),
          eq(auditEvents.budgetRequestId, a.requestId),
        ),
      );
    expect(audits).toHaveLength(1);

    // Now the department sees it, and later decisions go straight out.
    const after = await run((tx) => getRequestView(tx, a.me, a.requestId));
    expect(after).toMatchObject({ status: "approved", heldUntil: null });
    expect(after!.decision!.approved!.total).toBe(22_400);
    const late = await submitted(cycle.id);
    const result = await decide(late.requestId, { kind: "approve_as_requested" }, at);
    expect(result.heldUntil).toBeNull();
    expect(await emailsAbout(late.requestId, "annual.approved")).toHaveLength(1);
  });

  it("refuses a release time in the past, and anyone but the accountants", async () => {
    const cycle = await newCycle();
    await expect(hold(cycle.id, "2026-10-01T09:00")).rejects.toBeInstanceOf(ValidationError);
    await expect(hold(cycle.id, "not a date")).rejects.toBeInstanceOf(ValidationError);
    const leader = await person("requester");
    for (const who of [leader, admin]) {
      await expect(
        run((tx) =>
          setReleaseSchedule(
            tx,
            who,
            { cycleId: cycle.id, version: 1, mode: "scheduled", releaseAt: RELEASE_LOCAL },
            { now: NOW },
          ),
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
    // The administrator can read the plan, but not change it.
    const overview = await run((tx) => getReleaseOverview(tx, admin, cycle.id, NOW));
    expect(overview).toMatchObject({ canChange: false, holding: false });
  });

  it("a reopened held approval is never sent", async () => {
    const cycle = await newCycle();
    const a = await submitted(cycle.id);
    await hold(cycle.id);
    await decide(a.requestId, { kind: "approve_as_requested" });
    const [{ version }] = await db
      .select({ version: budgetRequests.version })
      .from(budgetRequests)
      .where(eq(budgetRequests.id, a.requestId));
    await run((tx) =>
      reopenRequest(
        tx,
        accountant,
        { id: a.requestId, version, idempotencyKey: randomUUID(), reason: "Board asked again." },
        { now: NOW },
      ),
    );
    await runScheduledReleases(db, new Date("2026-12-01T15:10:00Z"));
    expect(await emailsAbout(a.requestId, "annual.approved")).toEqual([]);
  });
});

describe("A held decision on the department's own pages (docs/decisions.md 2026-10-18)", () => {
  /** Gives a department's leader a staff role as well. */
  async function alsoStaff(leader: Subject, role: "church_admin" | "board_chair") {
    await db.insert(userRoles).values({ userId: leader.id, role });
    return fresh(leader);
  }

  async function seenBy(viewer: Subject, requestId: string, cycleId: string) {
    const view = await run((tx) => getRequestView(tx, viewer, requestId));
    const mine = await run((tx) => listMyRequests(tx, viewer));
    const picker = await run((tx) => departmentPicker(tx, viewer, cycleId));
    const choice = picker.choices.find((c) => c.existing?.requestId === requestId);
    const history = await listActivity(db, viewer, { requestId });
    return {
      status: view?.status,
      decision: view?.decision ?? null,
      listed: mine.find((r) => r.id === requestId)?.status,
      picker: choice?.existing,
      events: history.items.map((i) => i.eventType),
    };
  }

  it("every leader of the department sees In Review until release, whatever other roles they hold", async () => {
    const cycle = await newCycle();
    const pure = await submitted(cycle.id);
    const admins = await submitted(cycle.id);
    const chairs = await submitted(cycle.id);
    await hold(cycle.id);
    for (const r of [pure, admins, chairs]) {
      await decide(r.requestId, { kind: "approve_as_requested" });
    }
    const churchAdmin = await alsoStaff(admins.me, "church_admin");
    const boardChair = await alsoStaff(chairs.me, "board_chair");

    for (const [viewer, requestId] of [
      [pure.me, pure.requestId],
      [churchAdmin, admins.requestId],
      [boardChair, chairs.requestId],
    ] as const) {
      const seen = await seenBy(viewer, requestId, cycle.id);
      expect(seen).toMatchObject({ status: "in_review", decision: null, listed: "in_review" });
      expect(seen.picker).toMatchObject({ status: "in_review", editable: false });
      expect(seen.events).not.toContain("annual.approved");
    }

    // Staff screens still show the truth, and so does another department's budget.
    const review = await run((tx) => getReviewView(tx, accountant, admins.requestId));
    expect(review).toMatchObject({ status: "approved", release: { holding: true } });
    const other = await run((tx) => getRequestView(tx, churchAdmin, pure.requestId));
    expect(other).toMatchObject({ status: "approved" });
    const overview = await run((tx) => getReleaseOverview(tx, accountant, cycle.id, NOW));
    expect(overview!.held.map((h) => h.requestId)).toContain(chairs.requestId);

    // After Release now, every leader sees Approved.
    const later = new Date("2026-10-25T17:00:00Z");
    const input = { cycleId: cycle.id, version: await cycleVersion(cycle.id) };
    await run((tx) =>
      releaseNow(tx, accountant, { ...input, idempotencyKey: randomUUID() }, { now: later }),
    );
    for (const [viewer, requestId] of [
      [pure.me, pure.requestId],
      [churchAdmin, admins.requestId],
      [boardChair, chairs.requestId],
    ] as const) {
      const seen = await seenBy(viewer, requestId, cycle.id);
      expect(seen).toMatchObject({ status: "approved", listed: "approved" });
      expect(seen.decision).not.toBeNull();
      expect(seen.picker).toMatchObject({ status: "approved" });
      expect(seen.events).toContain("annual.approved");
    }
  });
});

describe("Release now and Cancel schedule (AC-19)", () => {
  it("AC-19 Release now sends every held decision at once; decisions after it go immediately", async () => {
    const cycle = await newCycle();
    const a = await submitted(cycle.id);
    const b = await submitted(cycle.id);
    await hold(cycle.id);
    await decide(a.requestId, { kind: "approve_as_requested" });
    await decide(b.requestId, { kind: "approve_as_requested" });
    const overview = await run((tx) => getReleaseOverview(tx, accountant, cycle.id, NOW));
    expect(overview!.held.map((h) => h.requestId).sort()).toEqual(
      [a.requestId, b.requestId].sort(),
    );

    const later = new Date("2026-10-25T17:00:00Z");
    const key = randomUUID();
    const version = await cycleVersion(cycle.id);
    const input = { cycleId: cycle.id, version, idempotencyKey: key };
    const first = await run((tx) => releaseNow(tx, accountant, input, { now: later }));
    expect(first.released).toBe(2);
    // A double click is a no-op.
    expect(await run((tx) => releaseNow(tx, accountant, input, { now: later }))).toEqual(first);
    expect(await emailsAbout(a.requestId, "annual.approved")).toHaveLength(1);
    expect(await emailsAbout(b.requestId, "annual.approved")).toHaveLength(1);

    const c = await submitted(cycle.id);
    const result = await decide(c.requestId, { kind: "approve_as_requested" }, later);
    expect(result.heldUntil).toBeNull();
    expect(await emailsAbout(c.requestId, "annual.approved")).toHaveLength(1);
  });

  it("AC-19 Release now still works after the release time if the job hasn't run", async () => {
    const cycle = await newCycle();
    const a = await submitted(cycle.id);
    await hold(cycle.id);
    await decide(a.requestId, { kind: "approve_as_requested" });

    // Past Dec 1, 9:00 a.m., but the 15-minute job never ran (as on a local server).
    const after = new Date("2026-12-01T16:00:00Z");
    const overview = await run((tx) => getReleaseOverview(tx, accountant, cycle.id, after));
    expect(overview!.holding).toBe(false);
    expect(overview!.held.map((h) => h.requestId)).toEqual([a.requestId]);

    const input = { cycleId: cycle.id, version: await cycleVersion(cycle.id) };
    const result = await run((tx) =>
      releaseNow(tx, accountant, { ...input, idempotencyKey: randomUUID() }, { now: after }),
    );
    expect(result.released).toBe(1);
    expect(await emailsAbout(a.requestId, "annual.approved")).toHaveLength(1);

    // Once nothing is held, there's nothing to release.
    const again = { cycleId: cycle.id, version: await cycleVersion(cycle.id) };
    await expect(
      run((tx) =>
        releaseNow(tx, accountant, { ...again, idempotencyKey: randomUUID() }, { now: after }),
      ),
    ).rejects.toThrow(RuleError);
  });

  it("Cancel schedule sends what's held and goes back to sending immediately", async () => {
    const cycle = await newCycle();
    const a = await submitted(cycle.id);
    await hold(cycle.id);
    await decide(a.requestId, { kind: "decline", note: "Not this year." });
    const version = await cycleVersion(cycle.id);
    const result = await run((tx) =>
      setReleaseSchedule(
        tx,
        accountant,
        { cycleId: cycle.id, version, mode: "immediate" },
        { now: NOW },
      ),
    );
    expect(result).toEqual({ mode: "immediate", released: 1 });
    expect(await emailsAbout(a.requestId, "annual.declined")).toHaveLength(1);
    const [stored] = await db.select().from(budgetCycles).where(eq(budgetCycles.id, cycle.id));
    expect(stored).toMatchObject({ decisionEmailMode: "immediate", decisionReleaseAt: null });
  });
});
