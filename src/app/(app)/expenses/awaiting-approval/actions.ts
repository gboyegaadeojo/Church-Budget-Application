"use server";

import { redirect } from "next/navigation";
import { boardDecide } from "@/domain/expenses/board";
import type { ActionState } from "@/lib/action-state";
import { runForResult } from "@/lib/admin-server";
import type { DecideInput } from "../review/decision-panel";

/** The Board Chair's (or Vice-Chair's) final decision (6B.4 level 2). */

const page = (id: string) => `/expenses/awaiting-approval/${id}`;
const pagesOf = (id: string) => [
  "/expenses/awaiting-approval",
  page(id),
  "/expenses/review",
  `/expenses/review/${id}`,
  "/expenses/ready",
  `/expenses/${id}`,
  "/expenses/mine",
  "/",
];

const DONE = {
  approve: "final_approve",
  approve_smaller: "approve_smaller",
  return: "board_return",
  decline: "board_decline",
} as const;

export async function boardDecideAction(input: DecideInput): Promise<ActionState> {
  const result = await runForResult(
    async (tx, viewer) => ({ message: "", data: await boardDecide(tx, viewer, input) }),
    { paths: pagesOf(input.id), latestHref: page(input.id) },
  );
  if (result.status !== "success") return result;
  const done = DONE[input.decision.kind as keyof typeof DONE] ?? "final_approve";
  redirect(`${page(input.id)}?done=${done}`);
}
