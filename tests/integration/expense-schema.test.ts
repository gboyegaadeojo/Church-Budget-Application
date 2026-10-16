import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appSettings,
  expenseDecisions,
  expensePayments,
  expenseReceiptFiles,
  expenseRevisions,
  expenseSubmissions,
  spendingEntries,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { budgetFigures } from "@/domain/expenses/budget";
import { createTestDb, expectRejected, type TestDb } from "./helpers/db";
import {
  insertApprovedBudget,
  insertCycle,
  insertDepartment,
  insertUser,
} from "./helpers/fixtures";

/** The expense tables (6B.10) and the budget figures built on them (FR-25, FR-42). */

let t: TestDb;
let db: Db;
let userId: string;
let cycleId: string;
let seq = 0;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  userId = (await insertUser(db)).id;
  cycleId = (await insertCycle(db, userId)).id;
});

afterAll(async () => {
  await t?.close();
});

type SubmissionInsert = typeof expenseSubmissions.$inferInsert;

async function insertExpense(departmentId: string, overrides: Partial<SubmissionInsert> = {}) {
  const [row] = await db
    .insert(expenseSubmissions)
    .values({
      type: "purchase_request",
      budgetCycleId: cycleId,
      departmentId,
      departmentNameSnapshot: "Media Team",
      requesterUserId: userId,
      title: "Cables",
      justification: "Old ones are failing",
      ...overrides,
    })
    .returning();
  return row;
}

/** Submitted amounts for 2 × $450.00 at 12% (AC-65). */
const SUBMITTED_1008 = () => ({
  status: "submitted" as const,
  referenceNumber: `EXP-2027-${String(++seq).padStart(4, "0")}`,
  taxRate: "0.1200",
  subtotalCents: 90_000,
  taxCents: 10_800,
  totalCents: 100_800,
  submittedAt: new Date("2027-02-01T17:00:00Z"),
});

const APPROVED_1008 = {
  approvedSubtotalCents: 90_000,
  approvedTaxCents: 10_800,
  approvedTotalCents: 100_800,
};

async function insertRevision(expenseSubmissionId: string) {
  const [row] = await db
    .insert(expenseRevisions)
    .values({
      expenseSubmissionId,
      revisionNumber: 1,
      kind: "submission",
      editedByUserId: userId,
      taxRate: "0.1200",
      subtotalCents: 90_000,
      taxCents: 10_800,
      totalCents: 100_800,
      snapshot: { title: "Cables" },
    })
    .returning();
  return row;
}

describe("migration", () => {
  it("seeds the expense settings (6B.10)", async () => {
    const rows = await db.select().from(appSettings);
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(settings).toMatchObject({
      claim_deadline_days: "90",
      unclaimed_purchase_reminder_days: "60",
      payment_reminder_days: "14",
      board_reminder_days: "7",
    });
  });
});

describe("expense_submissions", () => {
  it("requires amounts that reconcile", async () => {
    const department = await insertDepartment(db);
    await expectRejected(
      insertExpense(department.id, { ...SUBMITTED_1008(), totalCents: 100_801 }),
      "expense_submissions_amounts_reconcile",
    );
  });

  it("never adds tax to a claim (FR-41)", async () => {
    const department = await insertDepartment(db);
    await expectRejected(
      insertExpense(department.id, { ...SUBMITTED_1008(), type: "expense_claim" }),
      "expense_submissions_claim_adds_no_tax",
    );
  });

  it("needs an approved amount once approved", async () => {
    const department = await insertDepartment(db);
    await expectRejected(
      insertExpense(department.id, { ...SUBMITTED_1008(), status: "approved" }),
      "expense_submissions_charged_has_amount",
    );
  });

  it("lets a never-submitted draft be deleted, and nothing else", async () => {
    const department = await insertDepartment(db);
    const draft = await insertExpense(department.id);
    await db.delete(expenseSubmissions).where(eq(expenseSubmissions.id, draft.id));
    const submitted = await insertExpense(department.id, SUBMITTED_1008());
    await expectRejected(
      db.delete(expenseSubmissions).where(eq(expenseSubmissions.id, submitted.id)),
      "only a never-submitted draft",
    );
  });
});

describe("append-only history (FR-44, FR-51)", () => {
  it("keeps revisions, decisions and payments unchanged", async () => {
    const department = await insertDepartment(db);
    const expense = await insertExpense(department.id, {
      ...SUBMITTED_1008(),
      ...APPROVED_1008,
      status: "approved",
    });
    const revision = await insertRevision(expense.id);
    const [decision] = await db
      .insert(expenseDecisions)
      .values({
        expenseSubmissionId: expense.id,
        revisionId: revision.id,
        level: "accountant",
        decision: "approved",
        ...APPROVED_1008,
        decidedByUserId: userId,
        actingRole: "accountant",
      })
      .returning();
    const [payment] = await db
      .insert(expensePayments)
      .values({
        expenseSubmissionId: expense.id,
        method: "e_transfer",
        paidOn: "2027-02-10",
        amountCents: 100_800,
        reference: "CA1234",
        recordedByUserId: userId,
      })
      .returning();

    await expectRejected(
      db
        .update(expenseRevisions)
        .set({ totalCents: 1 })
        .where(eq(expenseRevisions.id, revision.id)),
      "append-only",
    );
    await expectRejected(
      db.delete(expenseDecisions).where(eq(expenseDecisions.id, decision.id)),
      "append-only",
    );
    await expectRejected(
      db.update(expensePayments).set({ notes: "x" }).where(eq(expensePayments.id, payment.id)),
      "append-only",
    );
  });

  it("requires two different signers and a cheque number for a cheque (AC-76)", async () => {
    const department = await insertDepartment(db);
    const expense = await insertExpense(department.id, {
      ...SUBMITTED_1008(),
      ...APPROVED_1008,
      status: "approved",
    });
    await expectRejected(
      db.insert(expensePayments).values({
        expenseSubmissionId: expense.id,
        method: "cheque",
        paidOn: "2027-02-10",
        amountCents: 100_800,
        recordedByUserId: userId,
      }),
      "expense_payments_cheque_signers",
    );
  });

  it("never deletes a receipt file or spending entry", async () => {
    const department = await insertDepartment(db);
    const expense = await insertExpense(department.id, {
      ...SUBMITTED_1008(),
      type: "expense_claim",
      subtotalCents: 100_800,
      taxCents: 0,
    });
    const [file] = await db
      .insert(expenseReceiptFiles)
      .values({
        expenseSubmissionId: expense.id,
        storageKey: `receipts/${expense.id}/a`,
        fileName: "receipt.jpg",
        contentType: "image/jpeg",
        sizeBytes: 1000,
        sha256: "a".repeat(64),
        uploadedByUserId: userId,
      })
      .returning();
    await expectRejected(
      db.delete(expenseReceiptFiles).where(eq(expenseReceiptFiles.id, file.id)),
      "append-only",
    );
    await expectRejected(
      db.insert(expenseReceiptFiles).values({
        expenseSubmissionId: expense.id,
        storageKey: `receipts/${expense.id}/b`,
        fileName: "receipt.gif",
        contentType: "image/gif",
        sizeBytes: 1000,
        sha256: "b".repeat(64),
        uploadedByUserId: userId,
      }),
      "expense_receipt_files_type",
    );
    const [entry] = await db
      .insert(spendingEntries)
      .values({
        budgetCycleId: cycleId,
        departmentId: department.id,
        expenseSubmissionId: expense.id,
        entryType: "expense",
        spentOn: "2027-02-01",
        payee: "Long & McQuade",
        description: "Cables",
        amountCents: 100_800,
        createdByUserId: userId,
      })
      .returning();
    await expectRejected(
      db.delete(spendingEntries).where(eq(spendingEntries.id, entry.id)),
      "append-only",
    );
  });
});

describe("budget figures (FR-25, FR-42)", () => {
  it("has no budget until the annual decision is released (AC-78, FR-19a)", async () => {
    const department = await insertDepartment(db);
    await insertApprovedBudget(db, { cycleId, departmentId: department.id, userId }, 3_000_000, {
      released: false,
    });
    const figures = await budgetFigures(db, cycleId, department.id);
    expect(figures.annualRequestId).toBeNull();
    expect(figures.available).toBe(0);
  });

  it("adds approved purchase requests to Committed and claims' entries to Spent", async () => {
    const department = await insertDepartment(db);
    await insertApprovedBudget(db, { cycleId, departmentId: department.id, userId }, 3_000_000);
    await insertExpense(department.id, {
      ...SUBMITTED_1008(),
      ...APPROVED_1008,
      status: "approved",
    });
    // Pending: shown, not deducted.
    await insertExpense(department.id, SUBMITTED_1008());
    // Ended without a charge.
    await insertExpense(department.id, { ...SUBMITTED_1008(), status: "withdrawn" });
    await db.insert(spendingEntries).values([
      {
        budgetCycleId: cycleId,
        departmentId: department.id,
        entryType: "expense",
        spentOn: "2027-02-01",
        payee: "Staples",
        description: "Paper",
        amountCents: 16_800,
        createdByUserId: userId,
      },
      {
        budgetCycleId: cycleId,
        departmentId: department.id,
        entryType: "refund",
        spentOn: "2027-02-02",
        payee: "Staples",
        description: "Returned paper",
        amountCents: 5_600,
        createdByUserId: userId,
      },
      {
        budgetCycleId: cycleId,
        departmentId: department.id,
        entryType: "expense",
        spentOn: "2027-02-03",
        payee: "Staples",
        description: "Entered twice",
        amountCents: 16_800,
        status: "voided",
        voidReason: "Duplicate",
        createdByUserId: userId,
      },
    ]);

    expect(await budgetFigures(db, cycleId, department.id)).toMatchObject({
      available: 3_000_000,
      committed: 100_800,
      pending: 100_800,
      spent: 11_200,
      remaining: 3_000_000 - 100_800 - 11_200,
    });
  });
});
