import "server-only";
import ExcelJS from "exceljs";
import { exportsCopy } from "@/copy/exports";
import { expensesCopy } from "@/copy/expenses";
import type { ExpenseExport } from "@/domain/expenses/export";
import { sumCents } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/time-zone";
import { addLogo } from "./logo";
import { CAD_FORMAT, centsToDollars, RATE_FORMAT, safeText } from "./safe";

/**
 * The expense workbook (FR-50): Expenses, Lines, Receipts, Payments and Budget sheets.
 * Amounts are numbers in CAD format, written from the stored, server-calculated values
 * (no formulas), so the workbook matches the app exactly. User text is guarded against
 * formula injection (AC-96); links are http and https only.
 */

const w = exportsCopy.workbook;
const x = exportsCopy.expenses;
const c = x.columns;
const HEADER_ROWS = 4;

type Column = { header: string; key: string; width: number; money?: boolean; rate?: boolean };

function sheet(book: ExcelJS.Workbook, name: string, data: ExpenseExport, columns: Column[]) {
  const s = book.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: HEADER_ROWS + 1 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  s.getRow(1).getCell(1).value = safeText(w.title(data.brand.churchName, data.brand.appName));
  s.getRow(1).font = { bold: true, size: 14 };
  s.getRow(2).getCell(1).value = safeText(x.workbookTitle(data.cycle.name));
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

const money = (cents: number | null | undefined) => (cents == null ? null : centsToDollars(cents));
const when = (d: Date | null, zone: string) => (d ? formatDateTime(d, zone) : "");
const day = (d: string | null) => (d ? formatDate(d) : "");

function link(row: ExcelJS.Row, key: string, url: string | null, text?: string) {
  if (!url) return;
  if (/^https?:\/\//i.test(url)) {
    row.getCell(key).value = { text: safeText(text ?? url), hyperlink: url };
    row.getCell(key).font = { color: { argb: "FF1D4ED8" }, underline: true };
  } else {
    row.getCell(key).value = safeText(url);
  }
}

function totalRow(s: ExcelJS.Worksheet, values: Record<string, unknown>) {
  const row = s.addRow({ ...values });
  row.font = { bold: true };
  row.border = { top: { style: "thin" } };
}

export async function expenseWorkbook(data: ExpenseExport): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = data.brand.appName;
  book.created = data.generatedAt;
  const roles = expensesCopy.review.roles;

  const expenses = sheet(book, x.sheetNames.expenses, data, [
    { header: c.reference, key: "reference", width: 16 },
    { header: c.type, key: "type", width: 16 },
    { header: c.department, key: "department", width: 24 },
    { header: c.requester, key: "requester", width: 20 },
    { header: c.payee, key: "payee", width: 20 },
    { header: c.title, key: "title", width: 30 },
    { header: c.submitted, key: "submitted", width: 22 },
    { header: c.status, key: "status", width: 18 },
    { header: c.taxRate, key: "taxRate", width: 9, rate: true },
    { header: c.requestedSubtotal, key: "requestedSubtotal", width: 15, money: true },
    { header: c.requestedTax, key: "requestedTax", width: 14, money: true },
    { header: c.requestedTotal, key: "requestedTotal", width: 15, money: true },
    { header: c.approvedSubtotal, key: "approvedSubtotal", width: 15, money: true },
    { header: c.approvedTax, key: "approvedTax", width: 14, money: true },
    { header: c.approvedTotal, key: "approvedTotal", width: 15, money: true },
    { header: c.accountant, key: "accountant", width: 20 },
    { header: c.accountantDate, key: "accountantDate", width: 22 },
    { header: c.approver, key: "approver", width: 20 },
    { header: c.approverRole, key: "approverRole", width: 14 },
    { header: c.approvalDate, key: "approvalDate", width: 22 },
    { header: c.paidOn, key: "paidOn", width: 14 },
    { header: c.method, key: "method", width: 18 },
    { header: c.paymentReference, key: "paymentReference", width: 22 },
    { header: c.linked, key: "linked", width: 18 },
  ]);
  for (const r of data.rows) {
    expenses.addRow({
      reference: safeText(r.reference),
      type: expensesCopy.types[r.type],
      department: safeText(r.department),
      requester: safeText(r.requester),
      payee: safeText(r.payee),
      title: safeText(r.title),
      submitted: when(r.submittedAt, data.zone),
      status: expensesCopy.status[r.status].label,
      taxRate: r.type === "purchase_request" && r.rate ? Number(r.rate) : null,
      requestedSubtotal: money(r.requested.subtotal),
      requestedTax: money(r.requested.tax),
      requestedTotal: money(r.requested.total),
      approvedSubtotal: money(r.approved?.subtotal),
      approvedTax: money(r.approved?.tax),
      approvedTotal: money(r.approved?.total),
      accountant: safeText(r.accountant),
      accountantDate: when(r.accountantAt, data.zone),
      approver: safeText(r.approver),
      approverRole: r.approverRole ? (roles[r.approverRole] ?? r.approverRole) : "",
      approvalDate: when(r.approvedAt, data.zone),
      paidOn: day(r.paidOn),
      method: r.paymentMethod
        ? expensesCopy.payment.methods[r.paymentMethod as keyof typeof expensesCopy.payment.methods]
        : "",
      paymentReference: safeText(r.paymentReference),
      linked: safeText(r.linkedReference),
    });
  }
  if (data.rows.length > 1) {
    const sum = (pick: (r: ExpenseExport["rows"][number]) => number | undefined) =>
      centsToDollars(sumCents(data.rows.map((r) => pick(r) ?? 0)));
    totalRow(expenses, {
      reference: w.total,
      requestedSubtotal: sum((r) => r.requested.subtotal),
      requestedTax: sum((r) => r.requested.tax),
      requestedTotal: sum((r) => r.requested.total),
      approvedSubtotal: sum((r) => r.approved?.subtotal),
      approvedTax: sum((r) => r.approved?.tax),
      approvedTotal: sum((r) => r.approved?.total),
    });
  }

  const lines = sheet(book, x.sheetNames.lines, data, [
    { header: c.reference, key: "reference", width: 16 },
    { header: c.department, key: "department", width: 24 },
    { header: c.item, key: "item", width: 34 },
    { header: c.vendor, key: "vendor", width: 20 },
    { header: c.date, key: "date", width: 14 },
    { header: c.quantity, key: "quantity", width: 8 },
    { header: c.unitPrice, key: "unitPrice", width: 14, money: true },
    { header: c.amount, key: "amount", width: 14, money: true },
    { header: c.receiptNumber, key: "receiptNumber", width: 14 },
    { header: c.link, key: "link", width: 36 },
  ]);
  for (const l of data.lines) {
    const row = lines.addRow({
      reference: safeText(l.reference),
      department: safeText(l.department),
      item: safeText(l.item),
      vendor: safeText(l.vendor),
      date: day(l.date),
      quantity: l.quantity,
      unitPrice: money(l.unitPriceCents),
      amount: money(l.amountCents),
      receiptNumber: safeText(l.receiptNumber),
    });
    link(row, "link", l.link);
  }

  const receipts = sheet(book, x.sheetNames.receipts, data, [
    { header: c.reference, key: "reference", width: 16 },
    { header: c.fileName, key: "fileName", width: 36 },
    { header: c.link, key: "link", width: 70 },
  ]);
  for (const r of data.receipts) {
    const row = receipts.addRow({
      reference: safeText(r.reference),
      fileName: safeText(r.fileName),
    });
    link(row, "link", r.url);
  }

  const payments = sheet(book, x.sheetNames.payments, data, [
    { header: c.paidOn, key: "paidOn", width: 14 },
    { header: c.reference, key: "reference", width: 16 },
    { header: c.department, key: "department", width: 24 },
    { header: c.payee, key: "payee", width: 22 },
    { header: c.method, key: "method", width: 20 },
    { header: c.paymentReference, key: "paymentReference", width: 24 },
    { header: c.amount, key: "amount", width: 14, money: true },
    { header: c.signers, key: "signers", width: 28 },
    { header: c.recordedBy, key: "recordedBy", width: 20 },
  ]);
  for (const p of data.payments) {
    payments.addRow({
      paidOn: day(p.paidOn),
      reference: safeText(p.reference),
      department: safeText(p.department),
      payee: safeText(p.payee),
      method:
        p.method === "other" && p.methodOther
          ? safeText(p.methodOther)
          : expensesCopy.payment.methods[p.method as keyof typeof expensesCopy.payment.methods],
      paymentReference: safeText(p.paymentReference),
      amount: money(p.amountCents),
      signers: safeText(p.signers),
      recordedBy: safeText(p.recordedBy),
    });
  }
  if (data.payments.length > 0) {
    totalRow(payments, {
      paidOn: w.total,
      amount: centsToDollars(sumCents(data.payments.map((p) => p.amountCents))),
    });
  }

  const budget = sheet(book, x.sheetNames.budget, data, [
    { header: c.department, key: "department", width: 28 },
    { header: c.available, key: "available", width: 15, money: true },
    { header: c.committed, key: "committed", width: 15, money: true },
    { header: c.pending, key: "pending", width: 15, money: true },
    { header: c.spent, key: "spent", width: 15, money: true },
    { header: c.remaining, key: "remaining", width: 15, money: true },
  ]);
  for (const b of data.budgets) {
    budget.addRow({
      department: safeText(b.department),
      available: money(b.figures.available),
      committed: money(b.figures.committed),
      pending: money(b.figures.pending),
      spent: money(b.figures.spent),
      remaining: money(b.figures.remaining),
    });
  }
  if (data.budgets.length > 1) {
    const sum = (pick: (f: ExpenseExport["budgets"][number]["figures"]) => number) =>
      centsToDollars(sumCents(data.budgets.map((b) => pick(b.figures))));
    totalRow(budget, {
      department: w.total,
      available: sum((f) => f.available),
      committed: sum((f) => f.committed),
      pending: sum((f) => f.pending),
      spent: sum((f) => f.spent),
      remaining: sum((f) => f.remaining),
    });
  }

  for (const s of [expenses, lines]) {
    for (const key of s === expenses ? ["title"] : ["item"]) {
      s.getColumn(key).alignment = { wrapText: true, vertical: "top" };
    }
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}
