import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db, Tx } from "@/db/types";
import { spendingOverview } from "@/domain/analytics/spending";
import { boardDecide } from "@/domain/expenses/board";
import { accountantDecide } from "@/domain/expenses/review";
import { loadExpense } from "@/domain/expenses/service";
import { spendingDashboard } from "@/domain/spending/dashboard";
import { buildSpendingExport } from "@/domain/spending/export";
import { recordEntry } from "@/domain/spending/service";
import { createTestDb, type TestDb } from "./helpers/db";
import { expenseWorld, person, submitted, type ExpenseWorld } from "./helpers/expenses";
import { insertCycle, insertUser } from "./helpers/fixtures";

/** The Overview tab's spending and expense figures (FR-52, AC-127, AC-128). */

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

const record = (world: ExpenseWorld, cycleId: string, spentOn: string, amount: string) =>
  run((tx) =>
    recordEntry(tx, world.office, {
      cycleId,
      departmentId: world.media.id,
      entryType: "expense",
      spentOn,
      payee: "Long & McQuade",
      description: "Monitors",
      amount,
      paymentMethod: "cheque",
      idempotencyKey: randomUUID(),
      confirmUnbudgeted: true,
      allowOutsideYear: true,
    }),
  );

async function approve(world: ExpenseWorld, id: string, who: "accountant" | "chair") {
  const row = await loadExpense(db, id);
  const [actor, fn] =
    who === "accountant" ? [world.accountant, accountantDecide] : [world.chair, boardDecide];
  await run((tx) =>
    fn(tx, actor, {
      id,
      version: row.version,
      idempotencyKey: randomUUID(),
      decision: { kind: "approve" },
    }),
  );
}

describe("the Overview's spending figures", () => {
  it("AC-127 match the Spending dashboard and the Budget vs Actual export to the cent", async () => {
    const world = await expenseWorld(db, { budgetCents: 3_360_000 });
    const y = world.cycle.budgetYear;
    await record(world, world.cycle.id, `${y}-03-15`, "1,000.01");
    await record(world, world.cycle.id, `${y}-03-20`, "0.99");
    await record(world, world.cycle.id, `${y}-07-01`, "250");
    const owner = await insertUser(db);
    const last = await insertCycle(db, owner.id, {
      budgetYear: y - 1,
      name: `FY${y - 1}-${randomUUID().slice(0, 4)}`,
    });
    await record(world, last.id, `${y - 1}-03-10`, "40");

    // One waiting on both approvers, one on the board only, one approved purchase.
    await submitted(db, world, "purchase_request");
    const second = await submitted(db, world, "expense_claim");
    await approve(world, second.expenseId, "accountant");
    const third = await submitted(db, world, "purchase_request");
    await approve(world, third.expenseId, "accountant");
    await approve(world, third.expenseId, "chair");

    const view = await spendingOverview(db, world.office, world.cycle.id);
    const dash = await spendingDashboard(db, world.accountant, world.cycle.id);
    const exported = await run((tx) =>
      buildSpendingExport(tx, world.accountant, { cycleId: world.cycle.id }),
    );
    expect(view!.dashboard.totals).toEqual(dash!.totals);
    expect(exported.totals).toEqual(dash!.totals);

    expect(view!.months[2]).toEqual({ month: 3, cents: 100_100, lastYearCents: 4_000 });
    expect(view!.months[6]).toMatchObject({ month: 7, cents: 25_000, lastYearCents: 0 });
    expect(view!.lastYear?.id).toBe(last.id);

    expect(view!.waiting).toEqual({
      decision: 2,
      accountant: 1,
      board: 2,
      requester: 0,
      payment: 1,
    });
    const approved = view!.pipeline.find((p) => p.status === "approved")!;
    expect(approved).toMatchObject({ count: 1, cents: 100_800 });
    expect(view!.canListExpenses).toBe(true);
  });

  it("AC-128 a requester gets nothing; the board reads it without the expense list", async () => {
    const world = await expenseWorld(db);
    expect(await spendingOverview(db, world.requester, world.cycle.id)).toBeNull();
    const board = await spendingOverview(db, world.chair, world.cycle.id);
    expect(board?.canListExpenses).toBe(false);
    expect(board?.dashboard.canExport).toBe(false);
    const admin = await person(db, ["system_admin"]);
    expect((await spendingOverview(db, admin, world.cycle.id))?.dashboard.cycle.id).toBe(
      world.cycle.id,
    );
  });
});
