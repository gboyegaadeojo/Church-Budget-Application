"use server";

import { redirect } from "next/navigation";
import { expensesCopy } from "@/copy/expenses";
import type { ExpenseContentInput } from "@/domain/expenses/schema";
import {
  cancelPurchaseRequest,
  deleteExpenseDraft,
  editExpense,
  saveExpenseDraft,
  startExpense,
  submitExpense,
  withdrawExpense,
  type ExpenseDraftSaved,
} from "@/domain/expenses/service";
import type { ActionState } from "@/lib/action-state";
import { form, runAction, runForResult, type ResultState } from "@/lib/admin-server";

/*
 * Server actions for the requester's expense screens (6B.3, DRD 6.9a). Each one calls a
 * domain service in one transaction; the services check permission, validate,
 * recalculate every total and audit. Nothing the browser sends as a total is used.
 */

const m = expensesCopy.messages;
const MINE = "/expenses/mine";
const view = (id: string) => `/expenses/${id}`;
const edit = (id: string) => `/expenses/${id}/edit`;
/** Every page that shows an expense, so none is served from a stale cache. */
const pagesOf = (id: string) => [
  MINE,
  view(id),
  edit(id),
  "/expenses/review",
  "/expenses/awaiting-approval",
  "/expenses/ready",
  "/expenses/all",
  "/",
];

/** New expense: type, department and year; opens the draft. */
export async function startExpenseAction(_: ActionState, data: FormData): Promise<ActionState> {
  const result = await runForResult(
    async (tx, viewer) => ({
      message: m.started,
      data: await startExpense(tx, viewer, {
        type: form.text(data, "type"),
        departmentId: form.text(data, "departmentId"),
        cycleId: form.text(data, "cycleId"),
      }),
    }),
    { paths: [MINE] },
  );
  if (result.status !== "success") return result;
  redirect(edit(result.data.expenseId));
}

export type ExpenseDraftInput = { id: string; version: number } & ExpenseContentInput;

export async function saveExpenseDraftAction(
  input: ExpenseDraftInput,
): Promise<ResultState<ExpenseDraftSaved>> {
  return runForResult(
    async (tx, viewer) => ({ message: m.saved, data: await saveExpenseDraft(tx, viewer, input) }),
    { paths: [MINE], latestHref: edit(input.id) },
  );
}

export async function deleteExpenseDraftAction(
  _: ActionState,
  data: FormData,
): Promise<ActionState> {
  const id = form.text(data, "id");
  const result = await runAction(
    async (tx, viewer) => {
      await deleteExpenseDraft(tx, viewer, { id, version: form.text(data, "version") });
      return m.deleted;
    },
    { paths: pagesOf(id) },
  );
  if (result.status !== "success") return result;
  redirect(MINE);
}

/** Confirm submission. The key makes a repeated click return the first result (FR-10). */
export async function submitExpenseAction(input: {
  id: string;
  version: number;
  idempotencyKey: string;
}): Promise<ActionState> {
  const result = await runForResult(
    async (tx, viewer) => ({ message: m.submitted, data: await submitExpense(tx, viewer, input) }),
    { paths: pagesOf(input.id), latestHref: edit(input.id) },
  );
  if (result.status !== "success") return result;
  redirect(`${view(input.id)}?done=submitted`);
}

/** Save a change before review starts, or answer a return for clarification (FR-44). */
export async function editExpenseAction(
  input: { id: string; version: number; idempotencyKey: string } & ExpenseContentInput,
): Promise<ActionState> {
  const result = await runForResult(
    async (tx, viewer) => {
      const data = await editExpense(tx, viewer, input);
      return { message: data.responded ? m.responded : m.edited, data };
    },
    { paths: pagesOf(input.id), latestHref: view(input.id) },
  );
  if (result.status !== "success") return result;
  redirect(`${view(input.id)}?done=${result.data.responded ? "responded" : "edited"}`);
}

export async function withdrawExpenseAction(_: ActionState, data: FormData): Promise<ActionState> {
  const id = form.text(data, "id");
  const result = await runAction(
    async (tx, viewer) => {
      await withdrawExpense(tx, viewer, {
        id,
        version: form.text(data, "version"),
        idempotencyKey: form.text(data, "idempotencyKey"),
      });
      return m.withdrawn;
    },
    { paths: pagesOf(id), latestHref: view(id) },
  );
  if (result.status !== "success") return result;
  redirect(`${view(id)}?done=withdrawn`);
}

export async function cancelPurchaseRequestAction(
  _: ActionState,
  data: FormData,
): Promise<ActionState> {
  const id = form.text(data, "id");
  const result = await runAction(
    async (tx, viewer) => {
      await cancelPurchaseRequest(tx, viewer, {
        id,
        version: form.text(data, "version"),
        idempotencyKey: form.text(data, "idempotencyKey"),
        reason: form.text(data, "reason"),
      });
      return m.cancelled;
    },
    { paths: pagesOf(id), latestHref: view(id) },
  );
  if (result.status !== "success") return result;
  redirect(`${view(id)}?done=cancelled`);
}
