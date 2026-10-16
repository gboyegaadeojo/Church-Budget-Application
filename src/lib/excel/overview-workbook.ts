import "server-only";
import ExcelJS from "exceljs";
import { activityCopy } from "@/copy/activity";
import type { Overview } from "@/domain/analytics/overview";
import type { EmailBrand } from "@/lib/email/layout";
import { formatDateTime } from "@/lib/time-zone";
import { addLogo, type WorkbookLogo } from "./logo";
import { CAD_FORMAT, centsToDollars, safeText } from "./safe";

const o = activityCopy.overview;

/**
 * The Overview tab's figures as a workbook (FR-52 "every chart has an Export"): the
 * headline figures, departments by stage, and requested against approved by department.
 * Amounts are numbers in CAD format; text goes through the formula guard (AC-96).
 */
export async function overviewWorkbook(input: {
  brand: EmailBrand;
  logo?: WorkbookLogo | null;
  generatedAt: Date;
  zone: string;
  overview: Overview;
}): Promise<Buffer> {
  const { overview: data } = input;
  const book = new ExcelJS.Workbook();
  book.creator = input.brand.appName;
  book.created = input.generatedAt;

  const header = (sheet: ExcelJS.Worksheet, title: string, columns: number) => {
    sheet.getRow(1).getCell(1).value = safeText(
      `${input.brand.churchName} · ${input.brand.appName}`,
    );
    sheet.getRow(1).font = { bold: true, size: 14 };
    sheet.getRow(2).getCell(1).value = safeText(`${title} · ${data.cycle?.name ?? ""}`);
    sheet.getRow(2).font = { bold: true };
    sheet.getRow(3).getCell(1).value = `Generated ${formatDateTime(input.generatedAt, input.zone)}`;
    addLogo(book, sheet, input.logo, columns);
  };
  const headings = (sheet: ExcelJS.Worksheet, row: number, labels: string[]) => {
    const r = sheet.getRow(row);
    labels.forEach((label, i) => (r.getCell(i + 1).value = label));
    r.font = { bold: true };
    r.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EDF3" } };
    });
  };

  // Summary.
  const summary = book.addWorksheet("Summary");
  header(summary, activityCopy.tabs.overview, 2);
  summary.getColumn(1).width = 36;
  summary.getColumn(2).width = 20;
  headings(summary, 5, ["Figure", "Value"]);
  const money = (label: string, cents: number | null) => {
    const row = summary.addRow([label, cents === null ? "" : centsToDollars(cents)]);
    row.getCell(2).numFmt = CAD_FORMAT;
  };
  money(o.board, data.board?.totalCents ?? null);
  money("Approved against the board total", data.board?.allocatedCents ?? null);
  money(o.requested, data.counts.totalRequestedCents);
  money(o.approved, data.counts.totalApprovedCents);
  summary.addRow(["Departments expected", data.counts.expected]);
  summary.addRow(["Budgets submitted", data.counts.submitted]);
  summary.addRow(["Budgets approved", data.counts.approved]);
  summary.addRow([`${o.turnaround} (days)`, data.turnaround.averageDays ?? ""]);

  // Departments by stage.
  const stages = book.addWorksheet("By stage");
  header(stages, o.stagesCaption, 2);
  stages.getColumn(1).width = 32;
  stages.getColumn(2).width = 14;
  headings(stages, 5, [o.columns.stage, o.columns.departments]);
  for (const s of data.stages) stages.addRow([o.stages[s.stage], s.count]);

  // Requested against approved.
  const amounts = book.addWorksheet("By department");
  header(amounts, o.amountsCaption, 5);
  [32, 22, 18, 18, 18].forEach((w, i) => (amounts.getColumn(i + 1).width = w));
  headings(amounts, 5, [
    o.columns.department,
    o.columns.stage,
    o.columns.reference,
    o.columns.requested,
    o.columns.approved,
  ]);
  for (const d of data.departments) {
    const row = amounts.addRow([
      safeText(d.name),
      o.stages[d.stage],
      safeText(d.reference ?? ""),
      d.requestedCents === null ? "" : centsToDollars(d.requestedCents),
      d.approvedCents === null ? "" : centsToDollars(d.approvedCents),
    ]);
    row.getCell(4).numFmt = CAD_FORMAT;
    row.getCell(5).numFmt = CAD_FORMAT;
  }

  return Buffer.from(await book.xlsx.writeBuffer());
}
