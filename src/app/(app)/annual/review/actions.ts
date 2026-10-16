"use server";

import { redirect } from "next/navigation";
import { annualCopy } from "@/copy/annual";
import type { DecisionInput } from "@/domain/annual/decision";
import { decideRequest, reopenRequest, startReview } from "@/domain/annual/review";
import type { ActionState } from "@/lib/action-state";
import { runForResult } from "@/lib/admin-server";

/**
 * Accountant review actions (FR-15 to FR-18a). The services check permissions, validate,
 * recalculate every amount and audit; these only pass the form through and refresh.
 */

const r = annualCopy.review;
const DASHBOARD = "/annual/review";
const ALL = "/annual/all";
const page = (id: string) => `/annual/review/${id}`;
/** Every page that shows the request, for the accountant and for the department. */
const pagesOf = (id: string) => [DASHBOARD, ALL, page(id), "/annual", `/annual/${id}`, "/"];

/** Called when the review screen opens: Submitted or Updated becomes In Review. */
export async function startReviewAction(id: string): Promise<boolean> {
  const result = await runForResult(
    async (tx, viewer) => ({ message: "", data: await startReview(tx, viewer, { id }) }),
    { paths: pagesOf(id) },
  );
  return result.status === "success" && result.data;
}

const DONE = {
  approve_as_requested: "approved",
  approve_different_amount: "approved",
  approve_line_changes: "approved",
  return: "returned",
  decline: "declined",
} as const;

export async function decideAction(input: {
  id: string;
  version: number;
  idempotencyKey: string;
  decision: DecisionInput;
}): Promise<ActionState> {
  const result = await runForResult(
    async (tx, viewer) => {
      const data = await decideRequest(tx, viewer, input);
      return { message: r.done[DONE[data.kind]], data };
    },
    { paths: pagesOf(input.id), latestHref: page(input.id) },
  );
  if (result.status !== "success") return result;
  redirect(`${page(input.id)}?done=${DONE[result.data.kind]}`);
}

export async function reopenAction(input: {
  id: string;
  version: number;
  idempotencyKey: string;
  reason: string;
}): Promise<ActionState> {
  const result = await runForResult(
    async (tx, viewer) => ({
      message: r.done.reopened,
      data: await reopenRequest(tx, viewer, input),
    }),
    { paths: pagesOf(input.id), latestHref: page(input.id) },
  );
  if (result.status !== "success") return result;
  redirect(`${page(input.id)}?done=reopened`);
}
