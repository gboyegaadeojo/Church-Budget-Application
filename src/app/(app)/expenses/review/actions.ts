"use server";

import { redirect } from "next/navigation";
import { expensesCopy } from "@/copy/expenses";
import { accountantDecide, startExpenseReview } from "@/domain/expenses/review";
import type { ActionState } from "@/lib/action-state";
import { runForResult } from "@/lib/admin-server";
import type { DecideInput } from "./decision-panel";

/**
 * The accountant's review actions (6B.4 level 1). The services check permission,
 * validate, recalculate every amount, audit and queue the emails; these pass the input
 * through and refresh the pages that show the expense.
 */

const page = (id: string) => `/expenses/review/${id}`;
const pagesOf = (id: string) => [
  "/expenses/review",
  page(id),
  "/expenses/awaiting-approval",
  `/expenses/${id}`,
  "/expenses/mine",
  "/",
];

/** When the review screen opens: Submitted becomes In Review (FR-44). */
export async function startExpenseReviewAction(id: string): Promise<boolean> {
  const result = await runForResult(
    async (tx, viewer) => ({ message: "", data: await startExpenseReview(tx, viewer, { id }) }),
    { paths: pagesOf(id) },
  );
  return result.status === "success" && result.data;
}

export async function accountantDecideAction(input: DecideInput): Promise<ActionState> {
  const result = await runForResult(
    async (tx, viewer) => ({
      message: "",
      data: await accountantDecide(tx, viewer, input),
    }),
    { paths: pagesOf(input.id), latestHref: page(input.id) },
  );
  if (result.status !== "success") return result;
  const kind = input.decision.kind as keyof typeof expensesCopy.review.done;
  redirect(`${page(input.id)}?done=${kind}`);
}
