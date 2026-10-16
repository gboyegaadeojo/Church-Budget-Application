import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, expenseRevisions, expenseSubmissions } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { RuleError, ValidationError } from "@/domain/errors";
import { budgetFigures } from "@/domain/expenses/budget";
import { expenseStartOptions, getExpenseView, listMyExpenses } from "@/domain/expenses/queries";
import {
  deleteExpenseDraft,
  editExpense,
  saveExpenseDraft,
  startExpense,
  submitExpense,
  withdrawExpense,
} from "@/domain/expenses/service";
import { ForbiddenError } from "@/lib/authz";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertApprovedBudget, insertDepartment } from "./helpers/fixtures";
import {
  CLAIM,
  expenseWorld,
  NOW,
  person,
  PURCHASE,
  submitted,
  type ExpenseWorld,
} from "./helpers/expenses";

/** The requester's side of expenses (6B.3, FR-40 to FR-44). */

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

async function row(id: string) {
  const [r] = await db.select().from(expenseSubmissions).where(eq(expenseSubmissions.id, id));
  return r;
}

async function draft(world: ExpenseWorld, type: "purchase_request" | "expense_claim") {
  return run((tx) =>
    startExpense(tx, world.requester, {
      type,
      departmentId: world.media.id,
      cycleId: world.cycle.id,
    }),
  );
}

describe("starting an expense", () => {
  it("AC-78: is refused without an approved annual budget", async () => {
    const world = await expenseWorld(db);
    const youth = await insertDepartment(db);
    const leader = await person(db, ["requester"], [youth.id]);
    await expect(
      run((tx) =>
        startExpense(tx, leader, {
          type: "purchase_request",
          departmentId: youth.id,
          cycleId: world.cycle.id,
        }),
      ),
    ).rejects.toThrow(RuleError);
  });

  it("is refused while the annual decision is held for release (FR-19a)", async () => {
    const world = await expenseWorld(db);
    const held = await insertDepartment(db);
    await insertApprovedBudget(
      db,
      { cycleId: world.cycle.id, departmentId: held.id, userId: world.accountant.id },
      100_000,
      { released: false },
    );
    const leader = await person(db, ["requester"], [held.id]);
    const options = await expenseStartOptions(db, leader);
    expect(options[0].cycles).toEqual([]);
  });

  it("is refused for a department the person doesn't represent", async () => {
    const world = await expenseWorld(db);
    const stranger = await person(db, ["requester"]);
    await expect(
      run((tx) =>
        startExpense(tx, stranger, {
          type: "expense_claim",
          departmentId: world.media.id,
          cycleId: world.cycle.id,
        }),
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("offers the departments and years with a budget", async () => {
    const world = await expenseWorld(db);
    const options = await expenseStartOptions(db, world.requester);
    expect(options).toEqual([
      expect.objectContaining({
        id: world.media.id,
        cycles: [expect.objectContaining({ id: world.cycle.id })],
        defaultCycleId: world.cycle.id,
      }),
    ]);
  });
});

describe("purchase requests", () => {
  it("AC-65: 2 × $450.00 gives $900.00 + $108.00 tax = $1,008.00", async () => {
    const world = await expenseWorld(db);
    const result = await submitted(db, world, "purchase_request");
    expect(result.totals).toEqual({ subtotal: 90_000, tax: 10_800, total: 100_800 });
    expect(result.referenceNumber).toBe(`EXP-${world.cycle.budgetYear}-0001`);
    const r = await row(result.expenseId);
    expect(r).toMatchObject({
      status: "submitted",
      taxRate: "0.1200",
      totalCents: 100_800,
      howBought: "church_account",
    });
  });

  it("AC-115: requires How it will be bought", async () => {
    const world = await expenseWorld(db);
    await expect(
      submitted(db, world, "purchase_request", { ...PURCHASE, howBought: "" }),
    ).rejects.toMatchObject({ fieldErrors: { howBought: expect.any(String) } });
  });

  it("ignores totals the browser sends (FR-41)", async () => {
    const world = await expenseWorld(db);
    const result = await submitted(db, world, "purchase_request", {
      ...PURCHASE,
      // @ts-expect-error a forged field the schema doesn't know
      totalCents: 1,
    });
    expect(result.totals.total).toBe(100_800);
  });

  it("is Pending on the budget, not deducted (FR-42)", async () => {
    const world = await expenseWorld(db);
    await submitted(db, world, "purchase_request");
    expect(await budgetFigures(db, world.cycle.id, world.media.id)).toMatchObject({
      pending: 100_800,
      committed: 0,
      remaining: 3_000_000,
    });
  });
});

describe("expense claims", () => {
  it("AC-68: receipts of $112.00 and $56.00 total $168.00 with no tax", async () => {
    const world = await expenseWorld(db);
    const result = await submitted(db, world, "expense_claim");
    expect(result.totals).toEqual({ subtotal: 16_800, tax: 0, total: 16_800 });
    const r = await row(result.expenseId);
    expect(r).toMatchObject({
      payeeKind: "self",
      payeeUserId: world.requester.id,
      paymentPreference: "cheque",
      noReceiptReason: expect.any(String),
    });
  });

  it("needs a receipt, or a reason there's none (6B.9)", async () => {
    const world = await expenseWorld(db);
    await expect(
      submitted(db, world, "expense_claim", { ...CLAIM, noReceipt: false }),
    ).rejects.toMatchObject({ fieldErrors: { receipts: expect.any(String) } });
  });

  it("needs an e-transfer email for an e-transfer", async () => {
    const world = await expenseWorld(db);
    await expect(
      submitted(db, world, "expense_claim", {
        ...CLAIM,
        payeeKind: "other",
        payeeName: "Ada Volunteer",
        paymentPreference: "e_transfer",
      }),
    ).rejects.toMatchObject({ fieldErrors: { payeeEmail: expect.any(String) } });
  });

  it("matches a named payee with an account, so they can't approve it (FR-47)", async () => {
    const world = await expenseWorld(db);
    const result = await submitted(db, world, "expense_claim", {
      ...CLAIM,
      payeeKind: "other",
      payeeName: "The accountant",
      payeeEmail: world.accountant.email.toUpperCase(),
      paymentPreference: "e_transfer",
    });
    expect((await row(result.expenseId)).payeeUserId).toBe(world.accountant.id);
  });

  it("needs an explanation for receipts older than the claim deadline (FR-46)", async () => {
    const world = await expenseWorld(db);
    const late = {
      ...CLAIM,
      lines: [{ date: "2026-05-01", vendor: "Staples", description: "Paper", amount: "20.00" }],
    };
    await expect(submitted(db, world, "expense_claim", late)).rejects.toMatchObject({
      fieldErrors: { lateExplanation: expect.any(String) },
    });
    await submitted(db, world, "expense_claim", { ...late, lateExplanation: "I was away." });
  });

  it("refuses a purchase date in the future", async () => {
    const world = await expenseWorld(db);
    await expect(
      submitted(db, world, "expense_claim", {
        ...CLAIM,
        lines: [{ date: "2026-12-25", vendor: "Staples", description: "Paper", amount: "20.00" }],
      }),
    ).rejects.toMatchObject({ fieldErrors: { "lines.0.date": expect.any(String) } });
  });

  it("refuses a malformed receipt line even in a draft", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await draft(world, "expense_claim");
    await expect(
      run((tx) =>
        saveExpenseDraft(tx, world.requester, {
          id: expenseId,
          version: 1,
          lines: [{ vendor: "Staples", amount: "abc" }],
        }),
      ),
    ).rejects.toMatchObject({
      fieldErrors: { "lines.0.date": expect.any(String), "lines.0.amount": expect.any(String) },
    });
  });
});

describe("over budget (FR-43, AC-70)", () => {
  it("needs an explanation, then can still be submitted", async () => {
    const world = await expenseWorld(db, { budgetCents: 50_000 });
    await expect(submitted(db, world, "purchase_request")).rejects.toMatchObject({
      fieldErrors: { overBudgetExplanation: expect.any(String) },
    });
    const result = await submitted(db, world, "purchase_request", {
      ...PURCHASE,
      overBudgetExplanation: "The board agreed to cover it.",
    });
    const view = await getExpenseView(db, world.requester, result.expenseId);
    expect(view?.impact).toEqual({ before: 50_000, after: -50_800, overBy: 50_800 });
    expect(view?.content.overBudgetExplanation).toBe("The board agreed to cover it.");
  });
});

describe("editing and withdrawing (FR-44)", () => {
  it("AC-71: edits freely until review starts, keeping every version", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    const r = await row(expenseId);
    const result = await run((tx) =>
      editExpense(tx, world.requester, {
        id: expenseId,
        version: r.version,
        idempotencyKey: randomUUID(),
        ...PURCHASE,
        items: [{ name: "Microphone", quantity: "3", unitPrice: "450.00" }],
      }),
    );
    expect(result.totals.total).toBe(151_200);
    const revisions = await db
      .select()
      .from(expenseRevisions)
      .where(eq(expenseRevisions.expenseSubmissionId, expenseId));
    expect(revisions.map((x) => [x.revisionNumber, x.kind, x.totalCents])).toEqual([
      [1, "submission", 100_800],
      [2, "edit", 151_200],
    ]);

    // Once the accountant starts the review, the requester can't edit.
    await db
      .update(expenseSubmissions)
      .set({ status: "in_review" })
      .where(eq(expenseSubmissions.id, expenseId));
    const now = await row(expenseId);
    await expect(
      run((tx) =>
        editExpense(tx, world.requester, {
          id: expenseId,
          version: now.version,
          idempotencyKey: randomUUID(),
          ...PURCHASE,
        }),
      ),
    ).rejects.toThrow(RuleError);
    expect((await getExpenseView(db, world.requester, expenseId))?.canEdit).toBe(false);
  });

  it("refuses an edit that changes nothing", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    const r = await row(expenseId);
    await expect(
      run((tx) =>
        editExpense(tx, world.requester, {
          id: expenseId,
          version: r.version,
          idempotencyKey: randomUUID(),
          ...PURCHASE,
        }),
      ),
    ).rejects.toThrow(RuleError);
  });

  it("withdraws before review, audited", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "expense_claim");
    const r = await row(expenseId);
    await run((tx) =>
      withdrawExpense(tx, world.requester, {
        id: expenseId,
        version: r.version,
        idempotencyKey: randomUUID(),
      }),
    );
    expect((await row(expenseId)).status).toBe("withdrawn");
    const events = await db
      .select({ type: auditEvents.eventType })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, expenseId));
    expect(events.map((x) => x.type)).toEqual(
      expect.arrayContaining([
        "expenses.draft_started",
        "expenses.draft_saved",
        "expenses.submitted",
        "expenses.withdrawn",
      ]),
    );
  });
});

describe("drafts and duplicates", () => {
  it("returns the first result for a repeated submit (FR-10)", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await draft(world, "purchase_request");
    const saved = await run((tx) =>
      saveExpenseDraft(tx, world.requester, { id: expenseId, version: 1, ...PURCHASE }),
    );
    const key = randomUUID();
    const first = await run((tx) =>
      submitExpense(
        tx,
        world.requester,
        { id: expenseId, version: saved.version, idempotencyKey: key },
        { now: NOW },
      ),
    );
    const again = await run((tx) =>
      submitExpense(
        tx,
        world.requester,
        { id: expenseId, version: saved.version, idempotencyKey: key },
        { now: NOW },
      ),
    );
    expect(again).toEqual(first);
  });

  it("deletes a never-submitted draft", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await draft(world, "purchase_request");
    await run((tx) => deleteExpenseDraft(tx, world.requester, { id: expenseId, version: 1 }));
    expect(await row(expenseId)).toBeUndefined();
  });

  it("keeps a draft private to its department", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await draft(world, "purchase_request");
    expect(await getExpenseView(db, world.accountant, expenseId)).toBeNull();
    expect(await getExpenseView(db, world.requester, expenseId)).not.toBeNull();
    expect((await listMyExpenses(db, world.requester)).map((r) => r.id)).toContain(expenseId);
  });

  it("validates the fields of a draft", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await draft(world, "purchase_request");
    await expect(
      run((tx) =>
        saveExpenseDraft(tx, world.requester, {
          id: expenseId,
          version: 1,
          items: [{ name: "Mic", quantity: "0", unitPrice: "1" }],
        }),
      ),
    ).rejects.toThrow(ValidationError);
  });
});
