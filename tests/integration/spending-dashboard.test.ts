import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { budgetRequests, emailOutbox } from "@/db/schema";
import type { Db } from "@/db/types";
import { RuleError, ValidationError } from "@/domain/errors";
import { budgetFigures } from "@/domain/expenses/budget";
import { amendBudget } from "@/domain/spending/amendments";
import { departmentSpending, spendingDashboard } from "@/domain/spending/dashboard";
import { getLedger } from "@/domain/spending/ledger";
import { recordEntry } from "@/domain/spending/service";
import { ForbiddenError } from "@/lib/authz";
import { createTestDb, type TestDb } from "./helpers/db";
import { expenseWorld, person, type ExpenseWorld } from "./helpers/expenses";

/** The spending dashboard, the ledger's filters and amendments (FR-25 to FR-27). */

let t: TestDb;
let db: Db;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t?.close();
});

const record = (world: ExpenseWorld, overrides: Record<string, unknown> = {}) =>
  db.transaction((tx) =>
    recordEntry(tx, world.office, {
      cycleId: world.cycle.id,
      departmentId: world.media.id,
      entryType: "expense",
      spentOn: `${world.cycle.budgetYear}-03-15`,
      payee: "Long & McQuade",
      description: "Monitors",
      amount: "1000",
      paymentMethod: "cheque",
      idempotencyKey: randomUUID(),
      ...overrides,
    }),
  );

const amend = (
  actor: Parameters<typeof amendBudget>[1],
  world: ExpenseWorld,
  input: Record<string, unknown>,
) =>
  db.transaction((tx) =>
    amendBudget(tx, actor, {
      cycleId: world.cycle.id,
      departmentId: world.media.id,
      idempotencyKey: randomUUID(),
      reason: "The board agreed.",
      ...input,
    }),
  );

describe("amendments (FR-27, AC-84)", () => {
  it("a $5,600.00 increase is $5,000.00 + $600.00 tax and raises Available to $39,200.00", async () => {
    const world = await expenseWorld(db, { budgetCents: 3_360_000 });
    const result = await amend(world.accountant, world, {
      direction: "increase",
      amount: "5,600.00",
      boardReference: "Minutes 2027-04",
    });
    expect(result.availableCents).toBe(3_920_000);
    const view = await departmentSpending(db, world.accountant, world.cycle.id, world.media.id);
    expect(view?.figures).toMatchObject({ approved: 3_360_000, available: 3_920_000 });
    expect(view?.amendments[0]).toMatchObject({
      amountBeforeTaxCents: 500_000,
      taxCents: 60_000,
      amountCents: 560_000,
    });
    // The original approved total is unchanged.
    const [request] = await db
      .select({ total: budgetRequests.approvedTotalCents })
      .from(budgetRequests)
      .where(
        and(
          eq(budgetRequests.budgetCycleId, world.cycle.id),
          eq(budgetRequests.departmentId, world.media.id),
        ),
      );
    expect(request.total).toBe(3_360_000);
    // The department's leaders are emailed the new available budget.
    const [email] = await db
      .select()
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.template, "spending.amended"),
          eq(emailOutbox.toEmail, world.requester.email),
        ),
      );
    expect(email.textBody).toContain("$39,200.00");
  });

  it("warns before a reduction makes Remaining negative, and only the accountant amends", async () => {
    const world = await expenseWorld(db, { budgetCents: 100_000 });
    await record(world, { amount: "800" });
    await expect(
      amend(world.accountant, world, { direction: "reduction", amount: "500" }),
    ).rejects.toThrow(ValidationError);
    await amend(world.accountant, world, {
      direction: "reduction",
      amount: "500",
      confirmNegative: true,
    });
    expect((await budgetFigures(db, world.cycle.id, world.media.id)).remaining).toBe(-30_000);
    // AC-88: the Church Administrator can't amend.
    await expect(
      amend(world.office, world, { direction: "increase", amount: "5" }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      amend(world.accountant, world, { direction: "increase", amount: "0" }),
    ).rejects.toThrow(ValidationError);
  });

  it("refuses a department with no approved budget", async () => {
    const world = await expenseWorld(db);
    const other = { ...world, media: { ...world.media, id: randomUUID() } };
    await expect(
      amend(world.accountant, other, { direction: "increase", amount: "5" }),
    ).rejects.toThrow(RuleError);
  });
});

describe("the dashboard and ledger (FR-25, FR-26)", () => {
  it("sums each department into the totals, and the ledger filters narrow entries", async () => {
    const world = await expenseWorld(db, { budgetCents: 3_360_000 });
    await record(world, { amount: "10,000.00" });
    await record(world, { amount: "5,000.00", payee: "B&H", paymentMethod: "e_transfer" });
    await record(world, { entryType: "refund", amount: "500.00", payee: "Refund Co" });

    const dash = await spendingDashboard(db, world.accountant, world.cycle.id);
    const media = dash!.rows.find((r) => r.departmentId === world.media.id)!;
    expect(media.figures).toMatchObject({ spent: 1_450_000, remaining: 1_910_000 });
    expect(media.usedTenths).toBe(432);
    expect(media.status).toBe("on_track");
    expect(dash!.totals.spent).toBe(dash!.rows.reduce((s, r) => s + r.figures.spent, 0));

    const all = await getLedger(db, world.accountant, world.cycle.id);
    expect(all!.rows.length).toBe(3);
    const refunds = await getLedger(db, world.accountant, world.cycle.id, { type: "refund" });
    expect(refunds!.rows.map((r) => r.payee)).toEqual(["Refund Co"]);
    const byMethod = await getLedger(db, world.accountant, world.cycle.id, {
      method: "e_transfer",
    });
    expect(byMethod!.rows.map((r) => r.payee)).toEqual(["B&H"]);
    const search = await getLedger(db, world.accountant, world.cycle.id, { q: "b&h" });
    expect(search!.rows.length).toBe(1);

    // Requesters don't see the dashboard (AC-89); the board reads it.
    expect(await spendingDashboard(db, world.requester, world.cycle.id)).toBeNull();
    expect((await spendingDashboard(db, world.chair, world.cycle.id))?.readOnly).toBe(true);
    const admin = await person(db, ["system_admin"]);
    expect((await spendingDashboard(db, admin, world.cycle.id))?.canRecord).toBe(false);
  });
});
