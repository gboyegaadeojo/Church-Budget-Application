import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { budgetRequests } from "@/db/schema";
import type { Db } from "@/db/types";
import { reopenRequest } from "@/domain/annual/review";
import { getReviewView } from "@/domain/annual/review-queries";
import { RuleError } from "@/domain/errors";
import { createTestDb, type TestDb } from "./helpers/db";
import { expenseWorld, submitted, type ExpenseWorld } from "./helpers/expenses";

/** FR-18a: reopening an approved budget that expenses already rely on needs confirming. */

let t: TestDb;
let db: Db;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t?.close();
});

async function annualOf(world: ExpenseWorld) {
  const [row] = await db
    .select({ id: budgetRequests.id, version: budgetRequests.version })
    .from(budgetRequests)
    .where(
      and(
        eq(budgetRequests.budgetCycleId, world.cycle.id),
        eq(budgetRequests.departmentId, world.media.id),
      ),
    );
  return row;
}

const reopen = (world: ExpenseWorld, id: string, version: number, confirmExpenses?: boolean) =>
  db.transaction((tx) =>
    reopenRequest(tx, world.accountant, {
      id,
      version,
      idempotencyKey: randomUUID(),
      reason: "The board reconsidered.",
      confirmExpenses,
    }),
  );

describe("reopening an approved budget with expenses against it (FR-18a)", () => {
  it("warns with the amounts and reopens only once the accountant confirms", async () => {
    const world = await expenseWorld(db);
    await submitted(db, world, "purchase_request"); // $1,008.00 waiting for approval
    const annual = await annualOf(world);

    const view = await db.transaction((tx) => getReviewView(tx, world.accountant, annual.id));
    expect(view?.reopenExpenses).toEqual({ committed: 0, spent: 0, pending: 100_800 });

    await expect(reopen(world, annual.id, annual.version)).rejects.toThrow(RuleError);
    await expect(reopen(world, annual.id, annual.version)).rejects.toThrow(/\$1,008\.00/);

    const result = await reopen(world, annual.id, annual.version, true);
    expect(result.status).toBe("returned");
  });

  it("reopens without the warning when no expenses rely on it", async () => {
    const world = await expenseWorld(db);
    const annual = await annualOf(world);
    const view = await db.transaction((tx) => getReviewView(tx, world.accountant, annual.id));
    expect(view?.reopenExpenses).toBeNull();
    expect((await reopen(world, annual.id, annual.version)).status).toBe("returned");
  });
});
