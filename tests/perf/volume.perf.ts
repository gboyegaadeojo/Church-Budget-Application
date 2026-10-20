import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { desc, eq, sql } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, expenseSubmissions, spendingEntries } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { listActivity } from "@/domain/analytics/activity";
import { getOverview } from "@/domain/analytics/overview";
import { spendingOverview } from "@/domain/analytics/spending";
import { getReviewDashboard } from "@/domain/annual/review-queries";
import { boardDecide } from "@/domain/expenses/board";
import { accountantDecide } from "@/domain/expenses/review";
import { allExpenses } from "@/domain/expenses/review-queries";
import { loadExpense } from "@/domain/expenses/service";
import {
  accountantDashboard,
  boardApprovals,
  paymentsToday,
  spendingSummary,
} from "@/domain/home/dashboards";
import { atAGlance } from "@/domain/home/glance";
import { globalSearch } from "@/domain/search";
import { spendingDashboard } from "@/domain/spending/dashboard";
import { buildSpendingExport } from "@/domain/spending/export";
import { getLedger } from "@/domain/spending/ledger";
import { recordEntry } from "@/domain/spending/service";
import { expenseTasks } from "@/domain/tasks/expenses";
import type { Viewer } from "@/lib/roles";
import { createTestDb, type TestDb } from "../integration/helpers/db";
import {
  expenseWorld,
  person,
  submitted,
  type ExpenseWorld,
} from "../integration/helpers/expenses";
import {
  insertApprovedBudget,
  insertDepartment,
  insertUser,
} from "../integration/helpers/fixtures";

/*
 * Stage 5 performance check (Requirements 13.1, FR-52 "a full year of data"). Seeds one
 * budget year at about three times the church's size, then times the server work behind
 * each main page. Run with `npm run test:perf` (PGlite in-process, or TEST_DATABASE_URL
 * for real Postgres). Results go in docs/performance.md.
 */

const SCALE = {
  departments: 40,
  expenses: 2_000,
  spendingEntries: 5_000,
  auditEvents: 50_000,
};
/** Generous on purpose: this catches a query that grows with the data, not small drift. */
const BUDGET_MS = 1_500;
const RUNS = 5;

let t: TestDb;
let db: Db;
let world: ExpenseWorld;
let admin: Awaited<ReturnType<typeof person>>;
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
const results: { name: string; median: number; max: number }[] = [];

const viewer = (p: ExpenseWorld["accountant"]): Viewer => ({
  id: p.id,
  name: p.name,
  email: p.email,
  roles: p.roles,
  departments: p.departments,
});

/** Copies one row `n` times with `insert … select`, overriding columns with SQL. */
async function duplicate(
  table: PgTable,
  templateId: string,
  n: number,
  overrides: Record<string, string>,
) {
  const { name, columns: all } = getTableConfig(table);
  const columns = all.map((c) => c.name);
  const values = columns.map((c) =>
    c === "id" ? "gen_random_uuid()" : (overrides[c] ?? `t."${c}"`),
  );
  await db.execute(
    sql.raw(`insert into "${name}" (${columns.map((c) => `"${c}"`).join(", ")})
      select ${values.join(", ")} from "${name}" t, generate_series(1, ${n}) g
      where t.id = '${templateId}'`),
  );
}

async function approve(id: string) {
  for (const [actor, decide] of [
    [world.accountant, accountantDecide],
    [world.chair, boardDecide],
  ] as const) {
    const row = await loadExpense(db, id);
    await run((tx) =>
      decide(tx, actor, {
        id,
        version: row.version,
        idempotencyKey: randomUUID(),
        decision: { kind: "approve" },
      }),
    );
  }
}

async function time(name: string, fn: () => Promise<unknown>) {
  const took: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    await fn();
    took.push(performance.now() - start);
  }
  took.sort((a, b) => a - b);
  const result = { name, median: Math.round(took[RUNS >> 1]), max: Math.round(took[RUNS - 1]) };
  results.push(result);
  return result;
}

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  world = await expenseWorld(db);
  admin = await person(db, ["system_admin"]);
  const owner = await insertUser(db);
  const departmentIds = [world.media.id];
  for (let i = 1; i < SCALE.departments; i++) {
    const dept = await insertDepartment(db);
    departmentIds.push(dept.id);
    await insertApprovedBudget(
      db,
      {
        cycleId: world.cycle.id,
        departmentId: dept.id,
        userId: owner.id,
        approverUserId: world.accountant.id,
      },
      1_000_000 + i * 10_000,
      { released: true },
    );
  }
  const ids = `array['${departmentIds.join("','")}']::uuid[]`;
  const y = world.cycle.budgetYear;

  // One real approved expense and one real spending entry, copied across the departments.
  const { expenseId } = await submitted(db, world, "purchase_request");
  await approve(expenseId);
  const statuses = `(array['submitted','in_review','awaiting_board','approved','paid','approved'])[1 + g % 6]::expense_status`;
  await duplicate(expenseSubmissions, expenseId, SCALE.expenses, {
    reference_number: `'EXP-${y}-P' || lpad(g::text, 5, '0')`,
    department_id: `(${ids})[1 + g % ${SCALE.departments}]`,
    status: statuses,
    submitted_at: `t.submitted_at - (g % 300) * interval '1 day'`,
    created_at: `t.created_at - (g % 300) * interval '1 day'`,
    version: "1",
  });

  const { entryId } = await run((tx) =>
    recordEntry(tx, world.office, {
      cycleId: world.cycle.id,
      departmentId: world.media.id,
      entryType: "expense",
      spentOn: `${y}-03-15`,
      payee: "Long & McQuade",
      description: "Monitors",
      amount: "125.00",
      paymentMethod: "cheque",
      idempotencyKey: randomUUID(),
      confirmUnbudgeted: true,
      allowOutsideYear: true,
    }),
  );
  await duplicate(spendingEntries, entryId, SCALE.spendingEntries, {
    department_id: `(${ids})[1 + g % ${SCALE.departments}]`,
    budget_request_id: "null",
    spent_on: `date '${y}-01-01' + (g % 360)`,
  });

  // The activity log: copies of what the setup wrote, spread over the year.
  const [{ id: auditId }] = await db
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(eq(auditEvents.area, "expenses"))
    .orderBy(desc(auditEvents.eventTimestamp))
    .limit(1);
  await duplicate(auditEvents, auditId, SCALE.auditEvents, {
    department_id: `(${ids})[1 + g % ${SCALE.departments}]`,
    event_timestamp: `t.event_timestamp - (g % 365) * interval '1 day' - g * interval '1 second'`,
  });
  await db.execute(sql`analyze`);
}, 600_000);

afterAll(async () => {
  await t?.close();
});

describe("main pages stay fast with a full year of data", () => {
  const cases: [string, () => Promise<unknown>][] = [
    ["Home: At a glance (accountant)", () => atAGlance(db, viewer(world.accountant))],
    ["Home: expense tasks (accountant)", () => expenseTasks(db, viewer(world.accountant))],
    [
      "Home: Needs you today and season (accountant)",
      () => accountantDashboard(db, viewer(world.accountant), new Date()),
    ],
    [
      "Home: spending and pipeline (accountant)",
      () => spendingSummary(db, viewer(world.accountant), new Date()),
    ],
    [
      "Home: approvals waiting (Board Chair)",
      () => boardApprovals(db, viewer(world.chair), new Date()),
    ],
    ["Home: Ready to pay (office)", () => paymentsToday(db, viewer(world.office), new Date())],
    [
      "Home: Recent activity (admin)",
      () => listActivity(db, admin, { recent: true }, { pageSize: 8 }),
    ],
    ["Annual review dashboard", () => getReviewDashboard(db, world.accountant)],
    ["Analytics Overview", () => getOverview(db, world.accountant)],
    ["Analytics Overview: spending and expenses", () => spendingOverview(db, world.accountant)],
    ["Expenses: All", () => allExpenses(db, world.accountant)],
    ["Spending dashboard", () => spendingDashboard(db, world.office)],
    ["Spending ledger", () => getLedger(db, world.office)],
    [
      "Spending export (workbook data)",
      () => buildSpendingExport(db, world.office, { cycleId: world.cycle.id }),
    ],
    ["Activity tab, page 1 (admin)", () => listActivity(db, admin, {})],
    ["Activity tab, page 500 (admin)", () => listActivity(db, admin, { page: 500 })],
    ["Activity tab, search (admin)", () => listActivity(db, admin, { q: "Media" })],
    ["Activity tab (accountant scope)", () => listActivity(db, world.accountant, {})],
    ["Global search", () => run((tx) => globalSearch(tx, world.accountant, "EXP-"))],
  ];
  for (const [name, fn] of cases) {
    it(`${name} under ${BUDGET_MS} ms`, async () => {
      const { median } = await time(name, fn);
      expect(median).toBeLessThan(BUDGET_MS);
    });
  }

  it("writes the results to test-results/performance.md", async () => {
    const table = [
      `${SCALE.departments} departments, ${SCALE.expenses} expenses, ` +
        `${SCALE.spendingEntries} spending entries, ${SCALE.auditEvents} audit events; ` +
        `median and slowest of ${RUNS} runs.`,
      "",
      "| Page or query | Median (ms) | Slowest (ms) |",
      "|---|---:|---:|",
      ...results.map((r) => `| ${r.name} | ${r.median} | ${r.max} |`),
      "",
    ].join("\n");
    await mkdir("test-results", { recursive: true });
    await writeFile("test-results/performance.md", table);
  });
});
