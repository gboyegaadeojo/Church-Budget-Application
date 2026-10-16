"use client";

import { useId, useState } from "react";
import { ActionForm, TextAreaField } from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { expensesCopy } from "@/copy/expenses";
import { cancelPurchaseRequestAction, withdrawExpenseAction } from "../actions";

const v = expensesCopy.view;

/** Withdraw before approval (FR-44), with a confirmation. */
export function WithdrawExpense({ id, version }: { id: string; version: number }) {
  const formId = useId();
  const [key] = useState(() => crypto.randomUUID());
  return (
    <ActionForm action={withdrawExpenseAction} id={formId}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <ConfirmDialog
        formId={formId}
        trigger={v.withdraw}
        triggerTone="danger"
        title={v.withdrawTitle}
        body={v.withdrawBody}
        confirmLabel={v.withdrawConfirm}
        confirmTone="danger"
      />
    </ActionForm>
  );
}

/** Cancel an approved purchase request that won't go ahead, with a reason (FR-44). */
export function CancelPurchaseRequest({ id, version }: { id: string; version: number }) {
  const formId = useId();
  const [key] = useState(() => crypto.randomUUID());
  return (
    <ActionForm action={cancelPurchaseRequestAction} id={formId}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <TextAreaField name="reason" label={v.cancelReason} required rows={3} />
      <ConfirmDialog
        formId={formId}
        trigger={v.cancel}
        triggerTone="danger"
        title={v.cancelTitle}
        body={v.cancelBody}
        confirmLabel={v.cancelConfirm}
        confirmTone="danger"
      />
    </ActionForm>
  );
}
