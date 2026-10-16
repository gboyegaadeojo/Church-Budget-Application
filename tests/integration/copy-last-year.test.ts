import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appSettings,
  auditEvents,
  budgetCycles,
  budgetRequests,
  requestMessages,
  userRoles,
} from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { sendMessage } from "@/domain/annual/messages";
import { departmentPicker, getRequestView } from "@/domain/annual/queries";
import { decideRequest } from "@/domain/annual/review";
import type { RequestContentInput } from "@/domain/annual/schema";
import { saveDraft, startRequest, submitRequest } from "@/domain/annual/service";
import { loadViewer } from "@/domain/users/viewer";
import type { Subject } from "@/lib/authz";
import type { Role } from "@/lib/roles";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertCycle, insertDepartment, insertUser } from "./helpers/fixtures";

/* Start from last year's request (FR-35, AC-64). */

const NOW = new Date("2026-10-20T17:00:00Z");

let t: TestDb;
let db: Db;
let admin: Subject;
let pat: Subject;
let lastYearId: string;
let thisYearId: string;

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

const LAST_YEAR: RequestContentInput = {
  title: "Sound for the year",
  justification: "Two services every Sunday.",
  lines: [
    {
      name: "Microphone",
      quantity: "4",
      unitPrice: "250.00",
      link: "https://example.org/mic",
      notes: "Wireless",
    },
    { name: "Cables", quantity: "10", unitPrice: "12.50" },
  ],
};

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  admin = await person("system_admin");
  pat = await person("accountant");
  // Last year's cycle opens first, so its request can be submitted and approved.
  lastYearId = (await insertCycle(db, admin.id, { budgetYear: 2026, name: "FY2026" })).id;
});

afterAll(async () => {
  await t?.close();
});

describe("Start from last year's request (FR-35)", () => {
  it("AC-64 creates a draft with last year's items and the current tax rate, and nothing else", async () => {
    const leader = await person("requester");
    const dept = await insertDepartment(db);
    const { requestId: oldId } = await run((tx) =>
      startRequest(tx, leader, { cycleId: lastYearId, departmentId: dept.id }),
    );
    let me = await fresh(leader);
    const saved = await run((tx) => saveDraft(tx, me, { id: oldId, version: 1, ...LAST_YEAR }));
    await run((tx) =>
      submitRequest(
        tx,
        me,
        { id: oldId, version: saved.version, idempotencyKey: randomUUID() },
        { now: NOW },
      ),
    );
    await run((tx) =>
      sendMessage(tx, me, { requestId: oldId, body: "Hello", idempotencyKey: randomUUID() }),
    );
    const [{ version }] = await db
      .select({ version: budgetRequests.version })
      .from(budgetRequests)
      .where(eq(budgetRequests.id, oldId));
    await run((tx) =>
      decideRequest(
        tx,
        pat,
        {
          id: oldId,
          version,
          idempotencyKey: randomUUID(),
          decision: { kind: "approve_as_requested" },
        },
        { now: NOW },
      ),
    );

    // The new year: a new cycle and a new tax rate.
    await db.update(budgetCycles).set({ status: "closed" }).where(eq(budgetCycles.id, lastYearId));
    thisYearId = (await insertCycle(db, admin.id, { budgetYear: 2027, name: "FY2027" })).id;
    await db
      .insert(appSettings)
      .values({ key: "sales_tax_rate", value: "0.1300" })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: "0.1300" } });

    me = await fresh(leader);
    const picker = await run((tx) => departmentPicker(tx, me, thisYearId));
    expect(picker.choices.find((c) => c.id === dept.id)?.lastYear).toMatchObject({
      cycleName: "FY2026",
    });

    const started = await run((tx) =>
      startRequest(tx, me, { cycleId: thisYearId, departmentId: dept.id, fromLastYear: true }),
    );
    expect(started.copied).toMatchObject({ cycleName: "FY2026" });
    const draft = await run((tx) => getRequestView(tx, me, started.requestId));
    expect(draft).toMatchObject({
      status: "draft",
      title: "Sound for the year",
      justification: "Two services every Sunday.",
      referenceNumber: null,
      decision: null,
      rate: "0.1300",
    });
    expect(draft!.lines).toEqual([
      {
        name: "Microphone",
        quantity: 4,
        unitPriceCents: 25_000,
        link: "https://example.org/mic",
        notes: "Wireless",
      },
      { name: "Cables", quantity: 10, unitPriceCents: 1_250, link: null, notes: null },
    ]);
    // $1,125.00 at today's 13%: $146.25 tax.
    expect(draft!.totals).toEqual({ subtotal: 112_500, tax: 14_625, total: 127_125 });

    const [row] = await db
      .select()
      .from(budgetRequests)
      .where(eq(budgetRequests.id, started.requestId));
    expect(row).toMatchObject({ approvedTotalCents: null, editCount: 0, versionNumber: 0 });
    const messages = await db
      .select()
      .from(requestMessages)
      .where(eq(requestMessages.budgetRequestId, started.requestId));
    expect(messages).toEqual([]);
    const audits = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "annual.copied_last_year"));
    expect(audits[0].details).toMatchObject({ fromRequestId: oldId, lines: 2 });

    // Last year's request is untouched.
    const old = await run((tx) => getRequestView(tx, me, oldId));
    expect(old).toMatchObject({ status: "approved", rate: "0.1200" });
  });

  it("starts an empty draft when the department has nothing from an earlier year", async () => {
    const leader = await person("requester");
    const dept = await insertDepartment(db);
    const picker = await run((tx) => departmentPicker(tx, leader, thisYearId));
    expect(picker.choices.find((c) => c.id === dept.id)?.lastYear).toBeNull();
    const started = await run((tx) =>
      startRequest(tx, leader, { cycleId: thisYearId, departmentId: dept.id, fromLastYear: true }),
    );
    expect(started.copied).toBeNull();
    const me = await fresh(leader);
    const draft = await run((tx) => getRequestView(tx, me, started.requestId));
    expect(draft).toMatchObject({ title: "", lines: [] });
  });
});
