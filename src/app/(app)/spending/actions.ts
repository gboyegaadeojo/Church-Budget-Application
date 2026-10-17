"use server";

import { redirect } from "next/navigation";
import { spendingCopy } from "@/copy/spending";
import { amendBudget } from "@/domain/spending/amendments";
import { correctEntry, recordEntry, voidEntry } from "@/domain/spending/service";
import { carryOver, lockSpending, reopenSpending } from "@/domain/spending/year-end";
import { formatCAD } from "@/lib/money";
import type { ActionState } from "@/lib/action-state";
import { form, runAction, runForResult } from "@/lib/admin-server";

/**
 * Spending actions (FR-24). The service checks permission and the lock, validates,
 * recalculates and audits; these pass what was typed through.
 */

const PATHS = ["/spending", "/spending/ledger", "/spending/record", "/spending/my-department", "/"];

const ENTRY_FIELDS = [
  "entryType",
  "spentOn",
  "payee",
  "description",
  "amount",
  "paymentMethod",
  "referenceNumber",
  "budgetLineItemId",
  "notes",
  "overspendNote",
] as const;

function entryFrom(data: FormData) {
  const out: Record<string, unknown> = {};
  for (const name of ENTRY_FIELDS) out[name] = form.text(data, name);
  out.confirmDuplicate = form.checked(data, "confirmDuplicate");
  out.confirmUnbudgeted = form.checked(data, "confirmUnbudgeted");
  out.allowOutsideYear = form.checked(data, "allowOutsideYear");
  return out;
}

export async function recordEntryAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      await recordEntry(tx, viewer, {
        ...entryFrom(data),
        cycleId: form.text(data, "cycleId"),
        departmentId: form.text(data, "departmentId"),
        idempotencyKey: form.text(data, "idempotencyKey"),
      });
      return spendingCopy.record.saved;
    },
    { paths: PATHS },
  );
}

export async function correctEntryAction(_: ActionState, data: FormData): Promise<ActionState> {
  const id = form.text(data, "id");
  return runAction(
    async (tx, viewer) => {
      await correctEntry(tx, viewer, {
        ...entryFrom(data),
        id,
        version: form.text(data, "version"),
        reason: form.text(data, "reason"),
      });
      return spendingCopy.edit.saved;
    },
    { paths: [...PATHS, `/spending/entries/${id}`] },
  );
}

export async function voidEntryAction(_: ActionState, data: FormData): Promise<ActionState> {
  const id = form.text(data, "id");
  const result = await runForResult(
    async (tx, viewer) => {
      await voidEntry(tx, viewer, {
        id,
        version: form.text(data, "version"),
        reason: form.text(data, "reason"),
      });
      return { message: spendingCopy.edit.voided, data: null };
    },
    { paths: [...PATHS, `/spending/entries/${id}`] },
  );
  if (result.status !== "success") return result;
  redirect(`/spending/entries/${id}?done=voided`);
}

export async function amendBudgetAction(_: ActionState, data: FormData): Promise<ActionState> {
  const departmentId = form.text(data, "departmentId");
  return runAction(
    async (tx, viewer) => {
      const { availableCents } = await amendBudget(tx, viewer, {
        cycleId: form.text(data, "cycleId"),
        departmentId,
        direction: form.text(data, "direction"),
        amount: form.text(data, "amount"),
        reason: form.text(data, "reason"),
        boardReference: form.text(data, "boardReference"),
        confirmNegative: form.checked(data, "confirmNegative"),
        idempotencyKey: form.text(data, "idempotencyKey"),
      });
      return spendingCopy.amend.saved(formatCAD(availableCents));
    },
    { paths: [...PATHS, `/spending/departments/${departmentId}`] },
  );
}

const YEAR_END = [...PATHS, "/spending/year-end", "/expenses"];

export async function lockSpendingAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      await lockSpending(tx, viewer, {
        cycleId: form.text(data, "cycleId"),
        version: form.text(data, "version"),
        idempotencyKey: form.text(data, "idempotencyKey"),
      });
      return spendingCopy.yearEnd.locked(form.text(data, "cycleName"));
    },
    { paths: YEAR_END },
  );
}

export async function reopenSpendingAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      await reopenSpending(tx, viewer, {
        cycleId: form.text(data, "cycleId"),
        version: form.text(data, "version"),
        reason: form.text(data, "reason"),
      });
      return spendingCopy.yearEnd.reopened(form.text(data, "cycleName"));
    },
    { paths: YEAR_END },
  );
}

export async function carryOverAction(_: ActionState, data: FormData): Promise<ActionState> {
  const id = form.text(data, "id");
  return runAction(
    async (tx, viewer) => {
      await carryOver(tx, viewer, {
        id,
        version: form.text(data, "version"),
        reason: form.text(data, "reason"),
        idempotencyKey: form.text(data, "idempotencyKey"),
      });
      return spendingCopy.yearEnd.carried(form.text(data, "nextName"));
    },
    { paths: [...YEAR_END, `/expenses/${id}`] },
  );
}
