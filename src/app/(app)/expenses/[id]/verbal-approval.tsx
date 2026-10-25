"use client";

import { useId, useState, useTransition } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Loader2 } from "lucide-react";
import { FormMessage } from "@/components/ui/action-form";
import { buttonClass, inputClass, textareaClass } from "@/components/ui/styles";
import { adminCopy } from "@/copy/admin";
import { expensesCopy } from "@/copy/expenses";
import { approvedFiguresFor, VERBAL_LIMITS } from "@/domain/expenses/decision";
import type { ExpenseType } from "@/domain/expenses/status";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { formatCAD, parseCAD } from "@/lib/money";
import { recordVerbalApprovalAction } from "./verbal-actions";

const t = expensesCopy.verbal;
const r = expensesCopy.review;

export type VerbalChoice = {
  level: "accountant" | "board";
  userId: string;
  name: string;
  role: string;
};

/**
 * "Record a verbal approval" (decided by the church 2026-10-24), for the Church
 * Administrator: whose approval, what they approved, when and how they said so, and a
 * confirmation that they did. The server checks all of it again.
 */
export function VerbalApproval({
  id,
  version,
  type,
  rate,
  maxCents,
  choices,
}: {
  id: string;
  version: number;
  type: ExpenseType;
  rate: string;
  maxCents: number;
  choices: VerbalChoice[];
}) {
  const ids = useId();
  const [choice, setChoice] = useState(0);
  const [kind, setKind] = useState<"approve" | "approve_smaller">("approve");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [how, setHow] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const [state, setState] = useState<ActionState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  if (choices.length === 0) {
    return (
      <section aria-labelledby={`${ids}-heading`} className="space-y-2">
        <h2 id={`${ids}-heading`} className="text-base font-semibold">
          {t.heading}
        </h2>
        <p className="text-sm text-fg-muted">{t.none}</p>
      </section>
    );
  }

  const who = choices[choice];
  const cents = parseCAD(amount);
  const split =
    kind === "approve_smaller" && cents !== null && cents > 0
      ? approvedFiguresFor(type, cents, rate)
      : null;
  const reset = () => setState({ status: "idle" });

  const send = () =>
    startTransition(async () => {
      const result = await recordVerbalApprovalAction({
        id,
        version,
        idempotencyKey: key,
        approval: {
          level: who.level,
          approverUserId: who.userId,
          kind,
          ...(kind === "approve_smaller" ? { amount } : {}),
          note,
          how,
          confirmed,
        },
      });
      // Success redirects; only a problem comes back here.
      if (result) setState(result);
    });

  const fieldError = (name: string) =>
    errors[name] ? (
      <p id={`${ids}-${name}-error`} className="text-sm text-danger">
        {errors[name]}
      </p>
    ) : null;

  return (
    <section aria-labelledby={`${ids}-heading`} className="space-y-4">
      <div className="space-y-1">
        <h2 id={`${ids}-heading`} className="text-base font-semibold">
          {t.heading}
        </h2>
        <p className="text-sm text-fg-muted">{t.intro}</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t.whose}</legend>
        {choices.map((c, i) => (
          <label
            key={`${c.level}-${c.userId}`}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-border-strong px-3 py-2 text-sm has-checked:border-accent has-checked:ring-1 has-checked:ring-accent"
          >
            <input
              type="radio"
              name={`${ids}-who`}
              checked={choice === i}
              onChange={() => {
                setChoice(i);
                setConfirmed(false);
                reset();
              }}
              className="size-6 shrink-0 accent-accent"
            />
            {t.option(c.name, c.role, t.levels[c.level])}
          </label>
        ))}
        {fieldError("approverUserId")}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t.what}</legend>
        {(["approve", "approve_smaller"] as const).map((k) => (
          <label
            key={k}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-border-strong px-3 py-2 text-sm has-checked:border-accent has-checked:ring-1 has-checked:ring-accent"
          >
            <input
              type="radio"
              name={`${ids}-kind`}
              checked={kind === k}
              onChange={() => {
                setKind(k);
                reset();
              }}
              className="size-6 shrink-0 accent-accent"
            />
            {k === "approve" ? t.approve : t.approveSmaller}
          </label>
        ))}
      </fieldset>

      {kind === "approve_smaller" && (
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
              aria-invalid={errors.amount ? true : undefined}
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
          {fieldError("amount")}
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor={`${ids}-note`} className="block text-sm font-medium">
          {kind === "approve_smaller" ? t.reason : t.note}
        </label>
        <textarea
          id={`${ids}-note`}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          aria-invalid={errors.note ? true : undefined}
          className={textareaClass}
        />
        {fieldError("note")}
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${ids}-how`} className="block text-sm font-medium">
          {t.how}
        </label>
        <input
          id={`${ids}-how`}
          value={how}
          onChange={(e) => setHow(e.target.value)}
          maxLength={VERBAL_LIMITS.how}
          required
          aria-invalid={errors.how ? true : undefined}
          aria-describedby={`${ids}-how-hint`}
          className={inputClass}
        />
        <p id={`${ids}-how-hint`} className="text-xs text-fg-muted">
          {t.howHint}
        </p>
        {fieldError("how")}
      </div>

      <div className="space-y-1.5">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            aria-invalid={errors.confirmed ? true : undefined}
            className="mt-0.5 size-6 shrink-0 accent-accent"
          />
          {t.confirm(who.name)}
        </label>
        {fieldError("confirmed")}
      </div>

      <AlertDialog.Root>
        <AlertDialog.Trigger
          className={buttonClass("primary", "w-full")}
          disabled={pending}
          aria-busy={pending || undefined}
        >
          {pending && (
            <Loader2
              className="size-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
          {t.submit}
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-(--z-overlay) bg-black/40" />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 z-(--z-overlay) w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-card border border-border bg-surface p-6 text-fg shadow-overlay">
            <AlertDialog.Title className="text-lg font-semibold">
              {t.confirmTitle(who.name)}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-fg-muted">
              {t.confirmBody(who.name)}
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
              <AlertDialog.Action className={buttonClass("primary")} onClick={send}>
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
