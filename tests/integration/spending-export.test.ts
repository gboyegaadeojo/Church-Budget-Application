import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents } from "@/db/schema";
import type { Db } from "@/db/types";
import { amendBudget } from "@/domain/spending/amendments";
import { spendingDashboard } from "@/domain/spending/dashboard";
import { buildSpendingExport } from "@/domain/spending/export";
import { recordEntry, voidEntry } from "@/domain/spending/service";
import { ForbiddenError } from "@/lib/authz";
import { spendingWorkbook } from "@/lib/excel/spending-workbook";
import { createTestDb, type TestDb } from "./helpers/db";
import { expenseWorld, person, type ExpenseWorld } from "./helpers/expenses";
import { insertApprovedBudget, insertDepartment, insertUser } from "./helpers/fixtures";

/** The spending workbook (FR-26 Export, AC-91, AC-96). */

let t: TestDb;
let db: Db;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t?.close();
});

const record = (
  world: ExpenseWorld,
  departmentId: string,
  overrides: Record<string, unknown> = {},
) =>
  db.transaction((tx) =>
    recordEntry(tx, world.office, {
      cycleId: world.cycle.id,
      departmentId,
      entryType: "expense",
      spentOn: `${world.cycle.budgetYear}-03-15`,
      payee: "Long & McQuade",
      description: "Monitors",
      amount: "1000",
      paymentMethod: "cheque",
      referenceNumber: "CHQ-1",
      idempotencyKey: randomUUID(),
      ...overrides,
    }),
  );

async function read(buffer: Buffer) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as unknown as ArrayBuffer);
  return book;
}

/** The row whose first cell is `label`, as { header: value } using row 5's headers. */
function rowNamed(sheet: ExcelJS.Worksheet, label: string) {
  const headers = (sheet.getRow(5).values as unknown[]).map(String);
  let found: Record<string, unknown> | null = null;
  sheet.eachRow((row) => {
    if (row.getCell(1).value === label) {
      found = {};
      headers.forEach((h, i) => {
        if (i > 0) found![h] = row.getCell(i).value;
      });
    }
  });
  return found as Record<string, unknown> | null;
}

describe("the spending workbook", () => {
  it("AC-91 the Budget vs Actual export matches the Spending dashboard to the cent", async () => {
    const world = await expenseWorld(db, { budgetCents: 3_360_000 });
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
    await record(world, world.media.id, { amount: "10,000.33" });
    await record(world, world.media.id, {
      entryType: "refund",
      amount: "0.10",
      payee: '=HYPERLINK("http://evil")',
    });
    const { entryId } = await record(world, youth.id, { amount: "400" });
    await db.transaction((tx) =>
      voidEntry(tx, world.office, { id: entryId, version: 1, reason: "Entered twice." }),
    );
    await record(world, youth.id, { amount: "1,234.56", payee: "Camp" });
    await db.transaction((tx) =>
      amendBudget(tx, world.accountant, {
        cycleId: world.cycle.id,
        departmentId: youth.id,
        direction: "increase",
        amount: "560.00",
        reason: "The board agreed.",
        idempotencyKey: randomUUID(),
      }),
    );

    const data = await db.transaction((tx) =>
      buildSpendingExport(tx, world.office, { cycleId: world.cycle.id }),
    );
    const book = await read(await spendingWorkbook(data));
    const dash = await spendingDashboard(db, world.accountant, world.cycle.id);
    const budget = book.getWorksheet("Budget vs Actual")!;
    const total = rowNamed(budget, "Total")!;
    const dollars = (cents: number) => cents / 100;
    expect(total).toMatchObject({
      Approved: dollars(dash!.totals.approved),
      Amendments: dollars(dash!.totals.amendments),
      Available: dollars(dash!.totals.available),
      Committed: dollars(dash!.totals.committed),
      Spent: dollars(dash!.totals.spent),
      Remaining: dollars(dash!.totals.remaining),
    });
    const media = rowNamed(budget, world.media.name)!;
    // $10,000.33 − $0.10 refund.
    expect(media.Spent).toBe(10_000.23);
    expect(rowNamed(budget, youth.name)).toMatchObject({ Amendments: 560, Spent: 1_234.56 });

    const ledger = book.getWorksheet("Ledger")!;
    let payees: unknown[] = [];
    ledger.eachRow((row, n) => {
      if (n > 5) payees.push(row.getCell(3).value);
    });
    payees = payees.filter(Boolean);
    expect(payees).toContain(`'=HYPERLINK("http://evil")`);
    const spent = rowNamed(ledger, "Total spent (voided entries not counted)")!;
    expect(spent.Amount).toBe(dollars(dash!.totals.spent));
    expect(book.getWorksheet("Amendments")!.rowCount).toBe(6);

    const [audit] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, "spending.exported"),
          eq(auditEvents.cycleId, world.cycle.id),
        ),
      );
    expect(audit).toBeTruthy();
  });

  it("one department's export holds only its rows, and requesters and the board can't export", async () => {
    const world = await expenseWorld(db, { budgetCents: 100_000 });
    await record(world, world.media.id, { amount: "250" });
    const data = await db.transaction((tx) =>
      buildSpendingExport(tx, world.accountant, {
        cycleId: world.cycle.id,
        departmentId: world.media.id,
      }),
    );
    expect(data.rows.map((r) => r.departmentId)).toEqual([world.media.id]);
    expect(data.totals).toMatchObject({ available: 100_000, spent: 25_000, remaining: 75_000 });
    expect(data.totals.usedTenths).toBe(250);
    expect(data.fileName).toMatch(/^Spending_\d{4}_Media/);

    for (const who of [world.requester, world.chair]) {
      await expect(
        db.transaction((tx) => buildSpendingExport(tx, who, { cycleId: world.cycle.id })),
      ).rejects.toThrow(ForbiddenError);
    }
    const admin = await person(db, ["system_admin"]);
    await expect(
      db.transaction((tx) => buildSpendingExport(tx, admin, { cycleId: world.cycle.id })),
    ).resolves.toBeTruthy();
  });
});
