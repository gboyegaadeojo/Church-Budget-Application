"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { expensesCopy } from "@/copy/expenses";
import { startProcessingAction } from "./actions";

/** Start processing (6B.5 step 2): the requester is emailed that it's being processed. */
export function StartProcessing({
  id,
  version,
  reference,
}: {
  id: string;
  version: number;
  reference: string;
}) {
  const [key] = useState(() => crypto.randomUUID());
  return (
    <ActionForm
      action={startProcessingAction}
      aria-label={`${expensesCopy.payment.start}: ${reference}`}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <SubmitButton tone="secondary">{expensesCopy.payment.start}</SubmitButton>
    </ActionForm>
  );
}
