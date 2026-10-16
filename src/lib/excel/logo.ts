import "server-only";
import type ExcelJS from "exceljs";

/** The church's PNG or JPEG logo for a workbook header (FR-30). Excel can't show SVG. */
export type WorkbookLogo = {
  extension: "png" | "jpeg";
  bytes: Uint8Array;
  width: number;
  height: number;
};

const HEIGHT_PX = 48;
const MAX_WIDTH_PX = 200;

/** Floats the logo at the top right of the title rows, keeping its proportions. */
export function addLogo(
  book: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  logo: WorkbookLogo | null | undefined,
  columnCount: number,
): void {
  if (!logo || logo.width <= 0 || logo.height <= 0) return;
  const image = book.addImage({
    buffer: Buffer.from(logo.bytes) as unknown as ExcelJS.Buffer,
    extension: logo.extension,
  });
  const width = Math.min(MAX_WIDTH_PX, Math.round((logo.width / logo.height) * HEIGHT_PX));
  const height = Math.round((width / logo.width) * logo.height);
  sheet.addImage(image, {
    tl: { col: Math.max(1, columnCount - 2), row: 0 },
    ext: { width, height },
    editAs: "absolute",
  });
}
