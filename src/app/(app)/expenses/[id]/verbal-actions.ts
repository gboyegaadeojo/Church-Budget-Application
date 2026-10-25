"use server";

import { redirect } from "next/navigation";
import { recordVerbalApproval } from "@/domain/expenses/verbal";
import type { ActionState } from "@/lib/action-state";
import { runForResult } from "@/lib/admin-server";

/**
 * The Church Administrator records an approval given verbally (decided by the church
 * 2026-10-24). The service checks permission and the named approver, validates,
 * recalculates every amount, audits and queues the emails.
 */

export type VerbalInput = {
  id: string;
  version: number;
  idempotencyKey: string;
  approval: {
    level: "accountant" | "board";
    approverUserId: string;
    kind: "approve" | "approve_smaller";
    amount?: string;
    note?: string;
    how: string;
    confirmed: boolean;
  };
};

const page = (id: string) => `/expenses/${id}`;

export async function recordVerbalApprovalAction(input: VerbalInput): Promise<ActionState> {
  const result = await runForResult(
    async (tx, viewer) => ({ message: "", data: await recordVerbalApproval(tx, viewer, input) }),
    {
      paths: [
        page(input.id),
        "/expenses/review",
        `/expenses/review/${input.id}`,
        "/expenses/awaiting-approval",
        `/expenses/awaiting-approval/${input.id}`,
        "/expenses/ready",
        "/expenses/all",
        "/",
      ],
      latestHref: page(input.id),
    },
  );
  if (result.status !== "success") return result;
  const done = result.data.status === "approved" ? "verbal_fully_approved" : "verbal_waiting";
  redirect(`${page(input.id)}?done=${done}`);
}
