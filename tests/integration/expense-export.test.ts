import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { boardDecide } from "@/domain/expenses/board";
import { buildExpenseExport } from "@/domain/expenses/export";
import { recordPayment } from "@/domain/expenses/payment";
import { accountantDecide } from "@/domain/expenses/review";
import { loadExpense } from "@/domain/expenses/service";
import { ForbiddenError } from "@/lib/authz";
import { expenseWorkbook } from "@/lib/excel/expense-workbook";
import { createTestDb, type TestDb } from "./helpers/db";
import { expenseWorld, person, PURCHASE, submitted } from "./helpers/expenses";

/** The expense workbook (FR-50, AC-95, AC-96, AC-110). */

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

async function act<T>(
  id: string,
  fn: (tx: Tx, input: { id: string; version: number; idempotencyKey: string }) => Promise<T>,
) {
  const row = await loadExpense(db, id);
  return run((tx) => fn(tx, { id, version: row.version, idempotencyKey: randomUUID() }));
}

async function read(buffer: Buffer) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as unknown as ArrayBuffer);
  return book;
}

describe("the expense workbook", () => {
  it("has every submission, line, payment and budget, to the cent, with text made safe", async () => {
    const world = await expenseWorld(db);
    const pr = await submitted(db, world, "purchase_request", {
      ...PURCHASE,
      title: '=HYPERLINK("http://evil")',
    });
    const claim = await submitted(db, world, "expense_claim");
    for (const id of [claim.expenseId]) {
      for (const [actor, decide] of [
        [world.accountant, accountantDecide],
        [world.chair, boardDecide],
      ] as const) {
        await act(id, (tx, input) =>
          decide(tx, actor, { ...input, decision: { kind: "approve" } }),
        );
      }
      await act(id, (tx, input) =>
        recordPayment(tx, world.office, {
          ...input,
          payment: {
            method: "e_transfer",
            paidOn: "2026-10-12",
            amount: "168.00",
            reference: "Z9",
          },
        }),
      );
    }

    const data = await run((tx) =>
      buildExpenseExport(tx, world.accountant, { cycleId: world.cycle.id }),
    );
    expect(data.rows.map((r) => r.reference)).toEqual(
      [pr.referenceNumber, claim.referenceNumber].sort(),
    );
    expect(data.payments).toEqual([
      expect.objectContaining({
        amountCents: 16_800,
        paymentReference: "Z9",
        method: "e_transfer",
      }),
    ]);
    expect(data.budgets).toEqual([
      expect.objectContaining({
        figures: expect.objectContaining({ available: 3_000_000, spent: 16_800, pending: 100_800 }),
      }),
    ]);

    const book = await read(await expenseWorkbook(data));
    expect(book.worksheets.map((s) => s.name)).toEqual([
      "Expenses",
      "Lines",
      "Receipts",
      "Payments",
      "Budget",
    ]);
    const sheet = book.getWorksheet("Expenses")!;
    const titles: string[] = [];
    const totals: number[] = [];
    sheet.eachRow((row, n) => {
      if (n <= 5) return;
      titles.push(String(row.getCell(6).value ?? ""));
      totals.push(Number(row.getCell(12).value ?? 0));
    });
    // AC-96: text that starts like a formula is stored as plain text.
    expect(titles).toContain('\'=HYPERLINK("http://evil")');
    // AC-95: the requested totals and their sum are the app's figures.
    expect(totals).toEqual([1008, 168, 1176]);
    const payments = book.getWorksheet("Payments")!;
    expect(payments.getRow(6).getCell(7).value).toBe(168);

    const [audited] = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "expenses.exported"));
    expect(audited).toBeDefined();
  });

  it("filters payments by date", async () => {
    const world = await expenseWorld(db);
    const data = await run((tx) =>
      buildExpenseExport(tx, world.office, {
        cycleId: world.cycle.id,
        from: "2026-11-01",
        to: "2026-11-30",
      }),
    );
    expect(data.payments).toEqual([]);
    expect(data.filterLabels).toContain("Paid 2026-11-01 to 2026-11-30");
  });

  it("is for the accountant, the Church Administrator and the System Administrator only", async () => {
    const world = await expenseWorld(db);
    const admin = await person(db, ["system_admin"]);
    await run((tx) => buildExpenseExport(tx, admin, { cycleId: world.cycle.id }));
    for (const who of [world.requester, world.chair]) {
      await expect(
        run((tx) => buildExpenseExport(tx, who, { cycleId: world.cycle.id })),
      ).rejects.toThrow(ForbiddenError);
    }
  });
});
