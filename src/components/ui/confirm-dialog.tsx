"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { adminCopy } from "@/copy/admin";
import { buttonClass, type ButtonTone } from "./styles";

/**
 * Confirmation before a consequential action (DRD 7.4). The dialog explains what will
 * happen; its confirm button submits the form named by `formId`, so the server action
 * (and its validation) still decides. Esc or Cancel closes it and returns focus.
 */
export function ConfirmDialog({
  formId,
  trigger,
  triggerTone = "secondary",
  title,
  body,
  confirmLabel,
  confirmTone = "primary",
}: {
  formId: string;
  trigger: string;
  triggerTone?: ButtonTone;
  title: string;
  body: string;
  confirmLabel: string;
  confirmTone?: ButtonTone;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger className={buttonClass(triggerTone)}>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-(--z-overlay) bg-black/40" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-(--z-overlay) w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-card border border-border bg-surface p-6 text-fg shadow-overlay">
          <AlertDialog.Title className="text-lg font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-fg-muted">
            {body}
          </AlertDialog.Description>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel className={buttonClass("secondary")}>
              {adminCopy.common.cancel}
            </AlertDialog.Cancel>
            <AlertDialog.Action
              className={buttonClass(confirmTone)}
              onClick={() =>
                (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit()
              }
            >
              {confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
