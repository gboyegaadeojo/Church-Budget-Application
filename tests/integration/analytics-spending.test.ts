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
import {
  insertApprovedBudget,
  insertCycle,
  insertDepartment,
  insertUser,
} from "./helpers/fixtures";

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

describe("the Overview's filters and turnaround (FR-52)", () => {
  it("narrows to one department and a date range, and times each approval step", async () => {
    const world = await expenseWorld(db, { budgetCents: 3_360_000 });
    const y = world.cycle.budgetYear;
    const owner = await insertUser(db);
    const youth = await insertDepartment(db, { name: `Youth ${randomUUID().slice(0, 6)}` });
    await insertApprovedBudget(
      db,
      {
        cycleId: world.cycle.id,
        departmentId: youth.id,
        userId: owner.id,
        approverUserId: world.accountant.id,
      },
      500_000,
    );
    await record(world, world.cycle.id, `${y}-03-15`, "100");
    await record(world, world.cycle.id, `${y}-09-15`, "50");
    await run((tx) =>
      recordEntry(tx, world.office, {
        cycleId: world.cycle.id,
        departmentId: youth.id,
        entryType: "expense",
        spentOn: `${y}-03-20`,
        payee: "Camp",
        description: "Camp",
        amount: "40",
        paymentMethod: "cheque",
        idempotencyKey: randomUUID(),
      }),
    );

    const media = await spendingOverview(db, world.office, world.cycle.id, {
      departmentId: world.media.id,
    });
    expect(media!.dashboard.rows.map((r) => r.departmentId)).toEqual([world.media.id]);
    expect(media!.dashboard.totals.spent).toBe(15_000);
    expect(media!.departments.length).toBeGreaterThanOrEqual(2);

    const march = await spendingOverview(db, world.office, world.cycle.id, {
      departmentId: world.media.id,
      from: `${y}-03-01`,
      to: `${y}-03-31`,
    });
    expect(march!.months[2].cents).toBe(10_000);
    expect(march!.months[8].cents).toBe(0);

    // Unknown filter values are dropped rather than trusted.
    const junk = await spendingOverview(db, world.office, world.cycle.id, {
      departmentId: "not-a-uuid",
      from: "yesterday",
    });
    expect(junk!.filters).toEqual({ departmentId: undefined, from: undefined, to: undefined });

    // One waiting on both approvers, one the accountant has decided.
    const waiting = await submitted(db, world, "purchase_request");
    const decided = await submitted(db, world, "expense_claim");
    await approve(world, decided.expenseId, "accountant");
    const later = new Date("2026-10-25T17:00:00Z");
    const timed = await spendingOverview(db, world.office, world.cycle.id, {}, later);
    expect(timed!.turnaround.decided).toBe(1);
    expect(timed!.turnaround.accountantDays).not.toBeNull();
    expect(timed!.turnaround.boardDays).toBeNull();
    expect(timed!.turnaround.slowest[0]).toMatchObject({ id: waiting.expenseId, days: 5 });
  });
});
