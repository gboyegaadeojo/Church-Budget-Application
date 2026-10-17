import "server-only";
import ExcelJS from "exceljs";
import { exportsCopy } from "@/copy/exports";
import { spendingCopy } from "@/copy/spending";
import type { SpendingExport } from "@/domain/spending/export";
import { sumCents } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/time-zone";
import { addLogo } from "./logo";
import { CAD_FORMAT, centsToDollars, RATE_FORMAT, safeText } from "./safe";

/**
 * The spending workbook (FR-26 Export): Budget vs Actual, Ledger and Amendments sheets.
 * Amounts are numbers in CAD format written from the server's figures (no formulas), so
 * the Budget vs Actual totals match the Spending dashboard to the cent (AC-91). User text
 * is guarded against formula injection (AC-96).
 */

const w = exportsCopy.workbook;
const x = exportsCopy.spending;
const c = x.columns;
const d = spendingCopy.dashboard;
const HEADER_ROWS = 4;

type Column = {
  header: string;
  key: string;
  width: number;
  money?: boolean;
  rate?: boolean;
  percent?: boolean;
};

function sheet(book: ExcelJS.Workbook, name: string, data: SpendingExport, columns: Column[]) {
  const s = book.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: HEADER_ROWS + 1 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  s.getRow(1).getCell(1).value = safeText(w.title(data.brand.churchName, data.brand.appName));
  s.getRow(1).font = { bold: true, size: 14 };
  s.getRow(2).getCell(1).value = safeText(
    [x.workbookTitle(data.cycle.name), data.cycle.locked ? x.locked : ""].filter(Boolean).join(" "),
  );
  s.getRow(2).font = { bold: true };
  s.getRow(3).getCell(1).value = w.generated(formatDateTime(data.generatedAt, data.zone));
  s.getRow(4).getCell(1).value = safeText(w.filters(data.filterLabels));
  const header = s.getRow(HEADER_ROWS + 1);
  columns.forEach((col, i) => {
    const column = s.getColumn(i + 1);
    column.key = col.key;
    column.width = col.width;
    if (col.money) column.numFmt = CAD_FORMAT;
    if (col.rate) column.numFmt = RATE_FORMAT;
    if (col.percent) column.numFmt = "0.0%";
    header.getCell(i + 1).value = col.header;
  });
  header.font = { bold: true };
  header.alignment = { vertical: "middle", wrapText: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EDF3" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FF8A94A3" } } };
  });
  s.autoFilter = {
    from: { row: HEADER_ROWS + 1, column: 1 },
    to: { row: HEADER_ROWS + 1, column: columns.length },
  };
  addLogo(book, s, data.logo, columns.length);
  return s;
}

const money = (cents: number) => centsToDollars(cents);
/** Tenths of a percent as a fraction for Excel's % format: 432 → 0.432. */
const percent = (tenths: number | null) => (tenths === null ? null : tenths / 1000);

function totalRow(s: ExcelJS.Worksheet, values: Record<string, unknown>) {
  const row = s.addRow({ ...values });
  row.font = { bold: true };
  row.border = { top: { style: "thin" } };
}

export async function spendingWorkbook(data: SpendingExport): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = data.brand.appName;
  book.created = data.generatedAt;

  const budget = sheet(book, x.sheetNames.budget, data, [
    { header: c.department, key: "department", width: 28 },
    { header: c.approved, key: "approved", width: 15, money: true },
    { header: c.amendments, key: "amendments", width: 15, money: true },
    { header: c.available, key: "available", width: 15, money: true },
    { header: c.committed, key: "committed", width: 15, money: true },
    { header: c.spent, key: "spent", width: 15, money: true },
    { header: c.remaining, key: "remaining", width: 15, money: true },
    { header: c.used, key: "used", width: 9, percent: true },
    { header: c.status, key: "status", width: 20 },
    { header: c.unbudgeted, key: "unbudgeted", width: 15, money: true },
    { header: c.lastEntry, key: "lastEntry", width: 14 },
  ]);
  for (const r of data.rows) {
    budget.addRow({
      department: safeText(r.department),
      approved: money(r.figures.approved),
      amendments: money(r.figures.amendments),
      available: money(r.figures.available),
      committed: money(r.figures.committed),
      spent: money(r.figures.spent),
      remaining: money(r.figures.remaining),
      used: percent(r.usedTenths),
      status: d.status[r.status],
      unbudgeted: r.unbudgetedCents ? money(r.unbudgetedCents) : null,
      lastEntry: r.lastEntryOn ? formatDate(r.lastEntryOn) : "",
    });
  }
  const t = data.totals;
  totalRow(budget, {
    department: w.total,
    approved: money(t.approved),
    amendments: money(t.amendments),
    available: money(t.available),
    committed: money(t.committed),
    spent: money(t.spent),
    remaining: money(t.remaining),
    used: percent(t.usedTenths),
  });

  const ledger = sheet(book, x.sheetNames.ledger, data, [
    { header: c.date, key: "date", width: 14 },
    { header: c.department, key: "department", width: 24 },
    { header: c.payee, key: "payee", width: 22 },
    { header: c.description, key: "description", width: 34 },
    { header: c.type, key: "type", width: 10 },
    { header: c.amount, key: "amount", width: 14, money: true },
    { header: c.method, key: "method", width: 20 },
    { header: c.reference, key: "reference", width: 20 },
    { header: c.expense, key: "expense", width: 16 },
    { header: c.entryStatus, key: "status", width: 14 },
    { header: c.enteredBy, key: "enteredBy", width: 20 },
  ]);
  for (const r of data.ledger) {
    ledger.addRow({
      date: formatDate(r.spentOn),
      department: safeText(r.department),
      payee: safeText(r.payee),
      description: safeText(r.description),
      type: spendingCopy.types[r.entryType],
      amount: money(r.entryType === "refund" ? -r.amountCents : r.amountCents),
      method: r.paymentMethod
        ? (spendingCopy.methods[r.paymentMethod] ?? safeText(r.paymentMethod))
        : "",
      reference: safeText(r.referenceNumber),
      expense: safeText(r.expense?.reference),
      status: [
        spendingCopy.ledgerStatus[r.status],
        r.unbudgeted ? spendingCopy.ledgerStatus.unbudgeted : "",
      ]
        .filter(Boolean)
        .join(", "),
      enteredBy: safeText(r.enteredBy),
    });
  }
  if (data.ledger.length > 0) {
    // Voided entries stay listed but don't count, as on the dashboard.
    totalRow(ledger, {
      date: x.ledgerTotal,
      amount: money(
        sumCents(
          data.ledger
            .filter((r) => r.status === "recorded")
            .map((r) => (r.entryType === "refund" ? -r.amountCents : r.amountCents)),
        ),
      ),
    });
  }

  const amendments = sheet(book, x.sheetNames.amendments, data, [
    { header: c.createdAt, key: "createdAt", width: 22 },
    { header: c.department, key: "department", width: 24 },
    { header: c.beforeTax, key: "beforeTax", width: 15, money: true },
    { header: c.tax, key: "tax", width: 13, money: true },
    { header: c.total, key: "total", width: 15, money: true },
    { header: c.rate, key: "rate", width: 9, rate: true },
    { header: c.reason, key: "reason", width: 40 },
    { header: c.boardReference, key: "boardReference", width: 20 },
    { header: c.by, key: "by", width: 20 },
  ]);
  for (const a of data.amendments) {
    amendments.addRow({
      createdAt: formatDateTime(a.createdAt, data.zone),
      department: safeText(a.department),
      beforeTax: money(a.amountBeforeTaxCents),
      tax: money(a.taxCents),
      total: money(a.amountCents),
      rate: Number(a.rate),
      reason: safeText(a.reason),
      boardReference: safeText(a.boardReference),
      by: safeText(a.by),
    });
  }
  if (data.amendments.length > 1) {
    totalRow(amendments, {
      createdAt: w.total,
      beforeTax: money(sumCents(data.amendments.map((a) => a.amountBeforeTaxCents))),
      tax: money(sumCents(data.amendments.map((a) => a.taxCents))),
      total: money(sumCents(data.amendments.map((a) => a.amountCents))),
    });
  }

  ledger.getColumn("description").alignment = { wrapText: true, vertical: "top" };
  amendments.getColumn("reason").alignment = { wrapText: true, vertical: "top" };
  return Buffer.from(await book.xlsx.writeBuffer());
}
