import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, budgetCycles, budgetRequests, userRoles } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import type { DecisionInput } from "@/domain/annual/decision";
import { buildAnnualExport } from "@/domain/annual/export";
import { decideRequest } from "@/domain/annual/review";
import { boardAllocation, getReviewView } from "@/domain/annual/review-queries";
import type { RequestContentInput } from "@/domain/annual/schema";
import { saveDraft, startRequest, submitRequest } from "@/domain/annual/service";
import { loadViewer } from "@/domain/users/viewer";
import { ForbiddenError, type Subject } from "@/lib/authz";
import { annualWorkbook } from "@/lib/excel/annual-workbook";
import type { Role } from "@/lib/roles";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertCycle, insertDepartment, insertUser } from "./helpers/fixtures";

const NOW = new Date("2026-10-20T17:00:00Z");

let t: TestDb;
let db: Db;
let admin: Subject;
let accountant: Subject;
let cycleId: string;
/** Approved for a different total: $30,000.00 including tax. */
let different: { requestId: string; departmentId: string };
/** Still waiting, with text that looks like formulas. */
let risky: { requestId: string; departmentId: string };
/** Approved with line changes. */
let changed: { requestId: string; departmentId: string };
let draftId: string;

const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

async function person(role: Role): Promise<Subject> {
  const row = await insertUser(db, {
    accessStatus: role === "requester" ? "pending_department" : "active",
    pcoLeaderVerified: role === "requester",
    pcoVerifiedAt: NOW,
  });
  await db.insert(userRoles).values({ userId: row.id, role });
  return { id: row.id, roles: [role], departments: [] };
}

async function fresh(subject: Subject): Promise<Subject> {
  const result = await loadViewer(db, subject.id);
  if (!result.ok) throw new Error(`No viewer: ${result.reason}`);
  return result.viewer;
}

async function submitted(content: RequestContentInput, submit = true) {
  const leader = await person("requester");
  const dept = await insertDepartment(db);
  const { requestId } = await run((tx) =>
    startRequest(tx, leader, { cycleId, departmentId: dept.id }),
  );
  const me = await fresh(leader);
  const saved = await run((tx) => saveDraft(tx, me, { id: requestId, version: 1, ...content }));
  if (submit) {
    await run((tx) =>
      submitRequest(
        tx,
        me,
        { id: requestId, version: saved.version, idempotencyKey: randomUUID() },
        { now: NOW },
      ),
    );
  }
  return { requestId, departmentId: dept.id };
}

async function decide(id: string, decision: DecisionInput) {
  const [{ version }] = await db.select().from(budgetRequests).where(eq(budgetRequests.id, id));
  return run((tx) =>
    decideRequest(
      tx,
      accountant,
      { id, version, idempotencyKey: randomUUID(), decision },
      { now: NOW },
    ),
  );
}

const exportAs = (who: Subject, filters: Parameters<typeof buildAnnualExport>[2]) =>
  run((tx) => buildAnnualExport(tx, who, filters, { now: NOW }));

async function workbookOf(data: Awaited<ReturnType<typeof buildAnnualExport>>) {
  const book = new ExcelJS.Workbook();
  const bytes = await annualWorkbook(data);
  await book.xlsx.load(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  return book;
}

/** The sheet's rows below its 5 header rows, as plain values keyed by column header. */
function rowsOf(sheet: ExcelJS.Worksheet) {
  const headers = (sheet.getRow(5).values as unknown[]).slice(1).map(String);
  const rows: Record<string, unknown>[] = [];
  sheet.eachRow((row, n) => {
    if (n <= 5) return;
    const values = (row.values as unknown[]).slice(1);
    rows.push(Object.fromEntries(headers.map((h, i) => [h, values[i] ?? null])));
  });
  return rows;
}

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  admin = await person("system_admin");
  accountant = await person("accountant");
  cycleId = (await insertCycle(db, admin.id, { name: "FY2031", budgetYear: 2031 })).id;

  different = await submitted({
    title: "Microphones",
    justification: "Every small group needs one.",
    lines: [
      { name: "Microphone", quantity: "40", unitPrice: "1,000.00" },
      { name: "Stand", quantity: "1", unitPrice: "25.00" },
    ],
  });
  await decide(different.requestId, {
    kind: "approve_different_amount",
    approvedTotal: "30,000.00",
    note: "Board approved less",
  });

  risky = await submitted({
    title: '=HYPERLINK("http://evil.example","Click")',
    justification: "+cmd|' /C calc'!A0",
    lines: [
      {
        name: "@SUM(1+1)",
        quantity: "1",
        unitPrice: "1,025.00",
        notes: "-2+3",
        link: "https://shop.example/item",
      },
    ],
  });

  changed = await submitted({
    title: "Chairs",
    justification: "More people.",
    lines: [{ name: "Chair", quantity: "10", unitPrice: "10.04" }],
  });
  const view = await run((tx) => getReviewView(tx, accountant, changed.requestId));
  await decide(changed.requestId, {
    kind: "approve_line_changes",
    note: "Fewer",
    lines: [{ lineId: view!.lines[0].id, quantity: "5", unitPrice: "10.04", reason: "Half now" }],
  });

  draftId = (await submitted({ title: "Draft", justification: "x", lines: [] }, false)).requestId;
});

afterAll(async () => {
  await t?.close();
});

describe("annual budget export (FR-20)", () => {
  it("AC-93 a consolidated workbook lists every submitted request, never a draft", async () => {
    const data = await exportAs(accountant, { cycleId });
    expect(data.fileName).toBe("FY2031_Annual_Budgets.xlsx");
    expect(data.requests).toHaveLength(3);
    const ids = await db
      .select({ reference: budgetRequests.referenceNumber })
      .from(budgetRequests)
      .where(eq(budgetRequests.id, draftId));
    expect(ids[0].reference).toBeNull();

    const book = await workbookOf(data);
    expect(book.worksheets.map((s) => s.name)).toEqual(["Summary", "Line Items"]);
    const summary = rowsOf(book.getWorksheet("Summary")!);
    expect(summary).toHaveLength(4); // three requests and the Total row
    const total = summary.at(-1)!;
    expect(total["Request reference"]).toBe("Total");
    // $44,828.00 + $1,148.00 + $112.45 requested; $30,000.00 + $56.22 approved.
    expect(total["Requested total (incl. tax)"]).toBe(46_088.45);
    expect(total["Approved total (incl. tax)"]).toBe(30_056.22);
  });

  it("AC-94 AC-95 requested and approved figures are separate numbers, to the cent", async () => {
    const data = await exportAs(accountant, { requestId: different.requestId });
    const r = data.requests[0];
    expect(r.requested).toEqual({ subtotal: 4_002_500, tax: 480_300, total: 4_482_800 });
    expect(r.approved).toEqual({ subtotal: 2_678_571, tax: 321_429, total: 3_000_000 });
    expect(r.differenceCents).toBe(3_000_000 - 4_482_800);

    const book = await workbookOf(data);
    const sheet = book.getWorksheet("Summary")!;
    const [row] = rowsOf(sheet);
    expect(row).toMatchObject({
      "Tax rate": 0.12,
      "Requested subtotal": 40_025,
      "Requested sales tax": 4_803,
      "Requested total (incl. tax)": 44_828,
      "Approved subtotal": 26_785.71,
      "Approved sales tax": 3_214.29,
      "Approved total (incl. tax)": 30_000,
      "Difference (approved − requested)": -14_828,
      Status: "Approved",
    });
    expect(sheet.getRow(6).getCell(11).numFmt).toBe('"$"#,##0.00;("$"#,##0.00)');
  });

  it("AC-92 one request: named for its department and reference, lines reconcile and end with totals", async () => {
    const data = await exportAs(accountant, { requestId: different.requestId });
    const r = data.requests[0];
    expect(data.fileName).toBe(
      `FY2031_${r.department.replace(/[^A-Za-z0-9-]+/g, "_")}_${r.reference}.xlsx`,
    );
    const lines = rowsOf((await workbookOf(data)).getWorksheet("Line Items")!);
    expect(lines.map((l) => l["Item name"])).toEqual([
      "Microphone",
      "Stand",
      "Overall adjustment",
      "Subtotal",
      "Sales tax",
      "Total (incl. tax)",
    ]);
    // The approved lines plus the adjustment equal the approved subtotal.
    const approved = lines
      .slice(0, 3)
      .map((l) => Math.round(Number(l["Approved line total"]) * 100));
    expect(approved.reduce((a, b) => a + b, 0)).toBe(2_678_571);
    expect(lines.at(-1)).toMatchObject({
      "Requested line total": 44_828,
      "Approved line total": 30_000,
    });
  });

  it("shows line changes with their reason", async () => {
    const data = await exportAs(accountant, { requestId: changed.requestId });
    const [line] = rowsOf((await workbookOf(data)).getWorksheet("Line Items")!);
    expect(line).toMatchObject({
      "Requested quantity": 10,
      "Requested unit price": 10.04,
      "Requested line total": 100.4,
      "Approved quantity": 5,
      "Approved line total": 50.2,
      "Adjustment reason": "Half now",
    });
  });

  it("AC-96 text that looks like a formula is written as plain text", async () => {
    const data = await exportAs(accountant, { requestId: risky.requestId });
    const book = await workbookOf(data);
    const [summary] = rowsOf(book.getWorksheet("Summary")!);
    expect(summary.Justification).toBe("'+cmd|' /C calc'!A0");
    const [line] = rowsOf(book.getWorksheet("Line Items")!);
    expect(line["Item name"]).toBe("'@SUM(1+1)");
    expect(line.Notes).toBe("'-2+3");
    expect(line["Product link"]).toMatchObject({ hyperlink: "https://shop.example/item" });
    // Nothing anywhere in the workbook is a formula.
    let formulas = 0;
    book.eachSheet((sheet) =>
      sheet.eachRow((row) =>
        row.eachCell((cell) => {
          if (cell.type === ExcelJS.ValueType.Formula) formulas++;
        }),
      ),
    );
    expect(formulas).toBe(0);
  });

  it("filters by status and department, and names the file after them", async () => {
    const approved = await exportAs(accountant, { cycleId, status: "approved" });
    expect(approved.requests.map((r) => r.status).sort()).toEqual(["approved", "approved"]);
    expect(approved.fileName).toBe("FY2031_Annual_Budgets_Approved.xlsx");
    const one = await exportAs(accountant, { cycleId, departmentId: risky.departmentId });
    expect(one.requests).toHaveLength(1);
    expect(one.filterLabels).toEqual(["cycle FY2031", expect.stringMatching(/^department /)]);
  });

  it("AC-4 AC-110 only accountants and the administrator may export, and each export is audited", async () => {
    const requester = await person("requester");
    await expect(exportAs(requester, { cycleId })).rejects.toBeInstanceOf(ForbiddenError);
    const churchAdmin = await person("church_admin");
    await expect(exportAs(churchAdmin, { cycleId })).rejects.toBeInstanceOf(ForbiddenError);

    await exportAs(admin, { cycleId, status: "awaiting" });
    const [event] = await db
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.eventType, "annual.exported"), eq(auditEvents.actorUserId, admin.id)),
      );
    expect(event).toMatchObject({
      area: "annual",
      cycleId,
      details: { requests: 1, filters: { status: "awaiting" } },
    });
  });

  it("refuses to export a draft on its own", async () => {
    await expect(exportAs(accountant, { requestId: draftId })).rejects.toThrow();
  });
});

describe("board-approved church total (4.2, AC-114)", () => {
  it("adds up approved budgets against the board total, leaving out the one being decided", async () => {
    expect(await run((tx) => boardAllocation(tx, cycleId))).toBeNull();
    await db
      .update(budgetCycles)
      .set({ boardTotalCents: 3_000_000, boardReference: "Board minutes, Nov 12" })
      .where(eq(budgetCycles.id, cycleId));
    // $30,000.00 and $56.22 are approved.
    expect(await run((tx) => boardAllocation(tx, cycleId))).toEqual({
      totalCents: 3_000_000,
      allocatedCents: 3_005_622,
      reference: "Board minutes, Nov 12",
    });
    const view = await run((tx) => getReviewView(tx, accountant, different.requestId));
    expect(view!.board).toMatchObject({ allocatedCents: 5_622 });
  });
});
