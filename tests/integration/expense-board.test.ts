import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expenseDecisions, spendingEntries, userPreferences } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { RuleError } from "@/domain/errors";
import { boardDecide } from "@/domain/expenses/board";
import { budgetFigures, budgetStatus } from "@/domain/expenses/budget";
import { accountantDecide } from "@/domain/expenses/review";
import { boardQueue } from "@/domain/expenses/review-queries";
import { loadExpense } from "@/domain/expenses/service";
import { boardCover } from "@/domain/notifications/recipients";
import { ForbiddenError } from "@/lib/authz";
import { createTestDb, type TestDb } from "./helpers/db";
import { CLAIM, expenseWorld, person, submitted, type ExpenseWorld } from "./helpers/expenses";

/** Level 2, the Board Chair or Vice-Chair (6B.4, 3.3), and charging the budget (FR-42). */

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

type Actor = Parameters<typeof boardDecide>[1];

async function accountantApproves(world: ExpenseWorld, id: string) {
  const row = await loadExpense(db, id);
  await run((tx) =>
    accountantDecide(tx, world.accountant, {
      id,
      version: row.version,
      idempotencyKey: randomUUID(),
      decision: { kind: "approve" },
    }),
  );
}

async function board(actor: Actor, id: string, decision: unknown) {
  const row = await loadExpense(db, id);
  return run((tx) =>
    boardDecide(tx, actor, { id, version: row.version, idempotencyKey: randomUUID(), decision }),
  );
}

async function awaitingBoard(
  world: ExpenseWorld,
  type: "purchase_request" | "expense_claim",
  content?: Parameters<typeof submitted>[3],
) {
  const { expenseId } = await submitted(db, world, type, content);
  await accountantApproves(world, expenseId);
  return expenseId;
}

/**
 * Each world adds its own chair and vice. Chairs elsewhere in the database don't matter
 * to the cover rule's outcome for the checks below, which use the world's chair.
 */
describe("final approval (AC-66, AC-73, AC-74)", () => {
  it("commits an approved purchase request: Remaining falls by $1,008.00", async () => {
    const world = await expenseWorld(db);
    const id = await awaitingBoard(world, "purchase_request");
    const result = await board(world.chair, id, { kind: "approve" });
    expect(result).toMatchObject({ status: "approved", actingRole: "board_chair" });
    expect(await budgetFigures(db, world.cycle.id, world.media.id)).toMatchObject({
      committed: 100_800,
      pending: 0,
      remaining: 3_000_000 - 100_800,
    });
  });

  it("AC-75: approves a smaller amount, never a larger one", async () => {
    const world = await expenseWorld(db);
    const id = await awaitingBoard(world, "purchase_request");
    await expect(
      board(world.chair, id, { kind: "approve_smaller", amount: "1100.00", note: "More" }),
    ).rejects.toThrow(RuleError);
    await board(world.chair, id, { kind: "approve_smaller", amount: "500.00", note: "One only" });
    expect(await loadExpense(db, id)).toMatchObject({
      status: "approved",
      approvedSubtotalCents: 44_643,
      approvedTaxCents: 5_357,
      approvedTotalCents: 50_000,
    });
  });

  it("AC-80: an approved claim lands in the spending ledger, Spent", async () => {
    const world = await expenseWorld(db);
    const id = await awaitingBoard(world, "expense_claim");
    await board(world.chair, id, { kind: "approve" });
    const entries = await db
      .select()
      .from(spendingEntries)
      .where(eq(spendingEntries.expenseSubmissionId, id));
    expect(entries).toEqual([
      expect.objectContaining({
        entryType: "expense",
        amountCents: 16_800,
        spentOn: "2026-10-11",
        departmentId: world.media.id,
        status: "recorded",
      }),
    ]);
    expect((await budgetFigures(db, world.cycle.id, world.media.id)).spent).toBe(16_800);
  });

  it("AC-67: a $985.60 claim linked to the $1,008.00 request releases it and adds $985.60 to Spent", async () => {
    const world = await expenseWorld(db);
    const pr = await awaitingBoard(world, "purchase_request");
    await board(world.chair, pr, { kind: "approve" });
    const claim = await awaitingBoard(world, "expense_claim", {
      ...CLAIM,
      linkedPurchaseRequestId: pr,
      lines: [
        { date: "2026-10-12", vendor: "Long & McQuade", description: "Mics", amount: "985.60" },
      ],
    });
    await board(world.chair, claim, { kind: "approve" });
    expect((await loadExpense(db, pr)).status).toBe("closed");
    expect(await budgetFigures(db, world.cycle.id, world.media.id)).toMatchObject({
      committed: 0,
      spent: 98_560,
      remaining: 3_000_000 - 98_560,
    });
  });
});

describe("over budget at final approval (FR-43, AC-139)", () => {
  it("lets Remaining go below zero, and the status is Over budget", async () => {
    const world = await expenseWorld(db, { budgetCents: 50_000 });
    const id = await awaitingBoard(world, "purchase_request", {
      title: "Mics",
      justification: "Needed",
      items: [{ name: "Microphone", quantity: "2", unitPrice: "450.00" }],
      howBought: "church_account",
      overBudgetExplanation: "The board agreed.",
    });
    const result = await board(world.chair, id, { kind: "approve" });
    expect(result.remainingAfterCents).toBe(-50_800);
    const figures = await budgetFigures(db, world.cycle.id, world.media.id);
    expect(figures.remaining).toBe(-50_800);
    expect(budgetStatus(figures, "0.80")).toBe("over_budget");
  });
});

describe("returning and declining", () => {
  it("returns to the accountant: In Review again, budget untouched", async () => {
    const world = await expenseWorld(db);
    const id = await awaitingBoard(world, "purchase_request");
    await board(world.chair, id, { kind: "return", note: "Is there a cheaper model?" });
    expect((await loadExpense(db, id)).status).toBe("in_review");
    expect((await budgetFigures(db, world.cycle.id, world.media.id)).committed).toBe(0);
  });

  it("declines with a reason", async () => {
    const world = await expenseWorld(db);
    const id = await awaitingBoard(world, "purchase_request");
    await board(world.chair, id, { kind: "decline", note: "Not now." });
    expect((await loadExpense(db, id)).status).toBe("declined");
  });

  it("can't decide before the accountant has", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    await expect(board(world.chair, expenseId, { kind: "approve" })).rejects.toThrow();
  });
});

describe("the Vice-Chair (3.3, AC-112)", () => {
  it("covers while the Board Chair is Away, recorded as the Vice-Chair", async () => {
    const world = await expenseWorld(db);
    // Make every Board Chair in this database away, so the Vice-Chair covers.
    const chairs = await db.query.userRoles.findMany({
      where: (r, { eq }) => eq(r.role, "board_chair"),
    });
    for (const c of chairs) {
      await db
        .insert(userPreferences)
        .values({ userId: c.userId, awayFrom: new Date("2026-01-01T00:00:00Z") })
        .onConflictDoUpdate({
          target: userPreferences.userId,
          set: { awayFrom: new Date("2026-01-01T00:00:00Z"), awayUntil: null },
        });
    }
    const id = await awaitingBoard(world, "purchase_request");
    const row = await loadExpense(db, id);
    const cover = await boardCover(db, row);
    expect(cover.viceCovering).toBe(true);
    expect(cover.recipients.map((r) => r.userId)).toContain(world.vice.id);
    const result = await board(world.vice, id, { kind: "approve" });
    expect(result.actingRole).toBe("vice_chair");
    const [d] = await db
      .select()
      .from(expenseDecisions)
      .where(eq(expenseDecisions.expenseSubmissionId, id));
    expect(d).toBeDefined();
    // Chairs back.
    for (const c of chairs) {
      await db
        .update(userPreferences)
        .set({ awayFrom: null, awayUntil: null })
        .where(eq(userPreferences.userId, c.userId));
    }
  });

  it("isn't needed while a Board Chair can decide", async () => {
    const world = await expenseWorld(db);
    const id = await awaitingBoard(world, "purchase_request");
    await expect(board(world.vice, id, { kind: "approve" })).rejects.toThrow(RuleError);
    const queue = await boardQueue(db, world.vice, { department: world.media.id });
    expect(queue?.rows.find((r) => r.id === id)?.canDecide).toBe(false);
  });

  it("refuses a Board Chair who leads the department or is paid by the claim", async () => {
    const world = await expenseWorld(db);
    const chairLeader = await person(db, ["board_chair", "requester"], [world.media.id]);
    const id = await awaitingBoard(world, "purchase_request");
    await expect(board(chairLeader, id, { kind: "approve" })).rejects.toThrow(ForbiddenError);
    const claim = await awaitingBoard(world, "expense_claim", {
      ...CLAIM,
      payeeKind: "other",
      payeeName: "Chair",
      payeeEmail: world.chair.email,
      paymentPreference: "e_transfer",
    });
    await expect(board(world.chair, claim, { kind: "approve" })).rejects.toThrow(ForbiddenError);
  });

  it("refuses the accountant and the System Administrator (AC-111)", async () => {
    const world = await expenseWorld(db);
    const admin = await person(db, ["system_admin"]);
    const id = await awaitingBoard(world, "purchase_request");
    await expect(board(world.accountant, id, { kind: "approve" })).rejects.toThrow(ForbiddenError);
    await expect(board(admin, id, { kind: "approve" })).rejects.toThrow(ForbiddenError);
  });
});
