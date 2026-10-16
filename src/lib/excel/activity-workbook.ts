import "server-only";
import ExcelJS from "exceljs";
import { activityCopy as a, activityLabel } from "@/copy/activity";
import { copy } from "@/copy/en-CA";
import type { ActivityItem } from "@/domain/analytics/activity";
import { detailText } from "@/domain/analytics/details";
import type { EmailBrand } from "@/lib/email/layout";
import { formatDateTime } from "@/lib/time-zone";
import { addLogo, type WorkbookLogo } from "./logo";
import { safeText } from "./safe";

/** The filtered activity log as a workbook (FR-52, AC-126), with the formula guard. */
export async function activityWorkbook(input: {
  brand: EmailBrand;
  logo?: WorkbookLogo | null;
  generatedAt: Date;
  zone: string;
  filterLabels: string[];
  items: ActivityItem[];
}): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = input.brand.appName;
  book.created = input.generatedAt;
  const c = a.workbook.columns;
  const sheet = book.addWorksheet(a.workbook.sheet, { views: [{ state: "frozen", ySplit: 5 }] });
  sheet.getRow(1).getCell(1).value = safeText(`${input.brand.churchName} · ${input.brand.appName}`);
  sheet.getRow(1).font = { bold: true, size: 14 };
  sheet.getRow(2).getCell(1).value = a.workbook.title;
  sheet.getRow(2).font = { bold: true };
  sheet.getRow(3).getCell(1).value = `Generated ${formatDateTime(input.generatedAt, input.zone)}`;
  sheet.getRow(4).getCell(1).value = safeText(
    input.filterLabels.length ? `Filters: ${input.filterLabels.join(", ")}` : "Filters: none",
  );
  const columns = [
    { header: c.when, key: "when", width: 24 },
    { header: c.person, key: "person", width: 22 },
    { header: c.role, key: "role", width: 18 },
    { header: c.area, key: "area", width: 14 },
    { header: c.what, key: "what", width: 40 },
    { header: c.type, key: "type", width: 30 },
    { header: c.item, key: "item", width: 18 },
    { header: c.department, key: "department", width: 24 },
    { header: c.cycle, key: "cycle", width: 12 },
    { header: c.reason, key: "reason", width: 36 },
    { header: c.details, key: "details", width: 60 },
  ];
  const header = sheet.getRow(5);
  columns.forEach((col, i) => {
    sheet.getColumn(i + 1).key = col.key;
    sheet.getColumn(i + 1).width = col.width;
    header.getCell(i + 1).value = col.header;
  });
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EDF3" } };
  });
  addLogo(book, sheet, input.logo, columns.length);
  for (const e of input.items) {
    sheet.addRow({
      when: formatDateTime(e.at, input.zone),
      person: safeText(e.actor?.name ?? (e.actorKind === "job" ? a.job : a.system)),
      role: e.actingRole ? copy.roles[e.actingRole] : "",
      area: a.areas[e.area],
      what: activityLabel(e.eventType),
      type: e.eventType,
      item: safeText(e.request?.reference ?? ""),
      department: safeText(e.department?.name ?? ""),
      cycle: safeText(e.cycle ?? ""),
      reason: safeText(e.reason),
      details: safeText(detailText(e.details)),
    });
  }
  for (const key of ["what", "reason", "details"]) {
    sheet.getColumn(key).alignment = { wrapText: true, vertical: "top" };
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}
