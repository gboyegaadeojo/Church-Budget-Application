import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, budgetCycles, emailOutbox } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { RuleError, ValidationError } from "@/domain/errors";
import { boardDecide } from "@/domain/expenses/board";
import { budgetFigures } from "@/domain/expenses/budget";
import { accountantDecide } from "@/domain/expenses/review";
import { loadExpense } from "@/domain/expenses/service";
import { recordEntry } from "@/domain/spending/service";
import { carryOver, lockSpending, reopenSpending, yearEndView } from "@/domain/spending/year-end";
import { ForbiddenError } from "@/lib/authz";
import { createTestDb, type TestDb } from "./helpers/db";
import { expenseWorld, submitted, type ExpenseWorld } from "./helpers/expenses";
import { insertApprovedBudget, insertCycle, insertUser } from "./helpers/fixtures";

/** The year-end lock and carry-over (FR-29, FR-46, AC-90). */

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

async function decide(world: ExpenseWorld, expenseId: string, who: "accountant" | "chair") {
  const row = await loadExpense(db, expenseId);
  const [actor, fn] =
    who === "accountant" ? [world.accountant, accountantDecide] : [world.chair, boardDecide];
  await run((tx) =>
    fn(tx, actor, {
      id: expenseId,
      version: row.version,
      idempotencyKey: randomUUID(),
      decision: { kind: "approve" },
    }),
  );
}

async function cycleVersion(id: string) {
  const [row] = await db.select().from(budgetCycles).where(eq(budgetCycles.id, id));
  return row.version;
}

const lock = async (actor: Parameters<typeof lockSpending>[1], cycleId: string) => {
  const version = await cycleVersion(cycleId);
  return run((tx) =>
    lockSpending(tx, actor, {
      cycleId,
      version,
      idempotencyKey: randomUUID(),
    }),
  );
};

describe("locking a year's spending (FR-29)", () => {
  it("AC-90 refuses while expenses wait, then locks and nothing more is recorded", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    await expect(lock(world.accountant, world.cycle.id)).rejects.toThrow(RuleError);
    let view = await yearEndView(db, world.accountant, world.cycle.id);
    expect(view!.awaitingDecision.map((i) => i.id)).toEqual([expenseId]);

    await decide(world, expenseId, "accountant");
    await decide(world, expenseId, "chair");
    // Only the accountant locks.
    await expect(lock(world.office, world.cycle.id)).rejects.toThrow(ForbiddenError);
    await lock(world.accountant, world.cycle.id);

    view = await yearEndView(db, world.accountant, world.cycle.id);
    expect(view!.cycle.lockedAt).not.toBeNull();
    expect(view!.openPurchases.map((i) => i.id)).toEqual([expenseId]);
    await expect(
      run((tx) =>
        recordEntry(tx, world.office, {
          cycleId: world.cycle.id,
          departmentId: world.media.id,
          entryType: "expense",
          spentOn: `${world.cycle.budgetYear}-03-15`,
          payee: "Late",
          description: "Late",
          amount: "10",
          paymentMethod: "cheque",
          idempotencyKey: randomUUID(),
        }),
      ),
    ).rejects.toThrow(RuleError);

    const [audit] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, "spending.period_locked"),
          eq(auditEvents.cycleId, world.cycle.id),
        ),
      );
    expect(audit).toBeTruthy();
    const [email] = await db
      .select()
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.template, "spending.locked"),
          eq(emailOutbox.toEmail, world.office.email),
        ),
      );
    expect(email.subject).toContain("locked");

    // Reopening needs a reason, and is audited with it.
    const reopen = async (reason: string) => {
      const version = await cycleVersion(world.cycle.id);
      return run((tx) =>
        reopenSpending(tx, world.accountant, {
          cycleId: world.cycle.id,
          version,
          reason,
        }),
      );
    };
    await expect(reopen("")).rejects.toThrow(ValidationError);
    await reopen("A cheque was missed.");
    const [reopened] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, "spending.period_reopened"),
          eq(auditEvents.cycleId, world.cycle.id),
        ),
      );
    expect(reopened.reason).toBe("A cheque was missed.");
    expect((await yearEndView(db, world.accountant, world.cycle.id))!.cycle.lockedAt).toBeNull();
  });

  it("refuses to approve a claim into a locked year", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "expense_claim");
    await decide(world, expenseId, "accountant");
    // Locked by other means while the claim waited (the service itself refuses this).
    await db
      .update(budgetCycles)
      .set({ spendingLockedAt: new Date() })
      .where(eq(budgetCycles.id, world.cycle.id));
    await expect(decide(world, expenseId, "chair")).rejects.toThrow(RuleError);
  });
});

describe("carrying over an open purchase request (FR-46)", () => {
  it("moves its commitment into next year's approved budget, with a reason", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    await decide(world, expenseId, "accountant");
    await decide(world, expenseId, "chair");
    const before = await budgetFigures(db, world.cycle.id, world.media.id);
    expect(before.committed).toBe(100_800);

    const carry = async (reason = "Ordered in December; arrives in January.") => {
      const { version } = await loadExpense(db, expenseId);
      return run((tx) =>
        carryOver(tx, world.accountant, {
          id: expenseId,
          version,
          reason,
          idempotencyKey: randomUUID(),
        }),
      );
    };
    // The year must be locked first, and next year's cycle and budget must exist.
    await expect(carry()).rejects.toThrow(RuleError);
    await lock(world.accountant, world.cycle.id);
    await expect(carry()).rejects.toThrow(RuleError);
    const owner = await insertUser(db);
    const next = await insertCycle(db, owner.id, {
      budgetYear: world.cycle.budgetYear + 1,
      name: `FY${world.cycle.budgetYear + 1}-${randomUUID().slice(0, 4)}`,
    });
    await expect(carry()).rejects.toThrow(RuleError);
    await insertApprovedBudget(
      db,
      {
        cycleId: next.id,
        departmentId: world.media.id,
        userId: owner.id,
        approverUserId: world.accountant.id,
      },
      1_000_000,
    );
    await expect(carry("")).rejects.toThrow(ValidationError);
    await carry();

    expect((await budgetFigures(db, world.cycle.id, world.media.id)).committed).toBe(0);
    expect((await budgetFigures(db, next.id, world.media.id)).committed).toBe(100_800);
    const row = await loadExpense(db, expenseId);
    expect(row).toMatchObject({
      status: "approved",
      budgetCycleId: next.id,
      carriedOverFromCycleId: world.cycle.id,
      carryOverReason: "Ordered in December; arrives in January.",
    });
    const view = await yearEndView(db, world.accountant, next.id);
    expect(view!.carriedIn.map((i) => i.id)).toEqual([expenseId]);
    const [email] = await db
      .select()
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.template, "expenses.carried_over"),
          eq(emailOutbox.toEmail, world.requester.email),
        ),
      );
    expect(email.textBody).toContain("Ordered in December");
    // The Church Administrator can't carry over.
    await expect(
      run(async (tx) =>
        carryOver(tx, world.office, {
          id: expenseId,
          version: row.version,
          reason: "x",
          idempotencyKey: randomUUID(),
        }),
      ),
    ).rejects.toThrow(ForbiddenError);
  });
});
