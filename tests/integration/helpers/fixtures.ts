import {
  budgetCycles,
  budgetLineItems,
  budgetRequests,
  departments,
  requestRevisions,
  users,
} from "@/db/schema";
import type { Db } from "@/db/types";

let counter = 0;
const unique = (prefix: string) => `${prefix}-${++counter}`;

export async function insertUser(db: Db, overrides: Partial<typeof users.$inferInsert> = {}) {
  const name = unique("person");
  const [row] = await db
    .insert(users)
    .values({ email: `${name}@example.org`, displayName: name, ...overrides })
    .returning();
  return row;
}

export async function insertDepartment(
  db: Db,
  overrides: Partial<typeof departments.$inferInsert> = {},
) {
  const [row] = await db
    .insert(departments)
    .values({ name: unique("Department"), ...overrides })
    .returning();
  return row;
}

export async function insertCycle(
  db: Db,
  createdByUserId: string,
  overrides: Partial<typeof budgetCycles.$inferInsert> = {},
) {
  const [row] = await db
    .insert(budgetCycles)
    .values({
      name: "FY2027",
      budgetYear: 2027,
      startDate: "2027-01-01",
      submissionDeadline: new Date("2026-11-30T08:00:00Z"),
      defaultTaxRate: "0.1200",
      status: "open",
      createdByUserId,
      ...overrides,
    })
    .returning();
  return row;
}

/** A draft request with no amounts, as the form first saves it. */
export async function insertDraft(
  db: Db,
  ids: { cycleId: string; departmentId: string; userId: string },
  overrides: Partial<typeof budgetRequests.$inferInsert> = {},
) {
  const [row] = await db
    .insert(budgetRequests)
    .values({
      budgetCycleId: ids.cycleId,
      departmentId: ids.departmentId,
      requesterUserId: ids.userId,
      departmentNameSnapshot: "Media Team",
      title: "Sound desk upgrade",
      ...overrides,
    })
    .returning();
  return row;
}

/** The submitted amounts for one $1,025.00 line at 12% (AC-31). */
export const SUBMITTED_1025 = {
  status: "submitted" as const,
  referenceNumber: "IFC-2027-0001",
  taxRate: "0.1200",
  requestedSubtotalCents: 102_500,
  requestedTaxCents: 12_300,
  requestedTotalCents: 114_800,
  submittedAt: new Date("2026-10-20T17:00:00Z"),
};

export async function insertLine(db: Db, budgetRequestId: string) {
  const [row] = await db
    .insert(budgetLineItems)
    .values({
      budgetRequestId,
      itemName: "Mixer",
      quantity: 1,
      unitPriceCents: 102_500,
      lineTotalCents: 102_500,
      sortOrder: 0,
    })
    .returning();
  return row;
}

export async function insertRevision(db: Db, budgetRequestId: string, editedByUserId: string) {
  const [row] = await db
    .insert(requestRevisions)
    .values({
      budgetRequestId,
      revisionNumber: 0,
      kind: "submission",
      editedByUserId,
      taxRate: "0.1200",
      subtotalCents: 102_500,
      taxCents: 12_300,
      totalCents: 114_800,
      requestSnapshot: { title: "Sound desk upgrade", lines: [] },
    })
    .returning();
  return row;
}
