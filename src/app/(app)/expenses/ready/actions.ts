"use server";

import { redirect } from "next/navigation";
import { expensesCopy } from "@/copy/expenses";
import { recordPayment, startProcessing, type PaymentInput } from "@/domain/expenses/payment";
import type { ActionState } from "@/lib/action-state";
import { form, runAction, runForResult } from "@/lib/admin-server";

/** Processing and payment (6B.5). The services check permission, validate and audit. */

const pagesOf = (id: string) => [
  "/expenses/ready",
  `/expenses/ready/${id}`,
  `/expenses/${id}`,
  "/expenses/mine",
  "/",
];

export async function startProcessingAction(_: ActionState, data: FormData): Promise<ActionState> {
  const id = form.text(data, "id");
  return runAction(
    async (tx, viewer) => {
      await startProcessing(tx, viewer, {
        id,
        version: form.text(data, "version"),
        idempotencyKey: form.text(data, "idempotencyKey"),
      });
      return expensesCopy.payment.started;
    },
    { paths: pagesOf(id) },
  );
}

export async function recordPaymentAction(input: {
  id: string;
  version: number;
  idempotencyKey: string;
  payment: PaymentInput;
}): Promise<ActionState> {
  const result = await runForResult(
    async (tx, viewer) => ({ message: "", data: await recordPayment(tx, viewer, input) }),
    { paths: pagesOf(input.id), latestHref: `/expenses/ready/${input.id}` },
  );
  if (result.status !== "success") return result;
  redirect(`/expenses/ready?done=${input.id}`);
}
