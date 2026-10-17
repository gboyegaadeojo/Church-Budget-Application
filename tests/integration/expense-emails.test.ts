import { randomUUID } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emailOutbox, expenseSubmissions } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { boardDecide } from "@/domain/expenses/board";
import { recordPayment, startProcessing } from "@/domain/expenses/payment";
import { runExpenseReminders } from "@/domain/expenses/reminders";
import { accountantDecide, startExpenseReview } from "@/domain/expenses/review";
import { cancelPurchaseRequest, loadExpense, withdrawExpense } from "@/domain/expenses/service";
import { expenseTasks } from "@/domain/tasks/expenses";
import type { Viewer } from "@/lib/roles";
import { createTestDb, type TestDb } from "./helpers/db";
import {
  CLAIM,
  expenseWorld,
  person,
  PURCHASE,
  submitted,
  type ExpenseWorld,
} from "./helpers/expenses";

/** The expense emails (FR-49, AC-74, AC-79), reminders and My tasks (FR-37). */

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

/** template → recipients, for one expense. */
async function emailsOf(expenseId: string): Promise<Map<string, string[]>> {
  const rows = await db
    .select({ template: emailOutbox.template, to: emailOutbox.toEmail })
    .from(emailOutbox)
    .where(eq(emailOutbox.expenseSubmissionId, expenseId));
  const out = new Map<string, string[]>();
  for (const r of rows) out.set(r.template, [...(out.get(r.template) ?? []), r.to].sort());
  return out;
}

async function act<T>(
  id: string,
  fn: (tx: Tx, input: { id: string; version: number; idempotencyKey: string }) => Promise<T>,
) {
  const row = await loadExpense(db, id);
  return run((tx) => fn(tx, { id, version: row.version, idempotencyKey: randomUUID() }));
}

const viewerOf = (p: ExpenseWorld["requester"]): Viewer => ({
  id: p.id,
  name: p.name,
  email: p.email,
  roles: p.roles,
  departments: p.departments,
});

describe("the whole way through (AC-79)", () => {
  it("emails each person at each step of a claim paid to someone else", async () => {
    const world = await expenseWorld(db);
    const payee = "volunteer@example.org";
    const { expenseId: id } = await submitted(db, world, "expense_claim", {
      ...CLAIM,
      payeeKind: "other",
      payeeName: "Val Volunteer",
      payeeEmail: payee,
      paymentPreference: "e_transfer",
    });
    // Accountants elsewhere in the database get the accountant emails too; check ours.
    const sent = await emailsOf(id);
    expect(sent.get("expenses.submitted.receipt")).toEqual([world.requester.email, payee].sort());
    expect(sent.get("expenses.submitted.accountant")).toContain(world.accountant.email);

    await run((tx) => startExpenseReview(tx, world.accountant, { id }));
    expect((await emailsOf(id)).get("expenses.review_started")).toEqual(
      [world.requester.email, payee].sort(),
    );

    await act(id, (tx, input) =>
      accountantDecide(tx, world.accountant, { ...input, decision: { kind: "approve" } }),
    );
    let all = await emailsOf(id);
    expect(all.get("expenses.accountant_approved")).toEqual([world.requester.email, payee].sort());
    expect(all.get("expenses.board_needed")).toContain(world.chair.email);
    // AC-74: no "approved" or "ready for processing" before the final approval.
    expect(all.has("expenses.final_approved")).toBe(false);
    expect(all.has("expenses.ready_for_processing")).toBe(false);

    await act(id, (tx, input) =>
      boardDecide(tx, world.chair, { ...input, decision: { kind: "approve" } }),
    );
    all = await emailsOf(id);
    expect(all.get("expenses.final_approved")).toEqual([world.requester.email, payee].sort());
    expect(all.get("expenses.final_approved.board")).toEqual([world.chair.email]);
    expect(all.get("expenses.ready_for_processing")).toContain(world.office.email);

    await act(id, (tx, input) => startProcessing(tx, world.office, input));
    expect((await emailsOf(id)).get("expenses.processing")).toEqual(
      [world.requester.email, payee].sort(),
    );

    await act(id, (tx, input) =>
      recordPayment(tx, world.office, {
        ...input,
        payment: { method: "e_transfer", paidOn: "2026-10-12", amount: "168.00", reference: "X1" },
      }),
    );
    all = await emailsOf(id);
    // AC-77: the payee and requester hear how and when it was paid.
    expect(all.get("expenses.paid")).toEqual([world.requester.email, payee].sort());
    expect(all.get("expenses.paid.church_admin")).toContain(world.office.email);
    const [paid] = await db
      .select()
      .from(emailOutbox)
      .where(
        and(eq(emailOutbox.expenseSubmissionId, id), eq(emailOutbox.template, "expenses.paid")),
      )
      .limit(1);
    expect(paid.textBody).toContain("E-transfer");
    expect(paid.textBody).toContain("X1");
    expect(paid.textBody).toContain("Total paid (incl. tax): $168.00");
  });

  it("AC-141: every leader of the department gets the requester's emails", async () => {
    const world = await expenseWorld(db);
    const backup = await person(db, ["requester"], [world.media.id]);
    const leaders = [world.requester.email, backup.email].sort();
    const { expenseId: id } = await submitted(db, world, "purchase_request");
    expect((await emailsOf(id)).get("expenses.submitted.receipt")).toEqual(leaders);

    await act(id, (tx, input) =>
      accountantDecide(tx, world.accountant, {
        ...input,
        decision: { kind: "return", note: "Which store?" },
      }),
    );
    expect((await emailsOf(id)).get("expenses.returned")).toEqual(leaders);
    // The leader who didn't submit isn't sent the accountant's copy.
    expect((await emailsOf(id)).get("expenses.returned.accountant")).not.toContain(backup.email);
  });

  it("emails returns, the board's question and declines to the right people", async () => {
    const world = await expenseWorld(db);
    const { expenseId: id } = await submitted(db, world, "purchase_request");
    await act(id, (tx, input) =>
      accountantDecide(tx, world.accountant, {
        ...input,
        decision: { kind: "return", note: "Why?" },
      }),
    );
    let all = await emailsOf(id);
    expect(all.get("expenses.returned")).toEqual([world.requester.email]);

    const { expenseId: second } = await submitted(db, world, "purchase_request");
    await act(second, (tx, input) =>
      accountantDecide(tx, world.accountant, { ...input, decision: { kind: "approve" } }),
    );
    await act(second, (tx, input) =>
      boardDecide(tx, world.chair, { ...input, decision: { kind: "return", note: "Cheaper?" } }),
    );
    all = await emailsOf(second);
    expect(all.get("expenses.board_returned")).toContain(world.accountant.email);
    expect(all.get("expenses.board_returned.board")).toEqual([world.chair.email]);
    await act(second, (tx, input) =>
      accountantDecide(tx, world.accountant, { ...input, decision: { kind: "approve" } }),
    );
    await act(second, (tx, input) =>
      boardDecide(tx, world.chair, { ...input, decision: { kind: "decline", note: "No." } }),
    );
    all = await emailsOf(second);
    expect(all.get("expenses.declined")).toEqual([world.requester.email]);
    expect(all.get("expenses.declined.board")).toEqual([world.chair.email]);
    const [declined] = await db
      .select({ text: emailOutbox.textBody })
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.expenseSubmissionId, second),
          eq(emailOutbox.template, "expenses.declined"),
        ),
      );
    expect(declined.text).toContain("Board Chair");
  });

  it("emails a withdrawal and a cancellation", async () => {
    const world = await expenseWorld(db);
    const { expenseId: id } = await submitted(db, world, "purchase_request");
    await act(id, (tx, input) => withdrawExpense(tx, world.requester, input));
    expect((await emailsOf(id)).get("expenses.withdrawn")).toEqual([world.requester.email]);

    const { expenseId: pr } = await submitted(db, world, "purchase_request", {
      ...PURCHASE,
      howBought: "requester_claims",
    });
    for (const [actor, decide] of [
      [world.accountant, accountantDecide],
      [world.chair, boardDecide],
    ] as const) {
      await act(pr, (tx, input) => decide(tx, actor, { ...input, decision: { kind: "approve" } }));
    }
    // The requester buys this one: the office isn't asked to process it.
    expect((await emailsOf(pr)).has("expenses.ready_for_processing")).toBe(false);
    await act(pr, (tx, input) =>
      cancelPurchaseRequest(tx, world.requester, { ...input, reason: "Got one donated." }),
    );
    const all = await emailsOf(pr);
    expect(all.get("expenses.cancelled")).toEqual([world.requester.email]);
    expect(all.get("expenses.cancelled.church_admin")).toContain(world.office.email);
  });

  it("alerts when a final approval takes the department over budget", async () => {
    const world = await expenseWorld(db, { budgetCents: 50_000 });
    const { expenseId: id } = await submitted(db, world, "purchase_request", {
      ...PURCHASE,
      overBudgetExplanation: "Agreed.",
    });
    for (const [actor, decide] of [
      [world.accountant, accountantDecide],
      [world.chair, boardDecide],
    ] as const) {
      await act(id, (tx, input) => decide(tx, actor, { ...input, decision: { kind: "approve" } }));
    }
    const all = await emailsOf(id);
    expect(all.get("expenses.over_budget.requester")).toEqual([world.requester.email]);
    expect(all.get("expenses.over_budget.accountant")).toContain(world.accountant.email);
    expect(all.get("expenses.over_budget.church_admin")).toContain(world.office.email);
  });
});

describe("reminders (FR-49)", () => {
  it("reminds the board after 7 days, the office after 14, and once a week only", async () => {
    const world = await expenseWorld(db);
    const { expenseId: waiting } = await submitted(db, world, "purchase_request");
    await act(waiting, (tx, input) =>
      accountantDecide(tx, world.accountant, { ...input, decision: { kind: "approve" } }),
    );
    const later = new Date(Date.now() + 8 * 86_400_000);
    const first = await runExpenseReminders(db, later);
    expect(first.board).toBeGreaterThan(0);
    const again = await runExpenseReminders(db, later);
    expect(again.board).toBe(0);
    const reminded = await db
      .select({ to: emailOutbox.toEmail })
      .from(emailOutbox)
      .where(like(emailOutbox.template, "expenses.reminder.board%"));
    expect(reminded.map((r) => r.to)).toContain(world.chair.email);

    await act(waiting, (tx, input) =>
      boardDecide(tx, world.chair, { ...input, decision: { kind: "approve" } }),
    );
    const muchLater = new Date(Date.now() + 20 * 86_400_000);
    expect((await runExpenseReminders(db, muchLater)).payment).toBeGreaterThan(0);
  });

  it("reminds a requester whose approved purchase isn't bought or claimed after 60 days", async () => {
    const world = await expenseWorld(db);
    const { expenseId: id } = await submitted(db, world, "purchase_request", {
      ...PURCHASE,
      howBought: "requester_claims",
    });
    for (const [actor, decide] of [
      [world.accountant, accountantDecide],
      [world.chair, boardDecide],
    ] as const) {
      await act(id, (tx, input) => decide(tx, actor, { ...input, decision: { kind: "approve" } }));
    }
    await runExpenseReminders(db, new Date(Date.now() + 61 * 86_400_000));
    const [email] = await db
      .select({ to: emailOutbox.toEmail })
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.template, "expenses.reminder.unclaimed"),
          eq(emailOutbox.toEmail, world.requester.email),
        ),
      );
    expect(email).toBeDefined();
  });
});

describe("My tasks (FR-37, AC-109)", () => {
  it("puts each step on the right person's list and takes it off once done", async () => {
    const world = await expenseWorld(db);
    const { expenseId: id } = await submitted(db, world, "expense_claim");
    const has = async (who: ExpenseWorld["requester"], suffix: string) =>
      (await expenseTasks(db, viewerOf(who))).some((t) => t.id === `expense:${id}:${suffix}`);

    expect(await has(world.accountant, "review")).toBe(true);
    await act(id, (tx, input) =>
      accountantDecide(tx, world.accountant, { ...input, decision: { kind: "return", note: "?" } }),
    );
    expect(await has(world.accountant, "review")).toBe(false);
    expect(await has(world.requester, "respond")).toBe(true);

    // Answer, approve twice, then the office records the payment.
    await db
      .update(expenseSubmissions)
      .set({ status: "submitted" })
      .where(eq(expenseSubmissions.id, id));
    await act(id, (tx, input) =>
      accountantDecide(tx, world.accountant, { ...input, decision: { kind: "approve" } }),
    );
    expect(await has(world.chair, "final-approval")).toBe(true);
    expect(await has(world.vice, "final-approval")).toBe(false);
    await act(id, (tx, input) =>
      boardDecide(tx, world.chair, { ...input, decision: { kind: "approve" } }),
    );
    expect(await has(world.chair, "final-approval")).toBe(false);
    expect(await has(world.office, "pay")).toBe(true);
    expect(await has(world.requester, "pay")).toBe(false);
  });
});
