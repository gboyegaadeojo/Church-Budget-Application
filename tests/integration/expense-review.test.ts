import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expenseDecisions, expenseSubmissions } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { RuleError } from "@/domain/errors";
import { budgetFigures } from "@/domain/expenses/budget";
import { getExpenseView } from "@/domain/expenses/queries";
import { accountantDecide, startExpenseReview } from "@/domain/expenses/review";
import { accountantQueue, warningsFor } from "@/domain/expenses/review-queries";
import { editExpense, loadExpense } from "@/domain/expenses/service";
import { ForbiddenError } from "@/lib/authz";
import { createTestDb, type TestDb } from "./helpers/db";
import { CLAIM, expenseWorld, person, PURCHASE, submitted } from "./helpers/expenses";

/** Level 1, the accountant (6B.4). */

let t: TestDb;
let db: Db;
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t?.close();
});

async function decide(
  actor: Parameters<typeof accountantDecide>[1],
  id: string,
  decision: unknown,
) {
  const row = await loadExpense(db, id);
  return run((tx) =>
    accountantDecide(tx, actor, {
      id,
      version: row.version,
      idempotencyKey: randomUUID(),
      decision,
    }),
  );
}

describe("starting the review (FR-44, AC-71)", () => {
  it("moves Submitted to In Review when an accountant opens it; the department can't edit", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    expect(await run((tx) => startExpenseReview(tx, world.accountant, { id: expenseId }))).toBe(
      true,
    );
    expect((await loadExpense(db, expenseId)).status).toBe("in_review");
    const row = await loadExpense(db, expenseId);
    await expect(
      run((tx) =>
        editExpense(tx, world.requester, {
          id: expenseId,
          version: row.version,
          idempotencyKey: randomUUID(),
          ...PURCHASE,
          title: "Changed",
        }),
      ),
    ).rejects.toThrow(RuleError);
  });

  it("isn't started by someone who can't decide it", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    expect(await run((tx) => startExpenseReview(tx, world.chair, { id: expenseId }))).toBe(false);
    expect((await loadExpense(db, expenseId)).status).toBe("submitted");
  });
});

describe("approving (AC-73)", () => {
  it("sends it to the Board Chair without charging the budget", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    const result = await decide(world.accountant, expenseId, { kind: "approve" });
    expect(result.status).toBe("awaiting_board");
    expect(result.approved).toEqual({ subtotal: 90_000, tax: 10_800, total: 100_800 });
    expect(await budgetFigures(db, world.cycle.id, world.media.id)).toMatchObject({
      committed: 0,
      spent: 0,
      pending: 100_800,
      remaining: 3_000_000,
    });
    const [d] = await db
      .select()
      .from(expenseDecisions)
      .where(eq(expenseDecisions.expenseSubmissionId, expenseId));
    expect(d).toMatchObject({
      level: "accountant",
      decision: "approved",
      actingRole: "accountant",
    });
  });

  it("AC-69: a different amount of $500.00 stores $446.43 + $53.57 tax", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    await decide(world.accountant, expenseId, {
      kind: "approve_different_amount",
      amount: "500.00",
      note: "One microphone only.",
    });
    expect(await loadExpense(db, expenseId)).toMatchObject({
      approvedSubtotalCents: 44_643,
      approvedTaxCents: 5_357,
      approvedTotalCents: 50_000,
      approvalNote: "One microphone only.",
    });
  });

  it("adds no tax to a claim's different amount", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "expense_claim");
    await decide(world.accountant, expenseId, {
      kind: "approve_different_amount",
      amount: "100.00",
      note: "Tape isn't a media cost.",
    });
    expect(await loadExpense(db, expenseId)).toMatchObject({
      approvedSubtotalCents: 10_000,
      approvedTaxCents: 0,
      approvedTotalCents: 10_000,
    });
  });

  it("never approves more than was asked, and needs a reason for a different amount", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    await expect(
      decide(world.accountant, expenseId, {
        kind: "approve_different_amount",
        amount: "2000.00",
        note: "More",
      }),
    ).rejects.toThrow(RuleError);
    await expect(
      decide(world.accountant, expenseId, { kind: "approve_different_amount", amount: "10.00" }),
    ).rejects.toMatchObject({ fieldErrors: { note: expect.any(String) } });
  });
});

describe("conflicts (AC-72, FR-47)", () => {
  it("refuses the accountant's own department and own claim", async () => {
    const world = await expenseWorld(db);
    const accountantLeader = await person(db, ["accountant", "requester"], [world.media.id]);
    const { expenseId } = await submitted(
      db,
      { ...world, requester: accountantLeader },
      "expense_claim",
    );
    await expect(decide(accountantLeader, expenseId, { kind: "approve" })).rejects.toThrow(
      ForbiddenError,
    );
    // Another accountant can.
    await decide(world.accountant, expenseId, { kind: "approve" });
  });

  it("refuses an approver who is the claim's payee", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "expense_claim", {
      ...CLAIM,
      payeeKind: "other",
      payeeName: "Pat",
      payeeEmail: world.accountant.email,
      paymentPreference: "e_transfer",
    });
    await expect(decide(world.accountant, expenseId, { kind: "approve" })).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("refuses the System Administrator without the role (AC-111)", async () => {
    const world = await expenseWorld(db);
    const admin = await person(db, ["system_admin"]);
    const { expenseId } = await submitted(db, world, "purchase_request");
    await expect(decide(admin, expenseId, { kind: "approve" })).rejects.toThrow(ForbiddenError);
  });
});

describe("returning and declining", () => {
  it("returns with a question; the department answers and it's Submitted again", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    await decide(world.accountant, expenseId, { kind: "return", note: "Which model?" });
    const view = await getExpenseView(db, world.requester, expenseId);
    expect(view).toMatchObject({ status: "returned", question: "Which model?", canEdit: true });
    const row = await loadExpense(db, expenseId);
    const answered = await run((tx) =>
      editExpense(tx, world.requester, {
        id: expenseId,
        version: row.version,
        idempotencyKey: randomUUID(),
        ...PURCHASE,
        justification: "Shure SM58, two of ours failed.",
      }),
    );
    expect(answered.responded).toBe(true);
    expect((await loadExpense(db, expenseId)).status).toBe("submitted");
  });

  it("declines with a reason, ending it", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    await decide(world.accountant, expenseId, {
      kind: "decline",
      note: "Not in this year's plan.",
    });
    const row = await loadExpense(db, expenseId);
    expect(row.status).toBe("declined");
    expect(row.closedAt).not.toBeNull();
    await expect(decide(world.accountant, expenseId, { kind: "approve" })).rejects.toThrow(
      RuleError,
    );
  });
});

describe("over budget at the decision (FR-43, AC-70, AC-140)", () => {
  it("shows the overage worked out now, including what was charged since", async () => {
    const world = await expenseWorld(db, { budgetCents: 150_000 });
    const first = await submitted(db, world, "purchase_request");
    const second = await submitted(db, world, "purchase_request");
    // Neither is over on its own…
    const secondRow = await loadExpense(db, second.expenseId);
    expect((await warningsFor(db, secondRow, 100_800)).overBy).toBe(0);
    // …but once the first is charged (approved by the board), the second is.
    await db
      .update(expenseSubmissions)
      .set({
        status: "approved",
        approvedSubtotalCents: 90_000,
        approvedTaxCents: 10_800,
        approvedTotalCents: 100_800,
      })
      .where(eq(expenseSubmissions.id, first.expenseId));
    expect((await warningsFor(db, secondRow, 100_800)).overBy).toBe(51_600);
    const result = await decide(world.accountant, second.expenseId, { kind: "approve" });
    expect(result.remainingAfterCents).toBe(-51_600);
    const queue = await accountantQueue(db, world.accountant, { department: world.media.id });
    expect(queue?.rows.find((r) => r.id === second.expenseId)?.overBy).toBe(51_600);
  });
});

describe("the queue (FR-48)", () => {
  it("lists what waits for the accountant, flags conflicts, and is refused to others", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    const queue = await accountantQueue(db, world.accountant, { department: world.media.id });
    expect(queue?.rows.map((r) => [r.id, r.canDecide])).toEqual([[expenseId, true]]);
    expect(queue?.waitingCents).toBe(100_800);
    expect(await accountantQueue(db, world.requester)).toBeNull();
    expect(await accountantQueue(db, world.office)).toBeNull();
  });
});
