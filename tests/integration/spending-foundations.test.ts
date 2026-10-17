import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { budgetAmendments, budgetRequests } from "@/db/schema";
import type { Db } from "@/db/types";
import { budgetFigures } from "@/domain/expenses/budget";
import { createTestDb, type TestDb } from "./helpers/db";
import { expenseWorld } from "./helpers/expenses";

/** Stage 4 foundations: amendments in the budget figures (FR-25, FR-27, 9.16). */

let t: TestDb;
let db: Db;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t?.close();
});

describe("budget amendments (9.16)", () => {
  it("add to Available without changing the approved total, and can't be changed", async () => {
    const world = await expenseWorld(db, { budgetCents: 3_360_000 });
    const [annual] = await db
      .select({ id: budgetRequests.id })
      .from(budgetRequests)
      .where(
        and(
          eq(budgetRequests.budgetCycleId, world.cycle.id),
          eq(budgetRequests.departmentId, world.media.id),
        ),
      );
    const [amendment] = await db
      .insert(budgetAmendments)
      .values({
        budgetRequestId: annual.id,
        departmentId: world.media.id,
        budgetCycleId: world.cycle.id,
        amountBeforeTaxCents: 500_000,
        taxCents: 60_000,
        amountCents: 560_000,
        taxRate: "0.1200",
        reason: "Board approved a new camera.",
        createdByUserId: world.accountant.id,
      })
      .returning();
    expect(await budgetFigures(db, world.cycle.id, world.media.id)).toMatchObject({
      approved: 3_360_000,
      amendments: 560_000,
      available: 3_920_000,
      remaining: 3_920_000,
    });

    await expect(
      db
        .update(budgetAmendments)
        .set({ reason: "Changed" })
        .where(eq(budgetAmendments.id, amendment.id)),
    ).rejects.toThrow();
    await expect(
      db.insert(budgetAmendments).values({
        budgetRequestId: annual.id,
        departmentId: world.media.id,
        budgetCycleId: world.cycle.id,
        amountBeforeTaxCents: 100,
        taxCents: 12,
        amountCents: 999,
        taxRate: "0.1200",
        reason: "Doesn't add up",
        createdByUserId: world.accountant.id,
      }),
    ).rejects.toThrow();
  });
});
