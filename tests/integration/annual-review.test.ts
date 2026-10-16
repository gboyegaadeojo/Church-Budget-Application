import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approvalAdjustments,
  approvalDecisions,
  approvedLineItems,
  auditEvents,
  budgetLineItems,
  budgetRequests,
  userDepartments,
  userRoles,
} from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import type { DecisionInput } from "@/domain/annual/decision";
import { decideRequest, reopenRequest, startReview } from "@/domain/annual/review";
import { getReviewDashboard, getReviewView } from "@/domain/annual/review-queries";
import type { RequestContentInput } from "@/domain/annual/schema";
import { reviseRequest, saveDraft, startRequest, submitRequest } from "@/domain/annual/service";
import { ConflictError, RuleError, ValidationError } from "@/domain/errors";
import { annualReviewTasks } from "@/domain/tasks/annual";
import { loadViewer } from "@/domain/users/viewer";
import { ForbiddenError, type Subject } from "@/lib/authz";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertCycle, insertDepartment, insertUser } from "./helpers/fixtures";

const NOW = new Date("2026-10-20T17:00:00Z"); // before the fixture deadline

let t: TestDb;
let db: Db;
let admin: Subject;
let accountant: Subject;
let cycleId: string;

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

async function requestRow(id: string) {
  const [row] = await db.select().from(budgetRequests).where(eq(budgetRequests.id, id));
  return row;
}

/** 40 microphones at $1,000.00 and a $25.00 stand: $40,025.00 + $4,803.00 tax = $44,828.00. */
const BIG: RequestContentInput = {
  title: "Microphones",
  justification: "Every small group needs one.",
  lines: [
    { name: "Microphone", quantity: "40", unitPrice: "1,000.00" },
    { name: "Stand", quantity: "1", unitPrice: "25.00" },
  ],
};

/** A new department with a submitted request from its Primary. */
async function submitted(content: RequestContentInput = BIG) {
  const leader = await person("requester");
  const dept = await insertDepartment(db);
  const { requestId } = await run((tx) =>
    startRequest(tx, leader, { cycleId, departmentId: dept.id }),
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
  return { me, dept, requestId };
}

async function decide(
  id: string,
  decision: DecisionInput,
  who: Subject = accountant,
  key = randomUUID(),
) {
  const { version } = await requestRow(id);
  return run((tx) =>
    decideRequest(tx, who, { id, version, idempotencyKey: key, decision }, { now: NOW }),
  );
}

async function lineIds(requestId: string) {
  const view = await run((tx) => getReviewView(tx, accountant, requestId));
  return view!.lines.map((l) => l.id);
}

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  admin = await person("system_admin");
  accountant = await person("accountant");
  cycleId = (await insertCycle(db, admin.id)).id;
});

afterAll(async () => {
  await t?.close();
});

describe("accountant dashboard (FR-13, FR-14)", () => {
  it("AC-47 AC-48 lists every expected department; a draft is not counted as submitted", async () => {
    const before = await run((tx) => getReviewDashboard(tx, accountant, { cycleId }));
    const { requestId, dept } = await submitted();
    const draftLeader = await person("requester");
    const draftDept = await insertDepartment(db);
    await run((tx) => startRequest(tx, draftLeader, { cycleId, departmentId: draftDept.id }));
    const quiet = await insertDepartment(db);

    const after = await run((tx) => getReviewDashboard(tx, accountant, { cycleId }));
    expect(after!.counts.expected).toBe(before!.counts.expected + 3);
    expect(after!.counts.submitted).toBe(before!.counts.submitted + 1);
    expect(after!.counts.outstanding).toBe(before!.counts.outstanding + 2);
    expect(after!.counts.awaitingReview).toBe(before!.counts.awaitingReview + 1);
    expect(after!.counts.totalRequestedCents - before!.counts.totalRequestedCents).toBe(4_482_800);

    const row = (id: string) => after!.departments.find((d) => d.departmentId === id)!;
    expect(row(dept.id)).toMatchObject({
      progress: "submitted",
      requestId,
      requestedTotalCents: 4_482_800,
      approvedTotalCents: null,
    });
    expect(row(draftDept.id)).toMatchObject({
      progress: "draft_exists",
      requestId: null,
      requestedTotalCents: null,
    });
    expect(row(quiet.id)).toMatchObject({ progress: "not_submitted", representative: null });
    // Drafts never reach the review queue (DRD 6.6).
    expect(after!.queue.some((r) => r.departmentId === draftDept.id)).toBe(false);
    expect(after!.queue.find((r) => r.requestId === requestId)?.status).toBe("submitted");
  });

  it("filters the queue by status and search, and puts updated requests first", async () => {
    const a = await submitted();
    const b = await submitted();
    await run((tx) => startReview(tx, accountant, { id: b.requestId }));
    const view = await requestRow(b.requestId);
    await run((tx) =>
      reviseRequest(tx, b.me, {
        id: b.requestId,
        version: view.version,
        idempotencyKey: randomUUID(),
        ...BIG,
        title: "Microphones, revised",
      }),
    );
    const dash = await run((tx) => getReviewDashboard(tx, accountant, { cycleId }));
    expect(dash!.queue[0]).toMatchObject({ requestId: b.requestId, status: "updated" });

    const ref = (await requestRow(a.requestId)).referenceNumber!;
    const searched = await run((tx) => getReviewDashboard(tx, accountant, { cycleId, q: ref }));
    expect(searched!.queue.map((r) => r.requestId)).toEqual([a.requestId]);
    const declinedOnly = await run((tx) =>
      getReviewDashboard(tx, accountant, { cycleId, status: "declined" }),
    );
    expect(declinedOnly!.queue.every((r) => r.status === "declined")).toBe(true);
  });

  it("the administrator sees it read-only; a requester doesn't see it", async () => {
    expect((await run((tx) => getReviewDashboard(tx, admin)))!.readOnly).toBe(true);
    const requester = await person("requester");
    expect(await run((tx) => getReviewDashboard(tx, requester))).toBeNull();
  });
});

describe("opening a request (AC-49)", () => {
  it("puts it In Review without changing its version, so a representative can still edit", async () => {
    const { me, requestId } = await submitted();
    const before = await requestRow(requestId);
    expect(await run((tx) => startReview(tx, accountant, { id: requestId }))).toBe(true);
    const after = await requestRow(requestId);
    expect(after).toMatchObject({ status: "in_review", version: before.version });
    // Opening again changes nothing.
    expect(await run((tx) => startReview(tx, accountant, { id: requestId }))).toBe(false);

    const view = await run((tx) => getReviewView(tx, accountant, requestId));
    expect(view).toMatchObject({ status: "in_review", canDecide: true, canReopen: false });
    expect(view!.revisions).toHaveLength(1);

    await run((tx) =>
      reviseRequest(tx, me, {
        id: requestId,
        version: after.version,
        idempotencyKey: randomUUID(),
        ...BIG,
        title: "Microphones for every group",
      }),
    );
    expect((await requestRow(requestId)).status).toBe("updated");
  });

  it("doesn't show drafts", async () => {
    const leader = await person("requester");
    const dept = await insertDepartment(db);
    const { requestId } = await run((tx) =>
      startRequest(tx, leader, { cycleId, departmentId: dept.id }),
    );
    expect(await run((tx) => getReviewView(tx, accountant, requestId))).toBeNull();
  });
});

describe("approving (FR-15, FR-16)", () => {
  it("AC-50 AC-57 approves as requested and records who, when and the approved lines", async () => {
    const { requestId } = await submitted();
    const result = await decide(requestId, { kind: "approve_as_requested" });
    expect(result).toMatchObject({
      status: "approved",
      approved: { subtotal: 4_002_500, tax: 480_300, total: 4_482_800 },
    });
    expect(await requestRow(requestId)).toMatchObject({
      status: "approved",
      approvedTotalCents: 4_482_800,
      approvedAt: NOW,
    });
    const [decision] = await db
      .select()
      .from(approvalDecisions)
      .where(eq(approvalDecisions.budgetRequestId, requestId));
    expect(decision).toMatchObject({
      decision: "approved",
      method: "as_requested",
      approverUserId: accountant.id,
      actingRole: "accountant",
    });
    const lines = await db
      .select()
      .from(approvedLineItems)
      .where(eq(approvedLineItems.approvalDecisionId, decision.id));
    expect(lines.map((l) => l.approvedLineTotalCents).sort()).toEqual([2_500, 4_000_000]);
    const [audit] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.budgetRequestId, requestId),
          eq(auditEvents.eventType, "annual.approved"),
        ),
      );
    expect(audit.details).toMatchObject({ method: "as_requested", after: { status: "approved" } });
  });

  it("AC-35 AC-51 AC-52 approves a different total incl. tax without touching the lines", async () => {
    const { requestId } = await submitted();
    const result = await decide(requestId, {
      kind: "approve_different_amount",
      approvedTotal: "30,000.00",
      note: "Board approved less",
      boardReference: "Board minutes, Nov 12, 2026",
    });
    expect(result.approved).toEqual({ subtotal: 2_678_571, tax: 321_429, total: 3_000_000 });

    const row = await requestRow(requestId);
    // The request keeps what was asked (AC-52).
    expect(row).toMatchObject({
      requestedSubtotalCents: 4_002_500,
      requestedTotalCents: 4_482_800,
      approvedSubtotalCents: 2_678_571,
      approvedTaxCents: 321_429,
      approvedTotalCents: 3_000_000,
    });
    const [decision] = await db
      .select()
      .from(approvalDecisions)
      .where(eq(approvalDecisions.budgetRequestId, requestId));
    expect(decision).toMatchObject({
      method: "different_amount",
      decisionReason: "Board approved less",
      boardReference: "Board minutes, Nov 12, 2026",
    });
    // Lines as asked plus the adjustment reconcile to the approved subtotal.
    const [adjustment] = await db
      .select()
      .from(approvalAdjustments)
      .where(eq(approvalAdjustments.approvalDecisionId, decision.id));
    expect(adjustment.amountCents).toBe(2_678_571 - 4_002_500);
    const [requested] = await db
      .select()
      .from(budgetLineItems)
      .where(eq(budgetLineItems.budgetRequestId, requestId));
    expect(requested.quantity).toBeGreaterThan(0);
  });

  it("AC-69 a different amount of $500.00 stores $446.43 + $53.57", async () => {
    const { requestId } = await submitted();
    const result = await decide(requestId, {
      kind: "approve_different_amount",
      approvedTotal: "500",
      note: "Board approved a small amount",
    });
    expect(result.approved).toEqual({ subtotal: 44_643, tax: 5_357, total: 50_000 });
  });

  it("AC-35 line changes calculate tax forward; quantity 0 excludes an item", async () => {
    const { requestId } = await submitted();
    const [mic, stand] = await lineIds(requestId);
    const result = await decide(requestId, {
      kind: "approve_line_changes",
      note: "Fewer microphones this year",
      lines: [
        { lineId: mic, quantity: "25", unitPrice: "1,000.00", reason: "Phase two next year" },
        { lineId: stand, quantity: "0", unitPrice: "25.00" },
      ],
    });
    // $25,000.00 + 12% = $28,000.00
    expect(result.approved).toEqual({ subtotal: 2_500_000, tax: 300_000, total: 2_800_000 });
    const view = await run((tx) => getReviewView(tx, accountant, requestId));
    expect(view!.approval).toMatchObject({ method: "line_changes", totalCents: 2_800_000 });
    expect(view!.approval!.lines.find((l) => l.lineId === stand)).toMatchObject({
      quantity: 0,
      lineTotalCents: 0,
    });
    expect(view!.approval!.lines.find((l) => l.lineId === mic)?.reason).toBe("Phase two next year");
  });

  it("refuses invalid approvals", async () => {
    const { requestId } = await submitted();
    const [mic, stand] = await lineIds(requestId);
    await expect(
      decide(requestId, { kind: "approve_different_amount", approvedTotal: "0", note: "x" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      decide(requestId, { kind: "approve_different_amount", approvedTotal: "30,000", note: " " }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      decide(requestId, {
        kind: "approve_line_changes",
        note: "Same as asked",
        lines: [
          { lineId: mic, quantity: "40", unitPrice: "1,000.00" },
          { lineId: stand, quantity: "1", unitPrice: "25.00" },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      decide(requestId, {
        kind: "approve_line_changes",
        note: "Missing a line",
        lines: [{ lineId: mic, quantity: "1", unitPrice: "1.00" }],
      }),
    ).rejects.toBeInstanceOf(RuleError);
    expect((await requestRow(requestId)).status).toBe("submitted");
  });

  it("a repeated idempotency key returns the first decision and records one", async () => {
    const { requestId } = await submitted();
    const key = randomUUID();
    const first = await decide(requestId, { kind: "approve_as_requested" }, accountant, key);
    const again = await run((tx) =>
      decideRequest(
        tx,
        accountant,
        {
          id: requestId,
          version: 1,
          idempotencyKey: key,
          decision: { kind: "decline", note: "x" },
        },
        { now: NOW },
      ),
    );
    expect(again).toEqual(first);
    const rows = await db
      .select()
      .from(approvalDecisions)
      .where(eq(approvalDecisions.budgetRequestId, requestId));
    expect(rows).toHaveLength(1);
  });

  it("refuses a decision on a version the department has since changed", async () => {
    const { me, requestId } = await submitted();
    await run((tx) => startReview(tx, accountant, { id: requestId }));
    const seen = await requestRow(requestId);
    await run((tx) =>
      reviseRequest(tx, me, {
        id: requestId,
        version: seen.version,
        idempotencyKey: randomUUID(),
        ...BIG,
        title: "Changed while reviewing",
      }),
    );
    await expect(
      run((tx) =>
        decideRequest(tx, accountant, {
          id: requestId,
          version: seen.version,
          idempotencyKey: randomUUID(),
          decision: { kind: "approve_as_requested" },
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("return, decline and reopen (FR-17, FR-18, FR-18a)", () => {
  it("AC-54 AC-42 returns with a comment; the answer uses no edit and comes back for review", async () => {
    const { me, requestId } = await submitted();
    await expect(decide(requestId, { kind: "return", note: "" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await decide(requestId, { kind: "return", note: "Which microphones?" });
    const returned = await requestRow(requestId);
    expect(returned.status).toBe("returned");

    await run((tx) =>
      reviseRequest(tx, me, {
        id: requestId,
        version: returned.version,
        idempotencyKey: randomUUID(),
        ...BIG,
        justification: "Shure SM58, the ones the youth team uses.",
      }),
    );
    expect(await requestRow(requestId)).toMatchObject({ status: "updated", editCount: 0 });
    const view = await run((tx) => getReviewView(tx, accountant, requestId));
    expect(view!.revisions.map((r) => r.kind)).toEqual(["clarification_response", "submission"]);
    expect(view!.decisions[0]).toMatchObject({
      decision: "returned",
      reason: "Which microphones?",
    });
  });

  it("AC-55 AC-46 declines with a reason; the request is then read-only", async () => {
    const { me, requestId } = await submitted();
    await expect(decide(requestId, { kind: "decline", note: "  " })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await decide(requestId, { kind: "decline", note: "No funds this year" });
    const row = await requestRow(requestId);
    expect(row).toMatchObject({ status: "declined", declinedAt: NOW, approvedTotalCents: null });
    await expect(
      run((tx) =>
        reviseRequest(tx, me, {
          id: requestId,
          version: row.version,
          idempotencyKey: randomUUID(),
          ...BIG,
          title: "Please reconsider",
        }),
      ),
    ).rejects.toBeInstanceOf(RuleError);
    await expect(decide(requestId, { kind: "approve_as_requested" })).rejects.toBeInstanceOf(
      RuleError,
    );
  });

  it("reopens an approved budget; the department removes an item and it is approved again", async () => {
    const { me, requestId } = await submitted();
    await decide(requestId, { kind: "approve_as_requested" });
    const approved = await requestRow(requestId);
    await expect(
      run((tx) =>
        reopenRequest(tx, accountant, {
          id: requestId,
          version: approved.version,
          idempotencyKey: randomUUID(),
          reason: "",
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await run((tx) =>
      reopenRequest(tx, accountant, {
        id: requestId,
        version: approved.version,
        idempotencyKey: randomUUID(),
        reason: "The board reconsidered",
      }),
    );
    const reopened = await requestRow(requestId);
    expect(reopened).toMatchObject({ status: "returned", approvedTotalCents: null, editCount: 0 });

    // Removing an item the old approval points to keeps that line as history.
    await run((tx) =>
      reviseRequest(tx, me, {
        id: requestId,
        version: reopened.version,
        idempotencyKey: randomUUID(),
        ...BIG,
        lines: [BIG.lines![0]],
      }),
    );
    const allLines = await db
      .select()
      .from(budgetLineItems)
      .where(eq(budgetLineItems.budgetRequestId, requestId));
    expect(allLines.filter((l) => l.supersededAt === null)).toHaveLength(1);
    expect(allLines.filter((l) => l.supersededAt !== null)).toHaveLength(2);

    const second = await decide(requestId, { kind: "approve_as_requested" });
    expect(second.approved?.total).toBe(4_480_000);
    const view = await run((tx) => getReviewView(tx, accountant, requestId));
    expect(view!.lines).toHaveLength(1);
    expect(view!.decisions.map((d) => d.decision)).toEqual(["approved", "reopened", "approved"]);
  });

  it("only approved or declined requests can be reopened", async () => {
    const { requestId } = await submitted();
    const row = await requestRow(requestId);
    await expect(
      run((tx) =>
        reopenRequest(tx, accountant, {
          id: requestId,
          version: row.version,
          idempotencyKey: randomUUID(),
          reason: "Why not",
        }),
      ),
    ).rejects.toBeInstanceOf(RuleError);
  });
});

describe("who may decide (Requirements 3.6, FR-33)", () => {
  it("AC-62 an accountant who represents the department cannot decide its request", async () => {
    const { requestId, dept } = await submitted();
    await db.insert(userRoles).values({ userId: accountant.id, role: "requester" });
    await db.insert(userDepartments).values({
      userId: accountant.id,
      departmentId: dept.id,
      representativeType: "representative",
      source: "manual",
      assignedByUserId: admin.id,
    });
    const both = await fresh(accountant);
    const view = await run((tx) => getReviewView(tx, both, requestId));
    expect(view).toMatchObject({ canDecide: false, blockedReason: "conflict_of_interest" });
    expect(await run((tx) => startReview(tx, both, { id: requestId }))).toBe(false);
    await expect(decide(requestId, { kind: "approve_as_requested" }, both)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await db.delete(userDepartments).where(eq(userDepartments.userId, accountant.id));
    await db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, accountant.id), eq(userRoles.role, "requester")));
  });

  it("the administrator can read but not decide", async () => {
    const { requestId } = await submitted();
    const view = await run((tx) => getReviewView(tx, admin, requestId));
    expect(view).toMatchObject({ canDecide: false, readOnly: true });
    await expect(decide(requestId, { kind: "approve_as_requested" }, admin)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("accountant tasks (FR-37)", () => {
  it("lists requests waiting for review, but not ones the accountant must not decide", async () => {
    const { requestId } = await submitted();
    const me = await loadViewer(db, accountant.id);
    if (!me.ok) throw new Error(me.reason);
    const tasks = await run((tx) => annualReviewTasks(tx, me.viewer));
    expect(tasks.find((t) => t.href === `/annual/review/${requestId}`)).toMatchObject({
      action: "Review budget request",
      amountCents: 4_482_800,
    });
    await decide(requestId, { kind: "approve_as_requested" });
    const after = await run((tx) => annualReviewTasks(tx, me.viewer));
    expect(after.some((t) => t.href === `/annual/review/${requestId}`)).toBe(false);
  });
});
