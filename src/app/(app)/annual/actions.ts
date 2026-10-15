"use server";

import { redirect } from "next/navigation";
import { annualCopy } from "@/copy/annual";
import type { RequestContentInput } from "@/domain/annual/schema";
import {
  deleteDraft,
  reviseRequest,
  saveDraft,
  startRequest,
  submitRequest,
  type DraftSaved,
} from "@/domain/annual/service";
import type { ActionState } from "@/lib/action-state";
import { form, runAction, runForResult, type ResultState } from "@/lib/admin-server";

/*
 * Server actions for the requester's annual budget screens (DRD 6.2 to 6.5). Each one
 * calls a domain service in one transaction; the services check permission, validate,
 * recalculate every total and audit. Nothing the browser sends as a total is used.
 */

const m = annualCopy.messages;
const DASHBOARD = "/annual";
const view = (id: string) => `/annual/${id}`;

/** Step 1: pick a department (or Other), then open the request it leads to. */
export async function startAction(_: ActionState, data: FormData): Promise<ActionState> {
  const choice = form.text(data, "department");
  const result = await runForResult(
    async (tx, viewer) => ({
      message: m.started,
      data: await startRequest(tx, viewer, {
        cycleId: form.text(data, "cycleId"),
        departmentId: choice === "other" ? undefined : choice,
        otherName: choice === "other" ? form.text(data, "otherName") : undefined,
      }),
    }),
    { paths: [DASHBOARD], allowWaiting: true },
  );
  if (result.status !== "success") return result;
  const { requestId, existing } = result.data;
  redirect(existing ? view(requestId) : `${view(requestId)}/edit`);
}

export type DraftInput = { id: string; version: number } & RequestContentInput;

/** Autosave and Save draft (FR-05): uses no edit; returns the server's totals. */
export async function saveDraftAction(input: DraftInput): Promise<ResultState<DraftSaved>> {
  return runForResult(
    async (tx, viewer) => ({ message: m.saved, data: await saveDraft(tx, viewer, input) }),
    { paths: [], latestHref: `${view(input.id)}/edit` },
  );
}

export async function deleteDraftAction(_: ActionState, data: FormData): Promise<ActionState> {
  const result = await runAction(
    async (tx, viewer) => {
      await deleteDraft(tx, viewer, {
        id: form.text(data, "id"),
        version: form.text(data, "version"),
      });
      return m.deleted;
    },
    { paths: [DASHBOARD] },
  );
  if (result.status !== "success") return result;
  redirect(DASHBOARD);
}

/** Confirm submission (FR-10). The key makes a repeated click return the first result. */
export async function submitAction(input: {
  id: string;
  version: number;
  idempotencyKey: string;
}): Promise<ActionState> {
  const result = await runForResult(
    async (tx, viewer) => ({ message: m.submitted, data: await submitRequest(tx, viewer, input) }),
    { paths: [DASHBOARD, view(input.id)], latestHref: `${view(input.id)}/edit` },
  );
  if (result.status !== "success") return result;
  redirect(`${view(input.id)}?done=submitted`);
}

/** Confirm a revision (FR-12) or a clarification response (FR-17). */
export async function reviseAction(
  input: { id: string; version: number; idempotencyKey: string } & RequestContentInput,
): Promise<ActionState> {
  const result = await runForResult(
    async (tx, viewer) => {
      const data = await reviseRequest(tx, viewer, input);
      return { message: data.usedEdit ? m.revised : m.responded, data };
    },
    { paths: [DASHBOARD, view(input.id)], latestHref: view(input.id) },
  );
  if (result.status !== "success") return result;
  redirect(`${view(input.id)}?done=${result.data.usedEdit ? "revised" : "responded"}`);
}
