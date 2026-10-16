import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { budgetCycles, budgetRequests, userRoles } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { getOverview, stageOf } from "@/domain/analytics/overview";
import { decideRequest } from "@/domain/annual/review";
import { saveDraft, startRequest, submitRequest } from "@/domain/annual/service";
import { loadViewer } from "@/domain/users/viewer";
import type { Subject } from "@/lib/authz";
import { overviewWorkbook } from "@/lib/excel/overview-workbook";
import type { Role } from "@/lib/roles";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertCycle, insertDepartment, insertUser } from "./helpers/fixtures";

/* The Overview tab of Analytics & Audit (FR-52), annual budget figures. */

const SUBMITTED = new Date("2026-10-01T15:00:00Z");
const DECIDED = new Date("2026-10-04T15:00:00Z");
const NOW = new Date("2026-10-11T15:00:00Z");

let t: TestDb;
let db: Db;
let admin: Subject;
let accountant: Subject;
let cycleId: string;

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

/** A department submits $1,025.00 + 12% = $1,148.00; returns the request id. */
async function submitted(): Promise<string> {
  const leader = await person("requester");
  const dept = await insertDepartment(db);
  const { requestId } = await run((tx) =>
    startRequest(tx, leader, { cycleId, departmentId: dept.id }),
  );
  const me = await loadViewer(db, leader.id);
  if (!me.ok) throw new Error("no viewer");
  const saved = await run((tx) =>
    saveDraft(tx, me.viewer, {
      id: requestId,
      version: 1,
      title: "Sound desk",
      justification: "Hums.",
      lines: [{ name: "Mixer", quantity: "1", unitPrice: "1,025.00" }],
    }),
  );
  await run((tx) =>
    submitRequest(
      tx,
      me.viewer,
      { id: requestId, version: saved.version, idempotencyKey: randomUUID() },
      { now: SUBMITTED },
    ),
  );
  return requestId;
}

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  admin = await person("system_admin");
  accountant = await person("accountant");
  cycleId = (await insertCycle(db, admin.id)).id;
  await db
    .update(budgetCycles)
    .set({ boardTotalCents: 300_000 })
    .where(eq(budgetCycles.id, cycleId));

  const approvedId = await submitted();
  await submitted(); // stays waiting
  const [{ version }] = await db
    .select({ version: budgetRequests.version })
    .from(budgetRequests)
    .where(eq(budgetRequests.id, approvedId));
  await run((tx) =>
    decideRequest(
      tx,
      accountant,
      {
        id: approvedId,
        version,
        idempotencyKey: randomUUID(),
        decision: { kind: "approve_different_amount", approvedTotal: "1,000.00", note: "Board" },
      },
      { now: DECIDED },
    ),
  );
});

afterAll(async () => {
  await t?.close();
});

describe("Overview tab (FR-52)", () => {
  it("adds up requested and approved with tax, against the board total", async () => {
    const data = await run((tx) => getOverview(tx, accountant, { cycleId, now: NOW }));
    expect(data).not.toBeNull();
    expect(data!.counts).toMatchObject({
      submitted: 2,
      approved: 1,
      totalRequestedCents: 229_600,
      totalApprovedCents: 100_000,
    });
    expect(data!.board).toMatchObject({ totalCents: 300_000, allocatedCents: 100_000 });
    const byStage = Object.fromEntries(data!.stages.map((s) => [s.stage, s.count]));
    expect(byStage).toMatchObject({ approved: 1, submitted: 1 });
  });

  it("measures time to a decision and lists what has waited longest", async () => {
    const data = await run((tx) => getOverview(tx, accountant, { cycleId, now: NOW }));
    expect(data!.turnaround.decided).toBe(1);
    // The decision is stamped by the database clock, so only check it is a whole number.
    expect(Number.isInteger(data!.turnaround.averageDays)).toBe(true);
    expect(data!.turnaround.waiting).toHaveLength(1);
    expect(data!.turnaround.waiting[0]!.days).toBe(10);
  });

  it("is for people who review annual budgets", async () => {
    const office = await person("church_admin");
    expect(await run((tx) => getOverview(tx, office, { cycleId }))).toBeNull();
    expect(await run((tx) => getOverview(tx, admin, { cycleId }))).not.toBeNull();
  });

  it("exports the same figures, as numbers in CAD format", async () => {
    const data = (await run((tx) => getOverview(tx, accountant, { cycleId, now: NOW })))!;
    const buffer = await overviewWorkbook({
      brand: { churchName: "IFC", appName: "Budget" },
      generatedAt: NOW,
      zone: "America/Winnipeg",
      overview: data,
    });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer as unknown as ArrayBuffer);
    const rows = book.getWorksheet("By department")!.getSheetValues().slice(6);
    const requested = rows.map((r) => (r as unknown[])[4]).filter((v) => typeof v === "number");
    expect((requested as number[]).reduce((s, v) => s + v, 0)).toBeCloseTo(2296, 2);
    expect(book.getWorksheet("By stage")).toBeDefined();
  });

  it("maps every status to a stage", () => {
    expect(stageOf("not_submitted")).toBe("not_started");
    expect(stageOf("updated")).toBe("submitted");
    expect(stageOf("awaiting_second_approval")).toBe("in_review");
    expect(stageOf("closed")).toBe("approved");
  });
});
