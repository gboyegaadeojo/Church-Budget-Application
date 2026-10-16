import "server-only";
import ExcelJS from "exceljs";
import { exportsCopy } from "@/copy/exports";
import { annualCopy } from "@/copy/annual";
import type { AnnualExport, ExportRequest } from "@/domain/annual/export";
import { sumCents } from "@/lib/money";
import { formatDateTime } from "@/lib/time-zone";
import { addLogo } from "./logo";
import { CAD_FORMAT, centsToDollars, RATE_FORMAT, safeText } from "./safe";

/**
 * The annual budget workbook (FR-20): a Summary sheet and a Line Items sheet. Amounts
 * are numbers in CAD format, written from the stored, server-calculated values (no
 * formulas), so the workbook matches the app exactly. User text is guarded against
 * formula injection (AC-96). Always light, whatever the person's theme (DRD 3).
 */

const w = exportsCopy.workbook;
const HEADER_ROWS = 4;

type Column = { header: string; key: string; width: number; money?: boolean; rate?: boolean };

function sheetWithHeader(
  book: ExcelJS.Workbook,
  name: string,
  data: AnnualExport,
  columns: Column[],
) {
  const sheet = book.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: HEADER_ROWS + 1 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.getRow(1).getCell(1).value = safeText(w.title(data.brand.churchName, data.brand.appName));
  sheet.getRow(1).font = { bold: true, size: 14 };
  sheet.getRow(2).getCell(1).value = safeText(w.annualTitle(data.cycle.name));
  sheet.getRow(2).font = { bold: true };
  sheet.getRow(3).getCell(1).value = w.generated(formatDateTime(data.generatedAt, data.zone));
  sheet.getRow(4).getCell(1).value = safeText(w.filters(data.filterLabels));

  const headerRow = sheet.getRow(HEADER_ROWS + 1);
  columns.forEach((c, i) => {
    const col = sheet.getColumn(i + 1);
    col.key = c.key;
    col.width = c.width;
    if (c.money) col.numFmt = CAD_FORMAT;
    if (c.rate) col.numFmt = RATE_FORMAT;
    headerRow.getCell(i + 1).value = c.header;
  });
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", wrapText: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EDF3" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FF8A94A3" } } };
  });
  sheet.autoFilter = {
    from: { row: HEADER_ROWS + 1, column: 1 },
    to: { row: HEADER_ROWS + 1, column: columns.length },
  };
  addLogo(book, sheet, data.logo, columns.length);
  return sheet;
}

const money = (cents: number | null | undefined) => (cents == null ? null : centsToDollars(cents));
const rateNumber = (rate: string) => Number(rate);
const dateCell = (date: Date | null, zone: string) => (date ? formatDateTime(date, zone) : "");

function summarySheet(book: ExcelJS.Workbook, data: AnnualExport) {
  const c = w.summaryColumns;
  const sheet = sheetWithHeader(book, w.summarySheet, data, [
    { header: c.reference, key: "reference", width: 16 },
    { header: c.budgetYear, key: "budgetYear", width: 10 },
    { header: c.department, key: "department", width: 26 },
    { header: c.requester, key: "requester", width: 20 },
    { header: c.requesterEmail, key: "requesterEmail", width: 28 },
    { header: c.submitted, key: "submitted", width: 22 },
    { header: c.status, key: "status", width: 18 },
    { header: c.taxRate, key: "taxRate", width: 9, rate: true },
    { header: c.requestedSubtotal, key: "requestedSubtotal", width: 15, money: true },
    { header: c.requestedTax, key: "requestedTax", width: 14, money: true },
    { header: c.requestedTotal, key: "requestedTotal", width: 16, money: true },
    { header: c.approvedSubtotal, key: "approvedSubtotal", width: 15, money: true },
    { header: c.approvedTax, key: "approvedTax", width: 14, money: true },
    { header: c.approvedTotal, key: "approvedTotal", width: 16, money: true },
    { header: c.difference, key: "difference", width: 16, money: true },
    { header: c.approver, key: "approver", width: 20 },
    { header: c.approvalDate, key: "approvalDate", width: 22 },
    { header: c.justification, key: "justification", width: 50 },
    { header: c.revisions, key: "revisions", width: 10 },
  ]);
  for (const r of data.requests) {
    sheet.addRow({
      reference: safeText(r.reference),
      budgetYear: r.budgetYear,
      department: safeText(r.department),
      requester: safeText(r.requester),
      requesterEmail: safeText(r.requesterEmail),
      submitted: dateCell(r.submittedAt, data.zone),
      status: annualCopy.status[r.status].label,
      taxRate: rateNumber(r.rate),
      requestedSubtotal: money(r.requested.subtotal),
      requestedTax: money(r.requested.tax),
      requestedTotal: money(r.requested.total),
      approvedSubtotal: money(r.approved?.subtotal),
      approvedTax: money(r.approved?.tax),
      approvedTotal: money(r.approved?.total),
      difference: money(r.differenceCents),
      approver: safeText(r.approver),
      approvalDate: dateCell(r.approvedAt, data.zone),
      justification: safeText(r.justification),
      revisions: r.editCount,
    });
  }
  // Requested and approved budget summaries (FR-20 item 5), summed in cents.
  if (data.requests.length > 1) {
    const sum = (pick: (r: ExportRequest) => number | null | undefined) =>
      centsToDollars(sumCents(data.requests.map((r) => pick(r) ?? 0)));
    const total = sheet.addRow({
      reference: w.total,
      requestedSubtotal: sum((r) => r.requested.subtotal),
      requestedTax: sum((r) => r.requested.tax),
      requestedTotal: sum((r) => r.requested.total),
      approvedSubtotal: sum((r) => r.approved?.subtotal),
      approvedTax: sum((r) => r.approved?.tax),
      approvedTotal: sum((r) => r.approved?.total),
    });
    total.font = { bold: true };
    total.border = { top: { style: "thin" } };
  }
  sheet.getColumn("justification").alignment = { wrapText: true, vertical: "top" };
}

function linesSheet(book: ExcelJS.Workbook, data: AnnualExport) {
  const c = w.lineColumns;
  const sheet = sheetWithHeader(book, w.linesSheet, data, [
    { header: c.reference, key: "reference", width: 16 },
    { header: c.budgetYear, key: "budgetYear", width: 10 },
    { header: c.department, key: "department", width: 26 },
    { header: c.item, key: "item", width: 32 },
    { header: c.requestedQuantity, key: "requestedQuantity", width: 11 },
    { header: c.requestedUnitPrice, key: "requestedUnitPrice", width: 14, money: true },
    { header: c.requestedLineTotal, key: "requestedLineTotal", width: 15, money: true },
    { header: c.approvedQuantity, key: "approvedQuantity", width: 11 },
    { header: c.approvedUnitPrice, key: "approvedUnitPrice", width: 14, money: true },
    { header: c.approvedLineTotal, key: "approvedLineTotal", width: 15, money: true },
    { header: c.link, key: "link", width: 36 },
    { header: c.notes, key: "notes", width: 36 },
    { header: c.reason, key: "reason", width: 36 },
  ]);
  for (const r of data.requests) {
    const base = {
      reference: safeText(r.reference),
      budgetYear: r.budgetYear,
      department: safeText(r.department),
    };
    for (const l of r.lines) {
      const row = sheet.addRow({
        ...base,
        item: safeText(l.name),
        requestedQuantity: l.quantity,
        requestedUnitPrice: money(l.unitPriceCents),
        requestedLineTotal: money(l.lineTotalCents),
        approvedQuantity: l.approved?.quantity ?? null,
        approvedUnitPrice: money(l.approved?.unitPriceCents),
        approvedLineTotal: money(l.approved?.lineTotalCents),
        link: null,
        notes: safeText(l.notes),
        reason: safeText(l.reason),
      });
      // Links keep working, but only http and https (CLAUDE.md "Links").
      if (l.link && /^https?:\/\//i.test(l.link)) {
        row.getCell("link").value = { text: safeText(l.link), hyperlink: l.link };
        row.getCell("link").font = { color: { argb: "FF1D4ED8" }, underline: true };
      } else if (l.link) {
        row.getCell("link").value = safeText(l.link);
      }
    }
    if (r.adjustmentCents) {
      sheet.addRow({ ...base, item: w.adjustment, approvedLineTotal: money(r.adjustmentCents) });
    }
    // A single request ends with its Subtotal, Sales tax and Total, requested and approved.
    if (data.single) {
      const totals: [string, number, number | null][] = [
        [w.subtotalRow, r.requested.subtotal, r.approved?.subtotal ?? null],
        [w.taxRow, r.requested.tax, r.approved?.tax ?? null],
        [w.totalRow, r.requested.total, r.approved?.total ?? null],
      ];
      totals.forEach(([label, requested, approved], i) => {
        const row = sheet.addRow({
          item: label,
          requestedLineTotal: money(requested),
          approvedLineTotal: money(approved),
        });
        row.font = { bold: true };
        if (i === 0) row.border = { top: { style: "thin" } };
      });
    }
  }
  for (const key of ["item", "notes", "reason"]) {
    sheet.getColumn(key).alignment = { wrapText: true, vertical: "top" };
  }
}

export async function annualWorkbook(data: AnnualExport): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = data.brand.appName;
  book.created = data.generatedAt;
  summarySheet(book, data);
  linesSheet(book, data);
  return Buffer.from(await book.xlsx.writeBuffer());
}
