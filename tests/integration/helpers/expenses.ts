import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { userDepartments, userRoles } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import type { ExpenseContentInput } from "@/domain/expenses/schema";
import {
  saveExpenseDraft,
  startExpense,
  submitExpense,
  type SubmitExpenseResult,
} from "@/domain/expenses/service";
import type { Subject } from "@/lib/authz";
import type { Role } from "@/lib/roles";
import { insertApprovedBudget, insertCycle, insertDepartment, insertUser } from "./fixtures";

/**
 * A small church for expense tests: one cycle, departments with approved budgets, and a
 * person per role. Each call makes new people and departments, so tests don't collide.
 */

export async function person(db: Db, roles: Role[], departmentIds: string[] = []) {
  const row = await insertUser(db, { pcoLeaderVerified: true, accessStatus: "active" });
  for (const role of roles) await db.insert(userRoles).values({ userId: row.id, role });
  for (const departmentId of departmentIds) {
    // The first leader is the department's Primary; anyone later is a Representative.
    const taken = await db
      .select({ id: userDepartments.id })
      .from(userDepartments)
      .where(eq(userDepartments.departmentId, departmentId));
    await db.insert(userDepartments).values({
      userId: row.id,
      departmentId,
      representativeType: taken.length === 0 ? "primary" : "representative",
    });
  }
  const subject: Subject = {
    id: row.id,
    roles,
    departments: departmentIds.map((id) => ({ id, name: "Dept", representativeType: "primary" })),
  };
  return { ...subject, email: row.email, name: row.displayName };
}

let year = 3000;

export type ExpenseWorld = Awaited<ReturnType<typeof expenseWorld>>;

export async function expenseWorld(db: Db, options: { budgetCents?: number } = {}) {
  const owner = await insertUser(db);
  const cycle = await insertCycle(db, owner.id, {
    budgetYear: ++year,
    name: `FY${randomUUID().slice(0, 6)}`,
  });
  const media = await insertDepartment(db, { name: `Media ${randomUUID().slice(0, 6)}` });
  const accountant = await person(db, ["accountant"]);
  await insertApprovedBudget(
    db,
    { cycleId: cycle.id, departmentId: media.id, userId: owner.id, approverUserId: accountant.id },
    options.budgetCents ?? 3_000_000,
  );
  const requester = await person(db, ["requester"], [media.id]);
  const chair = await person(db, ["board_chair"]);
  const vice = await person(db, ["vice_chair"]);
  const office = await person(db, ["church_admin"]);
  return { cycle, media, requester, accountant, chair, vice, office };
}

/** 2 × $450.00 before tax: $900.00 + $108.00 = $1,008.00 (AC-65). */
export const PURCHASE: ExpenseContentInput = {
  title: "Wireless microphones",
  justification: "Two of ours have failed.",
  items: [{ name: "Microphone", quantity: "2", unitPrice: "450.00" }],
  howBought: "church_account",
};

/** Receipts of $112.00 and $56.00, no tax added: $168.00 (AC-68). */
export const CLAIM: ExpenseContentInput = {
  title: "Cables and tape",
  justification: "Needed for Sunday.",
  lines: [
    { date: "2026-10-10", vendor: "Long & McQuade", description: "XLR cables", amount: "112.00" },
    { date: "2026-10-11", vendor: "Staples", description: "Gaffer tape", amount: "56.00" },
  ],
  payeeKind: "self",
  paymentPreference: "cheque",
  noReceipt: true,
  noReceiptReason: "Receipts are on paper; handing them to the office.",
};

export const NOW = new Date("2026-10-20T17:00:00Z");

/** Starts, fills and submits an expense as the requester. */
export async function submitted(
  db: Db,
  world: Pick<ExpenseWorld, "cycle" | "media" | "requester">,
  type: "purchase_request" | "expense_claim",
  content: ExpenseContentInput = type === "purchase_request" ? PURCHASE : CLAIM,
): Promise<SubmitExpenseResult> {
  return db.transaction(async (tx: Tx) => {
    const { expenseId } = await startExpense(tx, world.requester, {
      type,
      departmentId: world.media.id,
      cycleId: world.cycle.id,
    });
    const saved = await saveExpenseDraft(tx, world.requester, {
      id: expenseId,
      version: 1,
      ...content,
    });
    return submitExpense(
      tx,
      world.requester,
      { id: expenseId, version: saved.version, idempotencyKey: randomUUID() },
      { now: NOW },
    );
  });
}
