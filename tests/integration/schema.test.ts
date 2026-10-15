import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appSettings,
  approvalAdjustments,
  approvalDecisions,
  approvedLineItems,
  budgetLineItems,
  budgetRequests,
  departments,
  requestRevisions,
  userDepartments,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { splitInclusive, totalForward } from "@/lib/money";
import { createTestDb, expectRejected, type TestDb } from "./helpers/db";
import {
  insertCycle,
  insertDepartment,
  insertDraft,
  insertLine,
  insertRevision,
  insertUser,
  SUBMITTED_1025,
} from "./helpers/fixtures";

let t: TestDb;
let db: Db;
let userId: string;
let cycleId: string;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  userId = (await insertUser(db)).id;
  cycleId = (await insertCycle(db, userId)).id;
});

afterAll(async () => {
  await t?.close();
});

async function newRequest(overrides: Partial<typeof budgetRequests.$inferInsert> = {}) {
  const department = await insertDepartment(db);
  return insertDraft(db, { cycleId, departmentId: department.id, userId }, overrides);
}

describe("migrations", () => {
  it("seed the default settings (Requirements 9.6, 20.2)", async () => {
    const rows = await db.select().from(appSettings);
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(settings).toMatchObject({
      sales_tax_rate: "0.1200",
      near_limit_threshold: "0.80",
      backup_escalation_days: "3",
    });
  });
});

describe("money columns", () => {
  it("store cents exactly and read the tax rate back as an exact string", async () => {
    const big = totalForward(1_000_000_000_000, "0.1200"); // $10 billion subtotal
    const request = await newRequest({
      ...SUBMITTED_1025,
      referenceNumber: "IFC-2027-MEDIA-0900",
      requestedSubtotalCents: big.subtotal,
      requestedTaxCents: big.tax,
      requestedTotalCents: big.total,
    });
    const [row] = await db.select().from(budgetRequests).where(eq(budgetRequests.id, request.id));
    expect(row.requestedTotalCents).toBe(1_120_000_000_000);
    expect(row.taxRate).toBe("0.1200");
  });
});

describe("budget_requests", () => {
  it("accepts a draft without amounts", async () => {
    const draft = await newRequest();
    expect(draft.status).toBe("draft");
    expect(draft.requestedTotalCents).toBeNull();
    expect(draft.referenceNumber).toBeNull();
  });

  it("requires a submitted request to carry its rate, amounts and reference", async () => {
    await expectRejected(
      newRequest({ status: "submitted" }),
      "budget_requests_submitted_has_snapshot",
    );
  });

  it("rejects a total that is not subtotal + tax (9.19)", async () => {
    await expectRejected(
      newRequest({
        ...SUBMITTED_1025,
        referenceNumber: "IFC-2027-MEDIA-0901",
        requestedTotalCents: 114_801,
      }),
      "budget_requests_requested_reconciles",
    );
  });

  it("rejects approved amounts that do not reconcile", async () => {
    const split = splitInclusive(3_000_000, "0.1200");
    await expectRejected(
      newRequest({
        ...SUBMITTED_1025,
        referenceNumber: "IFC-2027-MEDIA-0902",
        approvedSubtotalCents: split.subtotal,
        approvedTaxCents: split.tax + 1,
        approvedTotalCents: split.total,
      }),
      "budget_requests_approved_reconciles",
    );
  });

  it("rejects an approved status without approved amounts", async () => {
    await expectRejected(
      newRequest({ ...SUBMITTED_1025, referenceNumber: "IFC-2027-MEDIA-0903", status: "approved" }),
      "budget_requests_approved_has_amounts",
    );
  });

  it("allows one request per department per cycle (Requirements 11, rule 1)", async () => {
    const department = await insertDepartment(db);
    await insertDraft(db, { cycleId, departmentId: department.id, userId });
    await expectRejected(
      insertDraft(db, { cycleId, departmentId: department.id, userId }),
      "budget_requests_cycle_department_key",
    );
  });

  it("enforces the two-edit limit unless more are explicitly allowed (FR-12)", async () => {
    const request = await newRequest();
    await db.update(budgetRequests).set({ editCount: 2 }).where(eq(budgetRequests.id, request.id));
    await expectRejected(
      db.update(budgetRequests).set({ editCount: 3 }).where(eq(budgetRequests.id, request.id)),
      "budget_requests_edit_limit",
    );
    await db
      .update(budgetRequests)
      .set({ editCount: 3, extraEditsAllowed: 1 })
      .where(eq(budgetRequests.id, request.id));
  });

  it("keeps reference numbers unique", async () => {
    await newRequest({ ...SUBMITTED_1025, referenceNumber: "IFC-2027-MEDIA-0950" });
    await expectRejected(
      newRequest({ ...SUBMITTED_1025, referenceNumber: "IFC-2027-MEDIA-0950" }),
      "budget_requests_reference_number_unique",
    );
  });
});

describe("budget_line_items", () => {
  const line = (budgetRequestId: string, values: Partial<typeof budgetLineItems.$inferInsert>) =>
    db.insert(budgetLineItems).values({
      budgetRequestId,
      itemName: "Cable",
      quantity: 2,
      unitPriceCents: 1_250,
      lineTotalCents: 2_500,
      sortOrder: 0,
      ...values,
    });

  it("accepts a line whose total is quantity × unit price", async () => {
    const request = await newRequest();
    await line(request.id, {});
  });

  it.each([
    [{ lineTotalCents: 2_501 }, "budget_line_items_total_reconciles"],
    [{ quantity: 0, lineTotalCents: 0 }, "budget_line_items_quantity_range"],
    [{ quantity: 10_001, lineTotalCents: 12_501_250 }, "budget_line_items_quantity_range"],
    [{ unitPriceCents: -1, lineTotalCents: -2 }, "budget_line_items_unit_price_range"],
    [{ productUrl: "javascript:alert(1)" }, "budget_line_items_url_http"],
    [{ productUrl: "ftp://example.org/file" }, "budget_line_items_url_http"],
  ])("rejects %o (AC-24)", async (values, constraint) => {
    const request = await newRequest();
    await expectRejected(line(request.id, values), constraint);
  });

  it("accepts http and https links", async () => {
    const request = await newRequest();
    await line(request.id, { productUrl: "https://example.org/mixer" });
    await line(request.id, { productUrl: "HTTP://example.org/cable", sortOrder: 1 });
  });
});

describe("departments and representatives (FR-03, FR-38)", () => {
  it("keeps names unique regardless of case, but a rejected name can return", async () => {
    await insertDepartment(db, { name: "Media Team" });
    await expectRejected(
      insertDepartment(db, { name: "media team" }),
      "departments_name_lower_key",
    );
    await insertDepartment(db, { name: "Prayer Team", status: "rejected" });
    await insertDepartment(db, { name: "Prayer Team" });
  });

  it("allows one Primary and one Backup per department, any number of Representatives", async () => {
    const department = await insertDepartment(db);
    const [a, b, c, d] = await Promise.all([1, 2, 3, 4].map(() => insertUser(db)));
    const link = (u: string, representativeType: "primary" | "backup" | "representative") =>
      db
        .insert(userDepartments)
        .values({ userId: u, departmentId: department.id, representativeType });

    await link(a.id, "primary");
    await link(b.id, "backup");
    await link(c.id, "representative");
    await link(d.id, "representative");
    const other = await insertUser(db);
    await expectRejected(link(other.id, "primary"), "user_departments_one_primary");
    await expectRejected(link(other.id, "backup"), "user_departments_one_backup");
    await expectRejected(link(a.id, "representative"), "user_departments_user_department_key");
  });

  it("lets only the Primary set Away", async () => {
    const department = await insertDepartment(db);
    const person = await insertUser(db);
    await expectRejected(
      db.insert(userDepartments).values({
        userId: person.id,
        departmentId: department.id,
        representativeType: "backup",
        awayFrom: new Date(),
      }),
      "user_departments_away_primary_only",
    );
  });

  it("refuses to delete a department that holds history", async () => {
    const request = await newRequest();
    await expectRejected(
      db.delete(departments).where(eq(departments.id, request.departmentId)),
      "budget_requests_department_id_departments_id_fk",
    );
  });
});

describe("decisions and history are append-only", () => {
  async function submittedWithRevision(reference: string) {
    const request = await newRequest({ ...SUBMITTED_1025, referenceNumber: reference });
    const revision = await insertRevision(db, request.id, userId);
    return { request, revision };
  }

  it("blocks changing or deleting a submitted version", async () => {
    const { revision } = await submittedWithRevision("IFC-2027-MEDIA-0960");
    await expectRejected(
      db
        .update(requestRevisions)
        .set({ totalCents: 1 })
        .where(eq(requestRevisions.id, revision.id)),
      "append-only",
    );
    await expectRejected(
      db.delete(requestRevisions).where(eq(requestRevisions.id, revision.id)),
      "append-only",
    );
    await expectRejected(db.execute(sql`truncate request_revisions cascade`), "append-only");
  });

  it("stores AC-35: approve a different amount of $30,000.00 incl. tax", async () => {
    const { request, revision } = await submittedWithRevision("IFC-2027-MEDIA-0961");
    const split = splitInclusive(3_000_000, "0.1200");
    const [decision] = await db
      .insert(approvalDecisions)
      .values({
        budgetRequestId: request.id,
        requestRevisionId: revision.id,
        decision: "approved",
        method: "different_amount",
        approvedSubtotalCents: split.subtotal,
        approvedTaxCents: split.tax,
        approvedTotalCents: split.total,
        decisionReason: "Board approved $30,000.00",
        boardReference: "Board minutes, Nov 12, 2026",
        approverUserId: userId,
        actingRole: "accountant",
      })
      .returning();
    expect(decision).toMatchObject({
      approvedSubtotalCents: 2_678_571,
      approvedTaxCents: 321_429,
      approvedTotalCents: 3_000_000,
    });
  });

  it("requires a note when approving a different amount, returning or declining", async () => {
    const { request, revision } = await submittedWithRevision("IFC-2027-MEDIA-0962");
    const base = {
      budgetRequestId: request.id,
      requestRevisionId: revision.id,
      approverUserId: userId,
      actingRole: "accountant" as const,
    };
    const split = splitInclusive(100_000, "0.1200");
    await expectRejected(
      db.insert(approvalDecisions).values({
        ...base,
        decision: "approved",
        method: "different_amount",
        approvedSubtotalCents: split.subtotal,
        approvedTaxCents: split.tax,
        approvedTotalCents: split.total,
      }),
      "approval_decisions_reason_required",
    );
    for (const decision of ["returned", "declined"] as const) {
      await expectRejected(
        db.insert(approvalDecisions).values({ ...base, decision, decisionReason: "  " }),
        "approval_decisions_reason_required",
      );
    }
  });

  it("requires amounts and a method on approval, and none on a decline", async () => {
    const { request, revision } = await submittedWithRevision("IFC-2027-MEDIA-0963");
    const base = {
      budgetRequestId: request.id,
      requestRevisionId: revision.id,
      approverUserId: userId,
      actingRole: "accountant" as const,
    };
    await expectRejected(
      db
        .insert(approvalDecisions)
        .values({ ...base, decision: "approved", method: "as_requested" }),
      "approval_decisions_approval_has_amounts",
    );
    await expectRejected(
      db.insert(approvalDecisions).values({
        ...base,
        decision: "declined",
        decisionReason: "Over the board total",
        approvedSubtotalCents: 0,
        approvedTaxCents: 0,
        approvedTotalCents: 0,
      }),
      "approval_decisions_approval_has_amounts",
    );
  });

  it("allows setting a held decision's release time once, and nothing else (FR-19a)", async () => {
    const { request, revision } = await submittedWithRevision("IFC-2027-MEDIA-0964");
    const [decision] = await db
      .insert(approvalDecisions)
      .values({
        budgetRequestId: request.id,
        requestRevisionId: revision.id,
        decision: "declined",
        decisionReason: "Not this year",
        approverUserId: userId,
        actingRole: "accountant",
      })
      .returning();
    const byId = eq(approvalDecisions.id, decision.id);

    await expectRejected(
      db.update(approvalDecisions).set({ decisionReason: "Changed" }).where(byId),
      "append-only",
    );
    await db.update(approvalDecisions).set({ releasedAt: new Date() }).where(byId);
    await expectRejected(
      db
        .update(approvalDecisions)
        .set({ releasedAt: new Date(0) })
        .where(byId),
      "append-only",
    );
    await expectRejected(db.delete(approvalDecisions).where(byId), "append-only");
  });

  it("keeps approved lines and the overall adjustment append-only", async () => {
    const { request, revision } = await submittedWithRevision("IFC-2027-MEDIA-0965");
    const line = await insertLine(db, request.id);
    const split = splitInclusive(100_000, "0.1200");
    const [decision] = await db
      .insert(approvalDecisions)
      .values({
        budgetRequestId: request.id,
        requestRevisionId: revision.id,
        decision: "approved",
        method: "different_amount",
        approvedSubtotalCents: split.subtotal,
        approvedTaxCents: split.tax,
        approvedTotalCents: split.total,
        decisionReason: "Board approved $1,000.00",
        approverUserId: userId,
        actingRole: "accountant",
      })
      .returning();
    const [approved] = await db
      .insert(approvedLineItems)
      .values({
        approvalDecisionId: decision.id,
        budgetLineItemId: line.id,
        approvedQuantity: 1,
        approvedUnitPriceCents: 102_500,
        approvedLineTotalCents: 102_500,
      })
      .returning();
    const [adjustment] = await db
      .insert(approvalAdjustments)
      .values({
        approvalDecisionId: decision.id,
        amountCents: split.subtotal - 102_500,
        reason: "Board approved $1,000.00",
        createdByUserId: userId,
      })
      .returning();
    expect(adjustment.amountCents).toBe(-13_214);

    await expectRejected(
      db
        .update(approvedLineItems)
        .set({ adjustmentReason: "x" })
        .where(eq(approvedLineItems.id, approved.id)),
      "append-only",
    );
    await expectRejected(
      db.delete(approvalAdjustments).where(eq(approvalAdjustments.id, adjustment.id)),
      "append-only",
    );
  });

  it("rejects an approved line whose total is not quantity × price", async () => {
    const { request, revision } = await submittedWithRevision("IFC-2027-MEDIA-0966");
    const line = await insertLine(db, request.id);
    const [decision] = await db
      .insert(approvalDecisions)
      .values({
        budgetRequestId: request.id,
        requestRevisionId: revision.id,
        decision: "returned",
        decisionReason: "Which mixer?",
        approverUserId: userId,
        actingRole: "accountant",
      })
      .returning();
    await expectRejected(
      db.insert(approvedLineItems).values({
        approvalDecisionId: decision.id,
        budgetLineItemId: line.id,
        approvedQuantity: 2,
        approvedUnitPriceCents: 100,
        approvedLineTotalCents: 201,
      }),
      "approved_line_items_total_reconciles",
    );
  });
});
