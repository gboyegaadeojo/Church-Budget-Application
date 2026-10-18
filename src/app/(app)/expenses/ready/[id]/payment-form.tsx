"use client";

import { useId, useState, useTransition } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  Banknote,
  Building2,
  CreditCard,
  FileText,
  Loader2,
  MoreHorizontal,
  Send,
  type LucideIcon,
} from "lucide-react";
import { FormMessage } from "@/components/ui/action-form";
import { buttonClass, inputClass, textareaClass } from "@/components/ui/styles";
import { adminCopy } from "@/copy/admin";
import { expensesCopy } from "@/copy/expenses";
import type { PaymentMethod } from "@/domain/expenses/payment";
import type { ExpenseType } from "@/domain/expenses/status";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { formatCAD, parseCAD } from "@/lib/money";
import { recordPaymentAction } from "../actions";

const p = expensesCopy.payment;
const METHODS: { value: PaymentMethod; icon: LucideIcon }[] = [
  { value: "cheque", icon: FileText },
  { value: "church_card", icon: CreditCard },
  { value: "cash", icon: Banknote },
  { value: "e_transfer", icon: Send },
  { value: "supplier_eft", icon: Building2 },
  { value: "other", icon: MoreHorizontal },
];

type Values = Record<string, string>;

/**
 * Record payment (DRD 6.9a): how it was paid as a list with icons, the fields that method
 * needs, the date and the amount (the approved amount by default; a difference needs a
 * note). The confirm button says what will be recorded. The server checks it all again.
 */
export function PaymentForm({
  id,
  version,
  type,
  approvedCents,
  approvedInput,
  today,
  signers,
  payeeEmail,
  defaultMethod,
}: {
  id: string;
  version: number;
  type: ExpenseType;
  approvedCents: number;
  approvedInput: string;
  today: string;
  signers: { id: string; name: string }[];
  payeeEmail: string | null;
  defaultMethod: PaymentMethod;
}) {
  const ids = useId();
  const [method, setMethod] = useState<PaymentMethod>(defaultMethod);
  const [values, setValues] = useState<Values>({ paidOn: today, amount: approvedInput });
  const [receiptSigned, setReceiptSigned] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const [state, setState] = useState<ActionState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const cents = parseCAD(values.amount ?? "");
  const different = cents !== null && cents !== approvedCents;
  const methodName = p.methods[method];
  const label = (type === "expense_claim" ? p.confirm : p.confirmPurchase)(
    formatCAD(cents ?? approvedCents),
    methodName,
  );

  const field = (
    name: string,
    text: string,
    options: { type?: string; inputMode?: "numeric" | "decimal"; hint?: string } = {},
  ) => {
    const error = errors[name];
    return (
      <div className="space-y-1.5">
        <label htmlFor={`${ids}-${name}`} className="block text-sm font-medium">
          {text}
        </label>
        <input
          id={`${ids}-${name}`}
          type={options.type ?? "text"}
          inputMode={options.inputMode}
          value={values[name] ?? ""}
          onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [options.hint && `${ids}-${name}-hint`, error && `${ids}-${name}-error`]
              .filter(Boolean)
              .join(" ") || undefined
          }
          className={inputClass}
        />
        {options.hint && (
          <p id={`${ids}-${name}-hint`} className="text-xs text-fg-muted">
            {options.hint}
          </p>
        )}
        {error && (
          <p id={`${ids}-${name}-error`} className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  };

  const signerSelect = (name: "chequeSigner1Id" | "chequeSigner2Id", text: string) => (
    <div className="space-y-1.5">
      <label htmlFor={`${ids}-${name}`} className="block text-sm font-medium">
        {text}
      </label>
      <select
        id={`${ids}-${name}`}
        value={values[name] ?? ""}
        onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
        aria-invalid={errors[name] ? true : undefined}
        className={inputClass}
      >
        <option value="">{p.chooseSigner}</option>
        {signers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {errors[name] && <p className="text-sm text-danger">{errors[name]}</p>}
    </div>
  );

  const send = () =>
    startTransition(async () => {
      const result = await recordPaymentAction({
        id,
        version,
        idempotencyKey: key,
        payment: {
          ...values,
          paidOn: values.paidOn ?? "",
          amount: values.amount ?? "",
          method,
          receiptSigned,
        },
      });
      if (result) setState(result);
    });

  return (
    <form noValidate onSubmit={(e) => e.preventDefault()} className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{p.howPaid}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {METHODS.map(({ value, icon: Icon }) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-border-strong px-3 py-2 text-sm has-checked:border-accent has-checked:ring-1 has-checked:ring-accent"
            >
              <input
                type="radio"
                name={`${ids}-method`}
                value={value}
                checked={method === value}
                onChange={() => setMethod(value)}
                className="size-6 shrink-0 accent-accent"
              />
              <Icon className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
              {p.methods[value]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        {method === "cheque" && (
          <>
            {signers.length < 2 && (
              <p role="alert" className="text-sm text-danger sm:col-span-2">
                {p.noSigners}
              </p>
            )}
            {field("reference", p.chequeNumber, { inputMode: "numeric" })}
            <span className="hidden sm:block" />
            {signerSelect("chequeSigner1Id", p.signer1)}
            {signerSelect("chequeSigner2Id", p.signer2)}
          </>
        )}
        {method === "church_card" && (
          <>
            {field("cardLast4", p.cardLast4, { inputMode: "numeric" })}
            {field("reference", p.transactionReference)}
            {field("purchasedBy", p.purchasedBy)}
          </>
        )}
        {method === "cash" && (
          <>
            {field("cashReceivedBy", p.cashReceivedBy)}
            <label className="flex min-h-11 items-center gap-3 text-sm sm:self-end">
              <input
                type="checkbox"
                checked={receiptSigned}
                onChange={(e) => setReceiptSigned(e.target.checked)}
                className="size-6 accent-accent"
              />
              {p.receiptSigned}
            </label>
          </>
        )}
        {method === "e_transfer" &&
          field("reference", p.eTransferReference, {
            hint: payeeEmail ? p.recipientEmail(payeeEmail) : undefined,
          })}
        {method === "supplier_eft" && (
          <>
            {field("reference", p.invoiceNumber)}
            {field("purchasedBy", p.supplier)}
          </>
        )}
        {method === "other" && field("methodOther", p.methodOther)}
        {field("paidOn", p.paidOn, { type: "date" })}
        {field("amount", p.amount, {
          inputMode: "decimal",
          hint: p.amountHint(formatCAD(approvedCents)),
        })}
      </div>

      {different && (
        <div className="space-y-1.5">
          <label htmlFor={`${ids}-difference`} className="block text-sm font-medium">
            {p.differenceNote}
          </label>
          <textarea
            id={`${ids}-difference`}
            rows={2}
            value={values.differenceNote ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, differenceNote: e.target.value }))}
            aria-invalid={errors.differenceNote ? true : undefined}
            className={textareaClass}
          />
          {errors.differenceNote && <p className="text-sm text-danger">{errors.differenceNote}</p>}
        </div>
      )}
      <div className="space-y-1.5">
        <label htmlFor={`${ids}-notes`} className="block text-sm font-medium">
          {p.notes} <span className="font-normal text-fg-muted">{adminCopy.common.optional}</span>
        </label>
        <textarea
          id={`${ids}-notes`}
          rows={2}
          value={values.notes ?? ""}
          onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
          className={textareaClass}
        />
      </div>

      <AlertDialog.Root>
        <AlertDialog.Trigger
          className={buttonClass("primary", "w-full sm:w-auto")}
          disabled={pending}
          aria-busy={pending || undefined}
        >
          {pending && (
            <Loader2
              className="size-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
          {label}
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-(--z-overlay) bg-black/40" />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 z-(--z-overlay) w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-card border border-border bg-surface p-6 text-fg shadow-overlay">
            <AlertDialog.Title className="text-lg font-semibold">{label}?</AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-fg-muted">
              {p.confirmBody}
            </AlertDialog.Description>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <AlertDialog.Cancel className={buttonClass("secondary")}>
                {adminCopy.common.cancel}
              </AlertDialog.Cancel>
              <AlertDialog.Action className={buttonClass("primary")} onClick={send}>
                {expensesCopy.review.confirm}
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <div className={cn(state.status === "idle" && "sr-only")}>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
