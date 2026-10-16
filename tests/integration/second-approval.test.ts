import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { budgetCycles, budgetRequests, emailOutbox, userRoles } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import type { DecisionInput } from "@/domain/annual/decision";
import { getRequestView } from "@/domain/annual/queries";
import { releaseNow, setReleaseSchedule } from "@/domain/annual/release";
import { decideRequest, secondDecideRequest } from "@/domain/annual/review";
import { getReviewView } from "@/domain/annual/review-queries";
import type { RequestContentInput } from "@/domain/annual/schema";
import { saveDraft, startRequest, submitRequest } from "@/domain/annual/service";
import { RuleError, ValidationError } from "@/domain/errors";
import { secondApprovalThreshold } from "@/domain/settings";
import { settingVersions, updateSecondApprovalThreshold } from "@/domain/settings/service";
import { annualReviewTasks } from "@/domain/tasks/annual";
import { loadViewer } from "@/domain/users/viewer";
import { ForbiddenError, type Subject } from "@/lib/authz";
import type { Role, Viewer } from "@/lib/roles";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertCycle, insertDepartment, insertUser } from "./helpers/fixtures";

/* Second approval for large annual budgets (FR-34). */

const NOW = new Date("2026-10-20T17:00:00Z");

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

/** 40 microphones at $1,000.00: $40,000.00 + $4,800.00 tax = $44,800.00. */
const BIG: RequestContentInput = {
  title: "Microphones",
  justification: "Every small group needs one.",
  lines: [{ name: "Microphone", quantity: "40", unitPrice: "1,000.00" }],
};
/** 2 at $100.00: $224.00 with tax. */
const SMALL: RequestContentInput = {
  ...BIG,
  lines: [{ name: "Stand", quantity: "2", unitPrice: "100.00" }],
};

async function submitted(content: RequestContentInput, cycle = cycleId) {
  const leader = await person("requester");
  const dept = await insertDepartment(db);
  const { requestId } = await run((tx) =>
    startRequest(tx, leader, { cycleId: cycle, departmentId: dept.id }),
  );
  const me = await fresh(leader);
  const saved = await run((tx) => saveDraft(tx, me, { id: requestId, version: 1, ...content }));
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

async function versionOf(id: string) {
  const [row] = await db.select().from(budgetRequests).where(eq(budgetRequests.id, id));
  return row;
}

async function decide(id: string, decision: DecisionInput, who = pat, now = NOW) {
  const { version } = await versionOf(id);
  return run((tx) =>
    decideRequest(tx, who, { id, version, idempotencyKey: randomUUID(), decision }, { now }),
  );
}

async function second(
  id: string,
  decision: { kind: "approve" } | { kind: "refuse"; note: string },
  who = bo,
  now = NOW,
) {
  const { version } = await versionOf(id);
  return run((tx) =>
    secondDecideRequest(tx, who, { id, version, idempotencyKey: randomUUID(), decision }, { now }),
  );
}

const emails = (requestId: string, template: string) =>
  db
    .select()
    .from(emailOutbox)
    .where(and(eq(emailOutbox.budgetRequestId, requestId), eq(emailOutbox.template, template)));

async function setThreshold(amount: string) {
  const versions = await run((tx) => settingVersions(tx, ["second_approval_threshold"]));
  return run((tx) => updateSecondApprovalThreshold(tx, admin, { amount, versions }));
}

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  admin = await person("system_admin");
  pat = await person("accountant");
  bo = await person("backup_approver");
  cycleId = (await insertCycle(db, admin.id)).id;
});

afterAll(async () => {
  await t?.close();
});

describe("the threshold setting", () => {
  it("is off by default, takes an amount, refuses nonsense, and is off again when empty", async () => {
    expect(await run((tx) => secondApprovalThreshold(tx))).toBeNull();
    await expect(setThreshold("ten thousand")).rejects.toBeInstanceOf(ValidationError);
    await expect(setThreshold("0")).rejects.toBeInstanceOf(ValidationError);
    await setThreshold("$10,000.00");
    expect(await run((tx) => secondApprovalThreshold(tx))).toBe(1_000_000);
    await setThreshold("");
    expect(await run((tx) => secondApprovalThreshold(tx))).toBeNull();
    await setThreshold("10,000.00");
  });
});

describe("second approval (FR-34)", () => {
  it("approvals under the threshold are final as before", async () => {
    const { requestId } = await submitted(SMALL);
    expect(await decide(requestId, { kind: "approve_as_requested" })).toMatchObject({
      status: "approved",
    });
  });

  it("an approval at or above it waits for a different accountant, who gives it", async () => {
    const { me, requestId } = await submitted(BIG);
    const first = await decide(requestId, { kind: "approve_as_requested" });
    expect(first.status).toBe("awaiting_second_approval");
    const row = await versionOf(requestId);
    expect(row).toMatchObject({ approvedTotalCents: null, approvedAt: null });

    // The department hears it's awaiting sign-off; the other approver is asked; nobody
    // gets the approval yet.
    expect((await emails(requestId, "annual.awaiting_second")).map((e) => e.toUserId)).toEqual([
      me.id,
    ]);
    expect((await emails(requestId, "annual.second_needed")).map((e) => e.toUserId)).toEqual([
      bo.id,
    ]);
    expect(await emails(requestId, "annual.approved")).toEqual([]);
    const theirs = await run((tx) => getRequestView(tx, me, requestId));
    expect(theirs).toMatchObject({ status: "awaiting_second_approval", decision: null });

    // Only someone else gives it: Bo has the task, Pat doesn't.
    const boTasks = await run((tx) => annualReviewTasks(tx, bo as Viewer));
    expect(boTasks.find((x) => x.href.endsWith(requestId))?.action).toBe(
      "Give the second approval",
    );
    const patTasks = await run((tx) => annualReviewTasks(tx, pat as Viewer));
    expect(patTasks.some((x) => x.href.endsWith(requestId))).toBe(false);
    await expect(second(requestId, { kind: "approve" }, pat)).rejects.toBeInstanceOf(RuleError);
    const review = await run((tx) => getReviewView(tx, bo, requestId));
    expect(review).toMatchObject({
      second: { canGive: true },
      approval: { totalCents: 4_480_000 },
    });

    const result = await second(requestId, { kind: "approve" });
    expect(result).toMatchObject({ status: "approved", heldUntil: null });
    expect(await versionOf(requestId)).toMatchObject({
      status: "approved",
      approvedTotalCents: 4_480_000,
    });
    expect((await emails(requestId, "annual.approved")).map((e) => e.toUserId)).toEqual([me.id]);
  });

  it("a refusal needs a reason and sends the budget back to In Review", async () => {
    const { requestId } = await submitted(BIG);
    await decide(requestId, { kind: "approve_as_requested" });
    await expect(second(requestId, { kind: "refuse", note: "  " })).rejects.toBeInstanceOf(
      ValidationError,
    );
    const result = await second(requestId, { kind: "refuse", note: "Check the quantity." });
    expect(result.status).toBe("in_review");
    const refused = await emails(requestId, "annual.second_refused");
    expect(refused.map((e) => e.toUserId)).toContain(pat.id);
    expect(refused[0].textBody).toContain("Check the quantity.");
    // The accountant decides again.
    expect(await decide(requestId, { kind: "decline", note: "Not this year." })).toMatchObject({
      status: "declined",
    });
  });

  it("nobody who leads the department gives it", async () => {
    const { dept, requestId } = await submitted(BIG);
    await decide(requestId, { kind: "approve_as_requested" });
    const conflicted: Subject = {
      id: bo.id,
      roles: ["backup_approver"],
      departments: [{ id: dept.id, name: dept.name, representativeType: "representative" }],
    };
    await expect(second(requestId, { kind: "approve" }, conflicted)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("while decisions are held, the department sees In Review and the final approval waits", async () => {
    const [cycle] = await db
      .insert(budgetCycles)
      .values({
        name: "FY2060",
        budgetYear: 2060,
        startDate: "2060-01-01",
        submissionDeadline: new Date("2026-11-30T08:00:00Z"),
        defaultTaxRate: "0.1200",
        status: "open",
        createdByUserId: admin.id,
      })
      .returning();
    const { me, requestId } = await submitted(BIG, cycle.id);
    await run((tx) =>
      setReleaseSchedule(
        tx,
        pat,
        { cycleId: cycle.id, version: 1, mode: "scheduled", releaseAt: "2026-12-01T09:00" },
        { now: NOW },
      ),
    );
    await decide(requestId, { kind: "approve_as_requested" });
    expect(await emails(requestId, "annual.awaiting_second")).toEqual([]);
    expect((await run((tx) => getRequestView(tx, me, requestId)))!.status).toBe("in_review");

    expect(await second(requestId, { kind: "approve" })).toMatchObject({ status: "approved" });
    expect(await emails(requestId, "annual.approved")).toEqual([]);
    expect((await run((tx) => getRequestView(tx, me, requestId)))!.status).toBe("in_review");

    const [{ version }] = await db
      .select({ version: budgetCycles.version })
      .from(budgetCycles)
      .where(eq(budgetCycles.id, cycle.id));
    const released = await run((tx) =>
      releaseNow(
        tx,
        pat,
        { cycleId: cycle.id, version, idempotencyKey: randomUUID() },
        { now: NOW },
      ),
    );
    expect(released.released).toBe(1);
    expect((await emails(requestId, "annual.approved")).map((e) => e.toUserId)).toEqual([me.id]);
  });
});
