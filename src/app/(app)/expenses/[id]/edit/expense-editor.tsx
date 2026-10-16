"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useFieldArray, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { FinancialSummary } from "@/components/financial-summary";
import { FormMessage } from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { buttonClass, cardClass, inputClass, textareaClass } from "@/components/ui/styles";
import { adminCopy } from "@/copy/admin";
import { expensesCopy } from "@/copy/expenses";
import type { BudgetFigures } from "@/domain/expenses/budget";
import {
  expenseContentSchema,
  formatErrors,
  isLateClaim,
  itemTotalOf,
  liveTotals,
  LIMITS,
  submissionErrors,
  HOW_BOUGHT,
  PAYEE_KINDS,
  PAYMENT_PREFERENCES,
} from "@/domain/expenses/schema";
import type { ExpenseType } from "@/domain/expenses/status";
import type { LinkableRequest, AnnualLineOption } from "@/domain/expenses/queries";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { formatCAD, parseCAD, sumCents, taxRateToPercent } from "@/lib/money";
import {
  deleteExpenseDraftAction,
  editExpenseAction,
  saveExpenseDraftAction,
  submitExpenseAction,
} from "../../actions";
import { BudgetStrip, OverBudgetWarning } from "../../budget-strip";

const f = expensesCopy.form;
const p = expensesCopy.preview;

export type ExpenseEditorMode = "draft" | "edit" | "respond";

export type ItemValues = {
  name: string;
  quantity: string;
  unitPrice: string;
  link: string;
  annualLineItemId: string;
};
export type LineValues = {
  date: string;
  vendor: string;
  description: string;
  amount: string;
  receiptNumber: string;
};
export type ExpenseFormValues = {
  title: string;
  justification: string;
  items: ItemValues[];
  howBought: string;
  lines: LineValues[];
  linkedPurchaseRequestId: string;
  payeeKind: string;
  payeeName: string;
  payeeEmail: string;
  paymentPreference: string;
  noReceipt: boolean;
  noReceiptReason: string;
  overBudgetExplanation: string;
  lateExplanation: string;
};

export type ExpenseEditorInfo = {
  id: string;
  version: number;
  type: ExpenseType;
  department: string;
  cycleName: string;
  requesterName: string;
  rate: string;
  figures: BudgetFigures;
  linkable: LinkableRequest[];
  annualLines: AnnualLineOption[];
  today: string;
  claimDeadlineDays: number;
  receiptCount: number;
  /** The accountant's question, while responding (FR-44). */
  question: string | null;
};

const BLANK_ITEM: ItemValues = {
  name: "",
  quantity: "",
  unitPrice: "",
  link: "",
  annualLineItemId: "",
};
const BLANK_LINE: LineValues = {
  date: "",
  vendor: "",
  description: "",
  amount: "",
  receiptNumber: "",
};

/**
 * The purchase request and expense claim form (DRD 6.9a, 6B.3): the budget strip, the
 * details, items or receipt lines, how it's bought or who's paid, then a preview and a
 * confirmation. The server recalculates every total and checks every rule again.
 */
export function ExpenseEditor({
  mode,
  info,
  initial,
  receipts,
}: {
  mode: ExpenseEditorMode;
  info: ExpenseEditorInfo;
  initial: ExpenseFormValues;
  /** The receipts section (claims), rendered by the page. */
  receipts?: React.ReactNode;
}) {
  const claim = info.type === "expense_claim";
  const form = useForm<ExpenseFormValues>({
    defaultValues: {
      ...initial,
      items: claim || initial.items.length > 0 ? initial.items : [BLANK_ITEM],
      lines: !claim || initial.lines.length > 0 ? initial.lines : [BLANK_LINE],
    },
  });
  const { control, getValues, setError, clearErrors } = form;
  const values = useWatch({ control }) as ExpenseFormValues;
  const [step, setStep] = useState<"form" | "preview">("form");
  const [version, setVersion] = useState(info.version);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [state, setState] = useState<ActionState>({ status: "idle" });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const totals = useMemo(
    () => liveTotals(info.type, { items: values.items, lines: values.lines }, info.rate),
    [values, info.type, info.rate],
  );
  const linked = info.linkable.find((l) => l.id === values.linkedPurchaseRequestId);
  const releases = claim && linked ? linked.committedCents : 0;
  const after = sumCents([info.figures.remaining, releases, -totals.total]);
  const overBy = after < 0 ? -after : 0;
  const late = claim && isLateClaim(values.lines ?? [], info.today, info.claimDeadlineDays);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [step]);

  const applyErrors = (errors: Record<string, string>) => {
    for (const [key, message] of Object.entries(errors)) {
      setError(key as never, { type: "server", message });
    }
    setProblem(f.fixErrors);
    setStep("form");
  };

  /** Rows with nothing typed are dropped, as the server does, so error numbers line up. */
  const dropBlankRows = () => {
    const current = getValues();
    const items = current.items.filter((i) => Object.values(i).some((v) => v.trim() !== ""));
    const lines = current.lines.filter((l) => Object.values(l).some((v) => v.trim() !== ""));
    if (items.length !== current.items.length) form.setValue("items", items);
    if (lines.length !== current.lines.length) form.setValue("lines", lines);
  };

  async function saveDraft(): Promise<boolean> {
    setSaving("saving");
    setState({ status: "idle" });
    clearErrors();
    const result = await saveExpenseDraftAction({ id: info.id, version, ...getValues() });
    if (result.status === "success") {
      setVersion(result.data.version);
      setSaving("saved");
      return true;
    }
    setSaving("idle");
    if (result.fieldErrors) applyErrors(result.fieldErrors);
    setState(result);
    return false;
  }

  async function goToPreview() {
    setProblem(null);
    setState({ status: "idle" });
    clearErrors();
    dropBlankRows();
    const input = getValues();
    let errors = formatErrors(input);
    if (Object.keys(errors).length === 0) {
      const content = expenseContentSchema.parse(input);
      errors = submissionErrors(info.type, content, {
        today: info.today,
        claimDeadlineDays: info.claimDeadlineDays,
        receiptCount: info.receiptCount,
        overBy,
      });
    }
    if (Object.keys(errors).length > 0) {
      applyErrors(errors);
      return;
    }
    if (mode === "draft" && !(await saveDraft())) return;
    setStep("preview");
  }

  const typeName = expensesCopy.types[info.type];
  const title = mode === "draft" ? f.titleNew(typeName) : f.titleEdit(typeName);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-[32px] leading-tight font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-fg-muted">
          {info.department} · {info.cycleName}
        </p>
      </header>

      {mode === "respond" && info.question && (
        <div className="flex items-start gap-2 rounded-control border border-warning p-3 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="whitespace-pre-line">
            <span className="font-medium">{expensesCopy.status.returned.label}: </span>
            {info.question}
          </p>
        </div>
      )}

      <BudgetStrip
        department={info.department}
        figures={info.figures}
        after={totals.total > 0 ? after : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className={cn(cardClass, "min-w-0 space-y-6")}>
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
            {step === "form" ? f.details : p.heading}
          </h2>
          {problem && step === "form" && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-control border border-danger p-3 text-sm text-danger"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {problem}
            </div>
          )}

          {step === "form" ? (
            <form noValidate onSubmit={(e) => e.preventDefault()} className="space-y-8">
              <DetailsFields form={form} values={values} />
              {claim ? (
                <>
                  <LinesFields form={form} />
                  <LinkedField form={form} linkable={info.linkable} />
                  <PayeeFields form={form} values={values} />
                  {receipts}
                  <NoReceiptFields form={form} values={values} />
                </>
              ) : (
                <>
                  <ItemsFields form={form} values={values} info={info} />
                  <HowBoughtField form={form} />
                </>
              )}
              {late && (
                <Explanation
                  form={form}
                  name="lateExplanation"
                  label={f.lateExplanation}
                  warning={f.lateWarning(info.claimDeadlineDays)}
                />
              )}
              {overBy > 0 && (
                <div className="space-y-3">
                  <OverBudgetWarning department={info.department} overBy={overBy} />
                  <Explanation
                    form={form}
                    name="overBudgetExplanation"
                    label={f.overBudgetExplanation}
                  />
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                {mode === "draft" ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void saveDraft()}
                      disabled={saving === "saving"}
                      aria-busy={saving === "saving" || undefined}
                      className={buttonClass("secondary")}
                    >
                      {saving === "saving" && (
                        <Loader2
                          className="size-4 animate-spin motion-reduce:animate-none"
                          aria-hidden="true"
                        />
                      )}
                      {f.saveDraft}
                    </button>
                    <p role="status" className="flex items-center gap-1.5 text-sm text-fg-muted">
                      {saving === "saved" && (
                        <>
                          <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                          {f.saved}
                        </>
                      )}
                    </p>
                  </div>
                ) : (
                  <Link href={`/expenses/${info.id}`} className={buttonClass("ghost")}>
                    {f.cancelEdit}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => void goToPreview()}
                  className={buttonClass("primary")}
                >
                  {f.toPreview}
                </button>
              </div>
              <FormMessage state={state} />
            </form>
          ) : (
            <Preview
              mode={mode}
              info={info}
              values={values}
              totals={totals}
              version={version}
              overBy={overBy}
              linked={linked ?? null}
              onEdit={() => setStep("form")}
              onErrors={applyErrors}
            />
          )}
        </div>

        <aside aria-label={f.summary} className={cn(cardClass, "space-y-4 lg:sticky lg:top-20")}>
          {claim ? (
            <dl className="text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="font-semibold">{f.totalPaid}</dt>
                <dd className="tabular text-xl font-semibold">{formatCAD(totals.total)}</dd>
              </div>
            </dl>
          ) : (
            <FinancialSummary totals={totals} rate={info.rate} />
          )}
        </aside>
      </div>

      {mode === "draft" && step === "form" && <DeleteDraft id={info.id} version={version} />}
    </div>
  );
}

// ---------------------------------------------------------------- fields

type FormProps = { form: UseFormReturn<ExpenseFormValues> };

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="text-sm text-danger">
      {message}
    </p>
  ) : null;
}

function describedBy(...ids: (string | false | undefined)[]) {
  return ids.filter(Boolean).join(" ") || undefined;
}

function DetailsFields({ form, values }: FormProps & { values: ExpenseFormValues }) {
  const ids = useId();
  const errors = form.formState.errors;
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor={`${ids}-title`} className="block text-sm font-medium">
          {f.title}
        </label>
        <input
          id={`${ids}-title`}
          {...form.register("title")}
          maxLength={LIMITS.title}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={describedBy(`${ids}-title-hint`, errors.title && `${ids}-title-error`)}
          className={inputClass}
        />
        <p id={`${ids}-title-hint`} className="text-xs text-fg-muted">
          {f.titleHint}
        </p>
        <FieldError id={`${ids}-title-error`} message={errors.title?.message} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${ids}-just`} className="block text-sm font-medium">
          {f.justification}
        </label>
        <textarea
          id={`${ids}-just`}
          {...form.register("justification")}
          rows={4}
          maxLength={LIMITS.justification}
          aria-invalid={errors.justification ? true : undefined}
          aria-describedby={describedBy(
            `${ids}-just-hint`,
            errors.justification && `${ids}-just-error`,
          )}
          className={textareaClass}
        />
        <div className="flex flex-wrap justify-between gap-2 text-xs text-fg-muted">
          <p id={`${ids}-just-hint`}>{f.justificationHint}</p>
          <p className="tabular">
            {f.characters(values.justification?.length ?? 0, LIMITS.justification)}
          </p>
        </div>
        <FieldError id={`${ids}-just-error`} message={errors.justification?.message} />
      </div>
    </div>
  );
}

/** One labelled input inside a row; errors come from the form state. */
function RowInput({
  form,
  name,
  label,
  type = "text",
  inputMode,
  prefix,
  className,
  optional,
}: FormProps & {
  name: `items.${number}.${keyof ItemValues}` | `lines.${number}.${keyof LineValues}`;
  label: string;
  type?: string;
  inputMode?: "decimal" | "numeric" | "url";
  prefix?: string;
  className?: string;
  optional?: boolean;
}) {
  const id = useId();
  const [group, index, field] = name.split(".");
  const rowErrors = (form.formState.errors as Record<string, unknown>)[group] as
    Record<string, Record<string, { message?: string }>> | undefined;
  const error = rowErrors?.[index]?.[field]?.message;
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <label htmlFor={id} className="block text-xs font-medium text-fg-muted">
        {label}
        {optional && ` ${f.optional}`}
      </label>
      <div className="relative">
        {prefix && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-fg-muted"
          >
            {prefix}
          </span>
        )}
        <input
          id={id}
          type={type}
          inputMode={inputMode}
          autoComplete="off"
          {...form.register(name)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(
            inputClass,
            prefix && "pl-6",
            inputMode === "decimal" && "tabular text-right",
          )}
        />
      </div>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function ItemsFields({
  form,
  values,
  info,
}: FormProps & { values: ExpenseFormValues; info: ExpenseEditorInfo }) {
  const items = useFieldArray({ control: form.control, name: "items" });
  const listError =
    form.formState.errors.items?.message ?? form.formState.errors.items?.root?.message;
  return (
    <section className="space-y-3" aria-labelledby="items-heading">
      <div>
        <h3 id="items-heading" className="text-base font-semibold">
          {f.items}
        </h3>
        <p className="text-sm text-fg-muted">{f.itemsIntro(`${taxRateToPercent(info.rate)}%`)}</p>
      </div>
      {listError && (
        <p role="alert" className="text-sm text-danger">
          {listError}
        </p>
      )}
      <ol className="space-y-3">
        {items.fields.map((field, i) => {
          const v = values.items?.[i] ?? BLANK_ITEM;
          const total = itemTotalOf(v.quantity ?? "", v.unitPrice ?? "");
          return (
            <li key={field.id} className="rounded-control border border-border p-3">
              <fieldset className="min-w-0 space-y-3">
                <legend className="sr-only">{f.item(i + 1)}</legend>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_5rem_9rem]">
                  <RowInput form={form} name={`items.${i}.name`} label={f.itemName} />
                  <RowInput
                    form={form}
                    name={`items.${i}.quantity`}
                    label={f.quantity}
                    inputMode="numeric"
                  />
                  <RowInput
                    form={form}
                    name={`items.${i}.unitPrice`}
                    label={f.unitPrice}
                    inputMode="decimal"
                    prefix="$"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <RowInput
                    form={form}
                    name={`items.${i}.link`}
                    label={f.link}
                    type="url"
                    inputMode="url"
                    optional
                  />
                  {info.annualLines.length > 0 && (
                    <AnnualLineSelect form={form} index={i} options={info.annualLines} />
                  )}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm">
                    <span className="text-fg-muted">{f.lineTotal}: </span>
                    <span className="tabular font-semibold">
                      {total === null ? "—" : formatCAD(total)}
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => items.remove(i)}
                    className={buttonClass("ghost", "px-2 text-danger")}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    <span className="sr-only">{f.removeItem(i + 1)}</span>
                  </button>
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={() =>
          items.append(BLANK_ITEM, {
            shouldFocus: true,
            focusName: `items.${items.fields.length}.name`,
          })
        }
        className={buttonClass("ghost", "text-accent")}
      >
        <Plus className="size-4" aria-hidden="true" />
        {f.addItem}
      </button>
    </section>
  );
}

function AnnualLineSelect({
  form,
  index,
  options,
}: FormProps & { index: number; options: AnnualLineOption[] }) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-fg-muted">
        {f.annualLine} {f.optional}
      </label>
      <select id={id} {...form.register(`items.${index}.annualLineItemId`)} className={inputClass}>
        <option value="">{f.annualLineNone}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function RadioCards({
  form,
  name,
  legend,
  options,
}: FormProps & {
  name: "howBought" | "payeeKind" | "paymentPreference";
  legend: string;
  options: readonly { value: string; label: string }[];
}) {
  const ids = useId();
  const error = form.formState.errors[name]?.message;
  return (
    <fieldset className="space-y-2" aria-describedby={error ? `${ids}-error` : undefined}>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-border-strong px-3 py-2 text-sm has-checked:border-accent has-checked:ring-1 has-checked:ring-accent"
          >
            <input
              type="radio"
              value={o.value}
              {...form.register(name)}
              className="size-4 shrink-0 accent-accent"
            />
            {o.label}
          </label>
        ))}
      </div>
      <FieldError id={`${ids}-error`} message={error} />
    </fieldset>
  );
}

function HowBoughtField({ form }: FormProps) {
  return (
    <RadioCards
      form={form}
      name="howBought"
      legend={f.howBought}
      options={HOW_BOUGHT.map((v) => ({ value: v, label: expensesCopy.howBought[v] }))}
    />
  );
}

function LinesFields({ form }: FormProps) {
  const lines = useFieldArray({ control: form.control, name: "lines" });
  const listError =
    form.formState.errors.lines?.message ?? form.formState.errors.lines?.root?.message;
  return (
    <section className="space-y-3" aria-labelledby="lines-heading">
      <div>
        <h3 id="lines-heading" className="text-base font-semibold">
          {f.lines}
        </h3>
        <p className="text-sm text-fg-muted">{f.linesIntro}</p>
      </div>
      {listError && (
        <p role="alert" className="text-sm text-danger">
          {listError}
        </p>
      )}
      <ol className="space-y-3">
        {lines.fields.map((field, i) => (
          <li key={field.id} className="rounded-control border border-border p-3">
            <fieldset className="min-w-0 space-y-3">
              <legend className="sr-only">{f.line(i + 1)}</legend>
              <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_9rem]">
                <RowInput form={form} name={`lines.${i}.date`} label={f.date} type="date" />
                <RowInput form={form} name={`lines.${i}.vendor`} label={f.vendor} />
                <RowInput
                  form={form}
                  name={`lines.${i}.amount`}
                  label={f.amount}
                  inputMode="decimal"
                  prefix="$"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
                <RowInput form={form} name={`lines.${i}.description`} label={f.description} />
                <RowInput
                  form={form}
                  name={`lines.${i}.receiptNumber`}
                  label={f.receiptNumber}
                  optional
                />
                <button
                  type="button"
                  onClick={() => lines.remove(i)}
                  className={buttonClass("ghost", "px-2 text-danger")}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  <span className="sr-only">{f.removeLine(i + 1)}</span>
                </button>
              </div>
            </fieldset>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() =>
          lines.append(BLANK_LINE, {
            shouldFocus: true,
            focusName: `lines.${lines.fields.length}.date`,
          })
        }
        className={buttonClass("ghost", "text-accent")}
      >
        <Plus className="size-4" aria-hidden="true" />
        {f.addLine}
      </button>
    </section>
  );
}

function LinkedField({ form, linkable }: FormProps & { linkable: LinkableRequest[] }) {
  const id = useId();
  const error = form.formState.errors.linkedPurchaseRequestId?.message;
  if (linkable.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {f.linked} {f.optional}
      </label>
      <select
        id={id}
        {...form.register("linkedPurchaseRequestId")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(`${id}-hint`, error && `${id}-error`)}
        className={inputClass}
      >
        <option value="">{f.linkedNone}</option>
        {linkable.map((l) => (
          <option key={l.id} value={l.id}>
            {f.linkedOption(l.reference, l.title, formatCAD(l.committedCents))}
          </option>
        ))}
      </select>
      <p id={`${id}-hint`} className="text-xs text-fg-muted">
        {f.linkedHint}
      </p>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function TextInput({
  form,
  name,
  label,
  type = "text",
  hint,
}: FormProps & {
  name: "payeeName" | "payeeEmail";
  label: string;
  type?: string;
  hint?: string;
}) {
  const id = useId();
  const error = form.formState.errors[name]?.message;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type={type}
        {...form.register(name)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint && `${id}-hint`, error && `${id}-error`)}
        className={inputClass}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-fg-muted">
          {hint}
        </p>
      )}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function PayeeFields({ form, values }: FormProps & { values: ExpenseFormValues }) {
  const owed = values.payeeKind === "self" || values.payeeKind === "other";
  return (
    <section className="space-y-4">
      <RadioCards
        form={form}
        name="payeeKind"
        legend={f.payee}
        options={PAYEE_KINDS.map((v) => ({ value: v, label: expensesCopy.payee[v] }))}
      />
      {values.payeeKind === "other" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput form={form} name="payeeName" label={f.payeeName} />
          <TextInput
            form={form}
            name="payeeEmail"
            label={f.payeeEmail}
            type="email"
            hint={f.payeeEmailHint}
          />
        </div>
      )}
      {owed && (
        <>
          <RadioCards
            form={form}
            name="paymentPreference"
            legend={f.paymentPreference}
            options={PAYMENT_PREFERENCES.map((v) => ({
              value: v,
              label: expensesCopy.paymentPreference[v],
            }))}
          />
          {values.payeeKind === "self" && values.paymentPreference === "e_transfer" && (
            <TextInput form={form} name="payeeEmail" label={f.eTransferEmail} type="email" />
          )}
          <p className="text-xs text-fg-muted">{f.noBankDetails}</p>
        </>
      )}
    </section>
  );
}

function NoReceiptFields({ form, values }: FormProps & { values: ExpenseFormValues }) {
  const id = useId();
  const receiptsError = (form.formState.errors as Record<string, { message?: string }>).receipts
    ?.message;
  return (
    <div className="space-y-3">
      {receiptsError && (
        <p role="alert" className="text-sm text-danger">
          {receiptsError}
        </p>
      )}
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          {...form.register("noReceipt")}
          className="mt-0.5 size-5 shrink-0 accent-accent"
        />
        <label htmlFor={id} className="text-sm">
          {expensesCopy.receipts.noReceipt}
        </label>
      </div>
      {values.noReceipt && (
        <Explanation
          form={form}
          name="noReceiptReason"
          label={expensesCopy.receipts.noReceiptReason}
        />
      )}
    </div>
  );
}

function Explanation({
  form,
  name,
  label,
  warning,
}: FormProps & {
  name: "overBudgetExplanation" | "lateExplanation" | "noReceiptReason";
  label: string;
  warning?: string;
}) {
  const id = useId();
  const error = form.formState.errors[name]?.message;
  return (
    <div className="space-y-1.5">
      {warning && (
        <p className="flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          {warning}
        </p>
      )}
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        maxLength={LIMITS.explanation}
        {...form.register(name)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={textareaClass}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function DeleteDraft({ id, version }: { id: string; version: number }) {
  const formId = useId();
  const [state, setState] = useState<ActionState>({ status: "idle" });
  const [, startTransition] = useTransition();
  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(async () => setState(await deleteExpenseDraftAction(state, data)));
      }}
      className="space-y-3"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <ConfirmDialog
        formId={formId}
        trigger={f.deleteDraft}
        triggerTone="danger"
        title={f.deleteTitle}
        body={f.deleteBody}
        confirmLabel={f.deleteConfirm}
        confirmTone="danger"
      />
      <FormMessage state={state} />
    </form>
  );
}

// ---------------------------------------------------------------- preview

function Preview({
  mode,
  info,
  values,
  totals,
  version,
  overBy,
  linked,
  onEdit,
  onErrors,
}: {
  mode: ExpenseEditorMode;
  info: ExpenseEditorInfo;
  values: ExpenseFormValues;
  totals: { subtotal: number; tax: number; total: number };
  version: number;
  overBy: number;
  linked: LinkableRequest | null;
  onEdit: () => void;
  onErrors: (errors: Record<string, string>) => void;
}) {
  // One key per preview: a double click or a retry sends the same key (FR-10).
  const [key] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState>({ status: "idle" });
  const claim = info.type === "expense_claim";
  const v = expensesCopy.view;

  const send = () =>
    startTransition(async () => {
      const result =
        mode === "draft"
          ? await submitExpenseAction({ id: info.id, version, idempotencyKey: key })
          : await editExpenseAction({ id: info.id, version, idempotencyKey: key, ...values });
      // Success redirects to the expense; only a problem comes back here.
      if (!result || result.status !== "error") return;
      if (result.fieldErrors) onErrors(result.fieldErrors);
      else setState(result);
    });

  const confirm =
    mode === "draft"
      ? {
          trigger: p.submit,
          title: p.submitTitle(formatCAD(totals.total)),
          body: p.submitBody,
          label: p.submitConfirm,
        }
      : mode === "edit"
        ? { trigger: p.save, title: p.saveTitle, body: p.saveBody, label: p.save }
        : { trigger: p.respond, title: p.respondTitle, body: p.respondBody, label: p.respond };

  const payee =
    values.payeeKind === "self"
      ? info.requesterName
      : values.payeeKind === "other"
        ? values.payeeName
        : expensesCopy.payee.church_card;

  return (
    <div className="space-y-6">
      <p className="text-sm text-fg-muted">{p.intro}</p>
      <article className="space-y-5 rounded-control border border-border p-5">
        <h3 className="text-2xl font-semibold">{values.title}</h3>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <PreviewItem label={v.type}>{expensesCopy.types[info.type]}</PreviewItem>
          <PreviewItem label={v.department}>{info.department}</PreviewItem>
          <PreviewItem label={v.cycle}>{info.cycleName}</PreviewItem>
          <PreviewItem label={p.requester}>{info.requesterName}</PreviewItem>
          {claim ? (
            <>
              <PreviewItem label={v.payee}>{payee}</PreviewItem>
              {values.payeeKind !== "church_card" && values.paymentPreference && (
                <PreviewItem label={v.paymentPreference}>
                  {
                    expensesCopy.paymentPreference[
                      values.paymentPreference as "cheque" | "e_transfer"
                    ]
                  }
                  {values.payeeEmail && ` (${values.payeeEmail})`}
                </PreviewItem>
              )}
              {linked && <PreviewItem label={v.linked}>{linked.reference}</PreviewItem>}
            </>
          ) : (
            values.howBought && (
              <PreviewItem label={v.howBought}>
                {expensesCopy.howBought[values.howBought as keyof typeof expensesCopy.howBought]}
              </PreviewItem>
            )
          )}
        </dl>
        <section className="space-y-1">
          <h4 className="text-sm font-semibold">{f.justification}</h4>
          <p className="text-sm whitespace-pre-line">{values.justification}</p>
        </section>
        <PreviewRows type={info.type} values={values} />
        {claim ? (
          <p className="flex justify-between text-sm sm:ml-auto sm:max-w-sm">
            <span className="font-semibold">{f.totalPaid}</span>
            <span className="tabular text-xl font-semibold">{formatCAD(totals.total)}</span>
          </p>
        ) : (
          <FinancialSummary totals={totals} rate={info.rate} className="sm:ml-auto sm:max-w-sm" />
        )}
        {overBy > 0 && (
          <OverBudgetWarning
            department={info.department}
            overBy={overBy}
            explanation={values.overBudgetExplanation}
            explanationLabel={v.overBudget}
          />
        )}
      </article>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={onEdit} className={buttonClass("secondary")}>
          {p.edit}
        </button>
        <AlertDialog.Root>
          <AlertDialog.Trigger
            className={buttonClass("primary")}
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {pending && (
              <Loader2
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {pending ? p.submitting : confirm.trigger}
          </AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 z-(--z-overlay) bg-black/40" />
            <AlertDialog.Content className="fixed top-1/2 left-1/2 z-(--z-overlay) w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-card border border-border bg-surface p-6 text-fg shadow-overlay">
              <AlertDialog.Title className="text-lg font-semibold">
                {confirm.title}
              </AlertDialog.Title>
              <AlertDialog.Description className="text-sm text-fg-muted">
                {confirm.body}
              </AlertDialog.Description>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <AlertDialog.Cancel className={buttonClass("secondary")}>
                  {adminCopy.common.cancel}
                </AlertDialog.Cancel>
                <AlertDialog.Action
                  className={buttonClass("primary")}
                  disabled={pending}
                  onClick={send}
                >
                  {confirm.label}
                </AlertDialog.Action>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </div>
      <FormMessage state={state} />
    </div>
  );
}

function PreviewItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/** The items or receipt lines as a document table (DRD 6.5 pattern). */
function PreviewRows({ type, values }: { type: ExpenseType; values: ExpenseFormValues }) {
  const c = expensesCopy.table;
  if (type === "purchase_request") {
    return (
      <div className="-mx-1 overflow-x-auto px-1" tabIndex={0} role="region" aria-label={f.items}>
        <table className="w-full min-w-[30rem] text-left text-sm">
          <caption className="sr-only">{f.items}</caption>
          <thead className="border-b border-border text-xs text-fg-muted">
            <tr>
              <th scope="col" className="py-2 pr-4 font-medium">
                {c.item}
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                {c.qty}
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                {c.price}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {c.total}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(values.items ?? []).map((item, i) => {
              const total = itemTotalOf(item.quantity, item.unitPrice);
              const price = itemTotalOf("1", item.unitPrice);
              return (
                <tr key={i}>
                  <td className="py-2 pr-4 font-medium">{item.name}</td>
                  <td className="tabular py-2 pr-4 text-right">{item.quantity.trim() || "1"}</td>
                  <td className="tabular py-2 pr-4 text-right">
                    {price === null ? "—" : formatCAD(price)}
                  </td>
                  <td className="tabular py-2 text-right">
                    {total === null ? "—" : formatCAD(total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="-mx-1 overflow-x-auto px-1" tabIndex={0} role="region" aria-label={f.lines}>
      <table className="w-full min-w-[30rem] text-left text-sm">
        <caption className="sr-only">{f.lines}</caption>
        <thead className="border-b border-border text-xs text-fg-muted">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">
              {c.date}
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              {c.vendor}
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              {c.description}
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              {c.amount}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {(values.lines ?? []).map((line, i) => {
            const cents = parseCAD(line.amount);
            return (
              <tr key={i}>
                <td className="tabular py-2 pr-4">{line.date}</td>
                <td className="py-2 pr-4">{line.vendor}</td>
                <td className="py-2 pr-4">
                  {line.description}
                  {line.receiptNumber && (
                    <span className="block text-xs text-fg-muted">
                      {c.receiptNumber}: {line.receiptNumber}
                    </span>
                  )}
                </td>
                <td className="tabular py-2 text-right">
                  {cents === null ? "—" : formatCAD(cents)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
