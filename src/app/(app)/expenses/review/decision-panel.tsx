"use client";

import { useId, useState, useTransition } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Loader2 } from "lucide-react";
import { FormMessage } from "@/components/ui/action-form";
import { buttonClass, inputClass, textareaClass, type ButtonTone } from "@/components/ui/styles";
import { adminCopy } from "@/copy/admin";
import { expensesCopy } from "@/copy/expenses";
import { approvedFiguresFor } from "@/domain/expenses/decision";
import type { ExpenseType } from "@/domain/expenses/status";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { formatCAD, parseCAD } from "@/lib/money";

const r = expensesCopy.review;

export type DecisionOption = {
  kind: string;
  label: string;
  /** Approve a different (or smaller) amount: a total including tax, at most `maxCents`. */
  amount?: boolean;
  /** "required" asks for a note; "optional" offers one. */
  note?: { label: string; required: boolean };
  confirmTitle: string;
  confirmBody: string;
  tone: ButtonTone;
};

export type DecideInput = {
  id: string;
  version: number;
  idempotencyKey: string;
  decision: { kind: string; amount?: string; note?: string };
};

/**
 * The decision bar of a review screen (DRD 6.9a): choose an outcome, add the amount or
 * note it needs, then confirm in a dialog that says what happens next (DRD 7.4). The
 * server decides; the tax split shown here comes from the same money.ts it uses.
 */
export function DecisionPanel({
  id,
  version,
  type,
  rate,
  maxCents,
  options,
  action,
}: {
  id: string;
  version: number;
  type: ExpenseType;
  rate: string;
  maxCents: number;
  options: DecisionOption[];
  action: (input: DecideInput) => Promise<ActionState | undefined>;
}) {
  const ids = useId();
  const [kind, setKind] = useState(options[0].kind);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const [state, setState] = useState<ActionState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const option = options.find((o) => o.kind === kind)!;
  const cents = parseCAD(amount);
  const split =
    option.amount && cents !== null && cents > 0 ? approvedFiguresFor(type, cents, rate) : null;
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  const send = () =>
    startTransition(async () => {
      const result = await action({
        id,
        version,
        idempotencyKey: key,
        decision: {
          kind,
          ...(option.amount ? { amount } : {}),
          ...(option.note ? { note } : {}),
        },
      });
      // Success redirects; only a problem comes back here.
      if (result) setState(result);
    });

  return (
    <section aria-labelledby={`${ids}-heading`} className="space-y-4">
      <h2 id={`${ids}-heading`} className="text-base font-semibold">
        {r.decisionHeading}
      </h2>
      <fieldset className="space-y-2">
        <legend className="sr-only">{r.decisionHeading}</legend>
        {options.map((o) => (
          <label
            key={o.kind}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-border-strong px-3 py-2 text-sm has-checked:border-accent has-checked:ring-1 has-checked:ring-accent"
          >
            <input
              type="radio"
              name={`${ids}-kind`}
              value={o.kind}
              checked={kind === o.kind}
              onChange={() => {
                setKind(o.kind);
                setState({ status: "idle" });
              }}
              className="size-6 shrink-0 accent-accent"
            />
            {o.label}
          </label>
        ))}
      </fieldset>

      {option.amount && (
        <div className="space-y-1.5">
          <label htmlFor={`${ids}-amount`} className="block text-sm font-medium">
            {r.amount}
          </label>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-fg-muted"
            >
              $
            </span>
            <input
              id={`${ids}-amount`}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={errors["decision.amount"] ? true : undefined}
              aria-describedby={`${ids}-amount-hint`}
              className={cn(inputClass, "tabular pl-6 text-right")}
            />
          </div>
          <p id={`${ids}-amount-hint`} className="text-xs text-fg-muted">
            {r.amountHint(formatCAD(maxCents))}
            {split && type === "purchase_request" && (
              <span className="tabular block">
                {r.split(formatCAD(split.subtotal), formatCAD(split.tax))}
              </span>
            )}
          </p>
          {errors["decision.amount"] && (
            <p className="text-sm text-danger">{errors["decision.amount"]}</p>
          )}
        </div>
      )}

      {option.note && (
        <div className="space-y-1.5">
          <label htmlFor={`${ids}-note`} className="block text-sm font-medium">
            {option.note.label}
          </label>
          <textarea
            id={`${ids}-note`}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            aria-invalid={errors["decision.note"] ? true : undefined}
            className={textareaClass}
          />
          {errors["decision.note"] && (
            <p className="text-sm text-danger">{errors["decision.note"]}</p>
          )}
        </div>
      )}

      <AlertDialog.Root>
        <AlertDialog.Trigger
          className={buttonClass(option.tone, "w-full")}
          disabled={pending}
          aria-busy={pending || undefined}
        >
          {pending && (
            <Loader2
              className="size-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
          {option.label}
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-(--z-overlay) bg-black/40" />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 z-(--z-overlay) w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-card border border-border bg-surface p-6 text-fg shadow-overlay">
            <AlertDialog.Title className="text-lg font-semibold">
              {option.confirmTitle}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-fg-muted">
              {option.confirmBody}
              {split && (
                <span className="tabular mt-2 block font-medium text-fg">
                  {formatCAD(split.total)}
                </span>
              )}
            </AlertDialog.Description>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <AlertDialog.Cancel className={buttonClass("secondary")}>
                {adminCopy.common.cancel}
              </AlertDialog.Cancel>
              <AlertDialog.Action className={buttonClass(option.tone)} onClick={send}>
                {r.confirm}
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <FormMessage state={state} />
    </section>
  );
}
