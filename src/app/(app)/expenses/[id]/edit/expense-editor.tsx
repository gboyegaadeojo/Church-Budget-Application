"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useFieldArray, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Loader2,
  Paperclip,
  PenLine,
  Plus,
  Receipt,
  ShoppingCart,
  Store,
  Trash2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { salesTaxLabel } from "@/components/financial-summary";
import { FormMessage } from "@/components/ui/action-form";
import { TONE, type Tone } from "@/components/ui/tone";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { buttonClass } from "@/components/ui/styles";
import { useClearErrorOnEdit } from "@/components/ui/use-clear-error-on-edit";
import { adminCopy } from "@/copy/admin";
import { copy } from "@/copy/en-CA";
import { expensesCopy } from "@/copy/expenses";
import type { BudgetFigures } from "@/domain/expenses/budget";
import {
  expenseContentSchema,
  formatErrors,
  isLateClaim,
  itemTotalOf,
  liveTotals,
  LIMITS,
  rateFor,
  submissionErrors,
  HOW_BOUGHT,
  PAYEE_KINDS,
} from "@/domain/expenses/schema";
import type { ExpenseType } from "@/domain/expenses/status";
import type { LinkableRequest, AnnualLineOption } from "@/domain/expenses/queries";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { formatCAD, parseCAD, sumCents, taxRateToPercent, type TaxBreakdown } from "@/lib/money";
import {
  deleteExpenseDraftAction,
  editExpenseAction,
  saveExpenseDraftAction,
  submitExpenseAction,
} from "../../actions";
import { OverBudgetWarning } from "../../budget-strip";

const f = expensesCopy.form;
const p = expensesCopy.preview;
const sections = expensesCopy.sections;
const b = expensesCopy.budget;

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
  /** Purchase requests: add sales tax (default) or none for the whole request. */
  addsSalesTax: boolean;
};

export type ExpenseEditorInfo = {
  id: string;
  version: number;
  type: ExpenseType;
  department: string;
  cycleName: string;
  requesterName: string;
  /** The rate added when sales tax is on (the snapshot, or the church's current rate). */
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

// ---------------------------------------------------------------- the look (design H)

/** A soft filled field, large enough to type in comfortably on a phone. */
const FIELD =
  "block min-h-[52px] w-full rounded-[10px] border border-border bg-surface-2 px-4 text-base text-fg placeholder:text-fg-muted aria-[invalid=true]:border-danger";
const FIELD_AREA = cn(FIELD, "min-h-28 py-3");
const LABEL = "block text-sm font-semibold";
const TEXT_LINK =
  "inline-flex min-h-11 items-center gap-1.5 rounded-control px-1 text-[15px] font-semibold text-accent hover:underline";

type StepId = "details" | "items" | "howBought" | "attachments" | "lines" | "payee" | "files";

/** The questions, one per screen (design H, 2026-11-07), then the review. */
const STEPS: Record<ExpenseType, StepId[]> = {
  purchase_request: ["details", "items", "howBought", "attachments"],
  expense_claim: ["details", "lines", "payee", "files"],
};

/** Which form fields each step owns, so an error opens the step that can fix it. */
const STEP_FIELDS: Record<StepId, string[]> = {
  details: ["title", "justification"],
  items: ["items", "addsSalesTax", "overBudgetExplanation"],
  howBought: ["howBought"],
  attachments: [],
  lines: ["lines", "linkedPurchaseRequestId", "lateExplanation", "overBudgetExplanation"],
  payee: ["payeeKind", "payeeName", "payeeEmail", "paymentPreference"],
  files: ["receipts", "noReceipt", "noReceiptReason"],
};

const STEP_LOOK: Record<StepId, { icon: LucideIcon; tone: Tone; title: string; question: string }> =
  {
    details: {
      icon: PenLine,
      tone: "violet",
      title: sections.details.title,
      question: f.questions.detailsPurchase,
    },
    items: {
      icon: ShoppingCart,
      tone: "teal",
      title: sections.items.title,
      question: f.questions.items,
    },
    lines: {
      icon: Receipt,
      tone: "teal",
      title: sections.lines.title,
      question: f.questions.lines,
    },
    howBought: {
      icon: Store,
      tone: "amber",
      title: sections.howBought.title,
      question: f.questions.howBought,
    },
    payee: {
      icon: Wallet,
      tone: "amber",
      title: sections.payee.title,
      question: f.questions.payee,
    },
    attachments: {
      icon: Paperclip,
      tone: "pink",
      title: sections.attachments.title,
      question: f.questions.attachments,
    },
    files: {
      icon: Paperclip,
      tone: "pink",
      title: sections.files.title,
      question: f.questions.files,
    },
  };

const REVIEW_TONE: Tone = "blue";

function belongsTo(key: string, step: StepId): boolean {
  return STEP_FIELDS[step].some((field) => key === field || key.startsWith(`${field}.`));
}

/**
 * The purchase request and expense claim form (6B.3), one question per screen in one
 * narrow column (design H, 2026-11-07): what and why, the items or receipts, how it's
 * bought or who's paid, the files, then Check and send. The server recalculates every
 * total and checks every rule again.
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
  /** The receipts or attachments uploader, rendered by the page. */
  receipts?: React.ReactNode;
}) {
  const claim = info.type === "expense_claim";
  const steps = STEPS[info.type];
  const form = useForm<ExpenseFormValues>({
    defaultValues: {
      ...initial,
      items: claim || initial.items.length > 0 ? initial.items : [BLANK_ITEM],
      lines: !claim || initial.lines.length > 0 ? initial.lines : [BLANK_LINE],
    },
  });
  const { control, getValues, setError, clearErrors } = form;
  const values = useWatch({ control }) as ExpenseFormValues;
  useClearErrorOnEdit(form);
  const [step, setStep] = useState<number | "preview">(0);
  const [version, setVersion] = useState(info.version);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [state, setState] = useState<ActionState>({ status: "idle" });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const totals = useMemo(
    () =>
      liveTotals(
        info.type,
        { items: values.items, lines: values.lines, addsSalesTax: values.addsSalesTax },
        info.rate,
      ),
    [values, info.type, info.rate],
  );
  // The rate the totals show: 0% ("Sales tax (none)") once tax is turned off.
  const rate = rateFor(info.type, values.addsSalesTax !== false, info.rate);
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

  const stepIndexOf = (key: string) => {
    const i = steps.findIndex((s) => belongsTo(key, s));
    return i === -1 ? 0 : i;
  };

  /** Shows the errors and opens the first step that has one. */
  const applyErrors = (errors: Record<string, string>) => {
    for (const [key, message] of Object.entries(errors)) {
      setError(key as never, { type: "server", message });
    }
    setProblem(f.fixErrors);
    setStep(Math.min(...Object.keys(errors).map(stepIndexOf)));
  };

  /** Rows with nothing typed are dropped, as the server does, so error numbers line up. */
  const dropBlankRows = () => {
    const current = getValues();
    const items = current.items.filter((i) => Object.values(i).some((v) => v.trim() !== ""));
    const lines = current.lines.filter((l) => Object.values(l).some((v) => v.trim() !== ""));
    if (items.length !== current.items.length) {
      form.setValue("items", items.length > 0 || claim ? items : [BLANK_ITEM]);
    }
    if (lines.length !== current.lines.length) {
      form.setValue("lines", lines.length > 0 || !claim ? lines : [BLANK_LINE]);
    }
  };

  /** Every problem with the form, as the server would find it. */
  function allErrors(): Record<string, string> {
    const input = getValues();
    const errors = formatErrors(input);
    if (Object.keys(errors).length > 0) return errors;
    return submissionErrors(info.type, expenseContentSchema.parse(input), {
      today: info.today,
      claimDeadlineDays: info.claimDeadlineDays,
      receiptCount: info.receiptCount,
      overBy,
    });
  }

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

  /** Next: check this step only, keep the draft safe, then move on (or to the review). */
  async function next() {
    if (step === "preview") return;
    setProblem(null);
    setState({ status: "idle" });
    clearErrors();
    dropBlankRows();
    const last = step === steps.length - 1;
    const errors = allErrors();
    const mine = Object.fromEntries(
      Object.entries(errors).filter(([key]) => last || belongsTo(key, steps[step])),
    );
    if (Object.keys(mine).length > 0) {
      applyErrors(mine);
      return;
    }
    if (mode === "draft" && !(await saveDraft())) return;
    setStep(last ? "preview" : step + 1);
  }

  function back() {
    setProblem(null);
    if (step === "preview") setStep(steps.length - 1);
    else if (step > 0) setStep(step - 1);
  }

  const typeName = expensesCopy.types[info.type];
  const title = mode === "draft" ? f.titleNew(typeName) : f.titleEdit(typeName);
  const total = steps.length + 1;
  const position = step === "preview" ? total : step + 1;
  const current = step === "preview" ? null : steps[step];
  const look = current ? STEP_LOOK[current] : null;
  const tone = look?.tone ?? REVIEW_TONE;
  const question =
    current === "details" && claim
      ? f.questions.detailsClaim
      : (look?.question ?? f.questions.review);

  const explanations = (late || overBy > 0) && (
    <div className="space-y-5 rounded-[12px] border border-warning p-4">
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
          <Explanation form={form} name="overBudgetExplanation" label={f.overBudgetExplanation} />
        </div>
      )}
    </div>
  );

  return (
    <div
      data-tour-type={info.type}
      className="mx-auto w-full max-w-[32rem] space-y-5 rounded-card bg-surface p-5 shadow-card sm:p-7"
    >
      <div className="flex items-center justify-between gap-3">
        {step !== 0 ? (
          <button
            type="button"
            onClick={back}
            className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-surface-2 text-accent hover:bg-surface-hover"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
            <span className="sr-only">{f.back}</span>
          </button>
        ) : (
          <span className="size-11 shrink-0" aria-hidden="true" />
        )}
        <div data-tour="expense-budget" className="min-w-0">
          <BudgetPill
            department={info.department}
            figures={info.figures}
            after={totals.total > 0 ? after : null}
          />
        </div>
      </div>

      <header className="space-y-0.5">
        <h1 className="text-sm font-semibold">{title}</h1>
        <p className="text-xs text-fg-muted">
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

      <div>
        <p className="sr-only" aria-live="polite">
          {f.progress(position, total)}
        </p>
        <div className="flex gap-1.5" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-fast",
                i < position ? "bg-accent" : "bg-border",
              )}
            />
          ))}
        </div>
      </div>

      <div data-tour="expense-question" className="space-y-3">
        <p
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold tracking-wide uppercase",
            TONE[tone].chip,
          )}
        >
          {look && <look.icon className="size-3.5" aria-hidden="true" />}
          {sections.step(position)} · {look?.title ?? f.reviewStep}
        </p>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-[28px] leading-tight font-extrabold tracking-tight outline-none sm:text-[30px]"
        >
          {question}
        </h2>
      </div>

      {problem && step !== "preview" && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-control border border-danger p-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {problem}
        </div>
      )}

      {step === "preview" ? (
        <Review
          mode={mode}
          info={{ ...info, rate }}
          values={values}
          totals={totals}
          after={after}
          version={version}
          overBy={overBy}
          linked={linked ?? null}
          onEdit={back}
          onErrors={applyErrors}
        />
      ) : (
        <>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void next();
            }}
            className="space-y-5"
          >
            {current === "details" && <DetailsFields form={form} values={values} />}
            {current === "items" && (
              <>
                <p className="text-[15px] text-fg-muted">
                  {values.addsSalesTax === false
                    ? f.itemsIntroNoTax
                    : f.itemsIntro(`${taxRateToPercent(info.rate)}%`)}
                </p>
                <ItemsFields form={form} values={values} info={info} />
                <SalesTaxSwitch form={form} on={values.addsSalesTax !== false} rate={info.rate} />
                <dl className="space-y-1.5 text-[15px] text-fg-muted">
                  <div className="flex justify-between gap-4">
                    <dt>{copy.money.subtotal}</dt>
                    <dd className="tabular">{formatCAD(totals.subtotal)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>{salesTaxLabel(rate)}</dt>
                    <dd className="tabular">{formatCAD(totals.tax)}</dd>
                  </div>
                </dl>
                {explanations}
              </>
            )}
            {current === "lines" && (
              <>
                <p className="text-[15px] text-fg-muted">{f.linesIntro}</p>
                <LinesFields form={form} />
                <LinkedField form={form} linkable={info.linkable} />
                {explanations}
              </>
            )}
            {current === "howBought" && (
              <ChoiceList
                form={form}
                name="howBought"
                legend={f.howBought}
                options={HOW_BOUGHT.map((v) => ({
                  value: v,
                  label: expensesCopy.howBought[v],
                  hint: f.howBoughtHints[v],
                }))}
              />
            )}
            {current === "payee" && <PayeeFields form={form} values={values} />}
            {current === "attachments" && receipts}
            {current === "files" && (
              <>
                {receipts}
                <NoReceiptFields form={form} values={values} />
              </>
            )}
          </form>

          <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-5 space-y-2 border-t border-border bg-surface/95 px-5 pt-3 pb-1 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
            {step > 0 && (
              <p className="flex items-baseline justify-between gap-4">
                <span className="text-[15px] text-fg-muted">{claim ? f.totalPaid : f.total}</span>
                <span className="tabular text-2xl font-extrabold">{formatCAD(totals.total)}</span>
              </p>
            )}
            <button
              type="button"
              data-tour="expense-next"
              onClick={() => void next()}
              disabled={saving === "saving"}
              aria-busy={saving === "saving" || undefined}
              className={buttonClass(
                "primary",
                "min-h-12 w-full rounded-[10px] text-[15px] lg:min-h-12",
              )}
            >
              {saving === "saving" && (
                <Loader2
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
              {step === steps.length - 1 ? f.toPreview : f.next}
            </button>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {mode === "draft" ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void saveDraft()}
                    disabled={saving === "saving"}
                    className={cn(TEXT_LINK, "text-fg")}
                  >
                    {f.saveDraft}
                  </button>
                  <p role="status" className="flex items-center gap-1 text-sm text-fg-muted">
                    {saving === "saved" && (
                      <>
                        <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                        {f.saved}
                      </>
                    )}
                  </p>
                </div>
              ) : (
                <Link href={`/expenses/${info.id}`} className={cn(TEXT_LINK, "text-fg")}>
                  {f.cancelEdit}
                </Link>
              )}
              {mode === "draft" && <DeleteDraft id={info.id} version={version} />}
            </div>
            <FormMessage state={state} />
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- budget

/** The budget as one pill, "Media Team · $29,392.66 left"; it opens to the figures. */
function BudgetPill({
  department,
  figures,
  after,
}: {
  department: string;
  figures: BudgetFigures;
  after: number | null;
}) {
  const over = after !== null && after < 0;
  const rows: [string, number][] = [
    [b.available, figures.available],
    [b.committed, figures.committed],
    [b.pending, figures.pending],
    [b.spent, figures.spent],
    [b.remaining, figures.remaining],
  ];
  return (
    <details className="group min-w-0 flex-1 text-right">
      <summary className="ml-auto inline-flex min-h-11 max-w-full cursor-pointer list-none items-center gap-1.5 rounded-full bg-surface-2 px-4 text-[13px] font-semibold [&::-webkit-details-marker]:hidden">
        <span className="truncate">
          {over
            ? f.budgetOver(department, formatCAD(-after))
            : f.budgetLeft(department, formatCAD(after ?? figures.remaining))}
        </span>
        <ChevronDown
          className="size-4 shrink-0 transition-transform duration-fast group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      <dl className="mt-3 rounded-[12px] bg-surface-2 px-4 py-1 text-left text-sm">
        {rows.map(([label, cents]) => (
          <div key={label} className="flex justify-between gap-4 border-b border-border py-2.5">
            <dt className="text-fg-muted">{label}</dt>
            <dd className="tabular font-bold">{formatCAD(cents)}</dd>
          </div>
        ))}
        {after !== null && (
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-fg-muted">{b.remainingAfter}</dt>
            <dd className={cn("tabular font-bold", over && "text-danger")}>
              {over ? b.overBy(formatCAD(-after)) : formatCAD(after)}
            </dd>
          </div>
        )}
      </dl>
    </details>
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

/**
 * Sales tax for the whole purchase request: on by default; off for an honorarium, money
 * sent to a person, or anything sold without tax (decided 2026-11-07). Not per item.
 */
function SalesTaxSwitch({ form, on, rate }: FormProps & { on: boolean; rate: string }) {
  const id = useId();
  return (
    <div
      data-tour="expense-tax"
      className="flex items-center justify-between gap-4 rounded-[12px] bg-surface-2 p-4"
    >
      <div className="min-w-0 space-y-0.5">
        <p id={`${id}-label`} className="text-base font-bold">
          {f.salesTax(`${taxRateToPercent(rate)}%`)}
        </p>
        <p id={`${id}-hint`} className="text-[13px] text-fg-muted">
          {on ? f.salesTaxOnHint : f.salesTaxOffHint}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        onClick={() => form.setValue("addsSalesTax", !on, { shouldDirty: true })}
        className={cn(
          "relative h-8 w-[52px] shrink-0 cursor-pointer rounded-full transition-colors duration-fast motion-reduce:transition-none",
          on ? "bg-accent" : "bg-border-strong",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-[3px] left-[3px] size-[26px] rounded-full bg-white transition-transform duration-fast motion-reduce:transition-none",
            on && "translate-x-5",
          )}
        />
      </button>
    </div>
  );
}

function DetailsFields({ form, values }: FormProps & { values: ExpenseFormValues }) {
  const ids = useId();
  const errors = form.formState.errors;
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label htmlFor={`${ids}-title`} className={LABEL}>
          {f.title}
        </label>
        <input
          id={`${ids}-title`}
          {...form.register("title")}
          maxLength={LIMITS.title}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={describedBy(`${ids}-title-hint`, errors.title && `${ids}-title-error`)}
          className={FIELD}
        />
        <p id={`${ids}-title-hint`} className="text-[13px] text-fg-muted">
          {f.titleHint}
        </p>
        <FieldError id={`${ids}-title-error`} message={errors.title?.message} />
      </div>
      <div className="space-y-2">
        <label htmlFor={`${ids}-just`} className={LABEL}>
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
          className={FIELD_AREA}
        />
        <div className="flex flex-wrap justify-between gap-2 text-[13px] text-fg-muted">
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

/** A compact, labelled-by-name input inside an item or receipt row. */
function RowInput({
  form,
  name,
  label,
  type = "text",
  inputMode,
  placeholder,
  className,
  strong,
}: FormProps & {
  name: `items.${number}.${keyof ItemValues}` | `lines.${number}.${keyof LineValues}`;
  label: string;
  type?: string;
  inputMode?: "decimal" | "numeric" | "url";
  placeholder?: string;
  className?: string;
  strong?: boolean;
}) {
  const id = useId();
  const [group, index, field] = name.split(".");
  const rowErrors = (form.formState.errors as Record<string, unknown>)[group] as
    Record<string, Record<string, { message?: string }>> | undefined;
  const error = rowErrors?.[index]?.[field]?.message;
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete="off"
        aria-label={label}
        placeholder={placeholder ?? label}
        {...form.register(name)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(FIELD, strong && "font-semibold", inputMode === "decimal" && "tabular")}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-danger"
    >
      <Trash2 className="size-[18px]" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </button>
  );
}

function MoreToggle({
  open,
  onToggle,
  more,
  less,
  controls,
}: {
  open: boolean;
  onToggle: () => void;
  more: string;
  less: string;
  controls: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="min-h-9 cursor-pointer self-start text-sm font-semibold text-accent underline underline-offset-2"
    >
      {open ? less : more}
    </button>
  );
}

function ItemsFields({
  form,
  values,
  info,
}: FormProps & { values: ExpenseFormValues; info: ExpenseEditorInfo }) {
  const items = useFieldArray({ control: form.control, name: "items" });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const ids = useId();
  const listError =
    form.formState.errors.items?.message ?? form.formState.errors.items?.root?.message;
  return (
    <div>
      {listError && (
        <p role="alert" className="pb-2 text-sm text-danger">
          {listError}
        </p>
      )}
      <ol className="border-t border-border">
        {items.fields.map((field, i) => {
          const v = values.items?.[i] ?? BLANK_ITEM;
          const total = itemTotalOf(v.quantity ?? "", v.unitPrice ?? "");
          // Details already typed stay open.
          const isOpen = open[field.id] ?? Boolean(v.link || v.annualLineItemId);
          const panel = `${ids}-more-${i}`;
          return (
            <li key={field.id} className="border-b border-border py-3.5">
              <fieldset className="flex min-w-0 flex-col gap-2.5">
                <legend className="sr-only">{f.item(i + 1)}</legend>
                <div className="flex items-start gap-2">
                  <RowInput
                    form={form}
                    name={`items.${i}.name`}
                    label={f.itemName}
                    className="flex-1"
                    strong
                  />
                  <RemoveButton label={f.removeItem(i + 1)} onClick={() => items.remove(i)} />
                </div>
                <div className="flex items-start gap-2.5">
                  <RowInput
                    form={form}
                    name={`items.${i}.quantity`}
                    label={f.quantity}
                    inputMode="numeric"
                    placeholder="1"
                    className="w-[4.5rem] shrink-0"
                  />
                  <span className="pt-3.5 text-fg-muted" aria-hidden="true">
                    ×
                  </span>
                  <RowInput
                    form={form}
                    name={`items.${i}.unitPrice`}
                    label={f.unitPrice}
                    inputMode="decimal"
                    placeholder={f.pricePlaceholder}
                    className="flex-1"
                  />
                  <p className="tabular min-w-[5.5rem] pt-3.5 text-right text-base font-bold">
                    <span className="sr-only">{f.lineTotal}: </span>
                    {total === null ? "—" : formatCAD(total)}
                  </p>
                </div>
                <MoreToggle
                  open={isOpen}
                  onToggle={() => setOpen({ ...open, [field.id]: !isOpen })}
                  more={f.moreItem}
                  less={f.lessItem}
                  controls={panel}
                />
                <div id={panel} hidden={!isOpen} className="space-y-2.5">
                  <ItemDetail
                    form={form}
                    index={i}
                    options={info.annualLines}
                    linkLabel={`${f.link} ${f.optional}`}
                  />
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
        className={cn(TEXT_LINK, "mt-2 text-fg")}
      >
        <Plus className="size-4" aria-hidden="true" />
        {f.addAnotherItem}
      </button>
    </div>
  );
}

function ItemDetail({
  form,
  index,
  options,
  linkLabel,
}: FormProps & { index: number; options: AnnualLineOption[]; linkLabel: string }) {
  const id = useId();
  const error = (
    form.formState.errors.items as Record<string, Record<string, { message?: string }>> | undefined
  )?.[index]?.link?.message;
  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor={`${id}-link`} className="block text-[13px] font-semibold">
          {linkLabel}
        </label>
        <input
          id={`${id}-link`}
          type="url"
          inputMode="url"
          autoComplete="off"
          {...form.register(`items.${index}.link`)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-link-error` : undefined}
          className={FIELD}
        />
        <FieldError id={`${id}-link-error`} message={error} />
      </div>
      {options.length > 0 && (
        <div className="space-y-1.5">
          <label htmlFor={`${id}-annual`} className="block text-[13px] font-semibold">
            {f.annualLine} {f.optional}
          </label>
          <select
            id={`${id}-annual`}
            {...form.register(`items.${index}.annualLineItemId`)}
            className={FIELD}
          >
            <option value="">{f.annualLineNone}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}

/** Big tappable choices, one per line, each with a short hint (design H). */
function ChoiceList({
  form,
  name,
  legend,
  options,
}: FormProps & {
  name: "howBought" | "payeeKind";
  legend: string;
  options: readonly { value: string; label: string; hint: string }[];
}) {
  const ids = useId();
  const error = form.formState.errors[name]?.message;
  return (
    <fieldset className="space-y-2.5" aria-describedby={error ? `${ids}-error` : undefined}>
      {/* The screen's heading asks the question; the legend is for screen readers. */}
      <legend className="sr-only">{legend}</legend>
      {options.map((o) => (
        <label
          key={o.value}
          className="flex min-h-16 cursor-pointer items-center justify-between gap-3 rounded-[12px] border border-border-strong bg-surface px-4 py-3 transition-colors duration-fast hover:border-accent has-checked:border-2 has-checked:border-accent has-checked:bg-accent/5"
        >
          <span className="min-w-0">
            <span className="block text-base font-bold">{o.label}</span>
            <span className="block text-[13px] text-fg-muted">{o.hint}</span>
          </span>
          <input
            type="radio"
            value={o.value}
            {...form.register(name)}
            className="size-6 shrink-0 accent-accent"
          />
        </label>
      ))}
      <FieldError id={`${ids}-error`} message={error} />
    </fieldset>
  );
}

function LinesFields({ form }: FormProps) {
  const lines = useFieldArray({ control: form.control, name: "lines" });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const ids = useId();
  const values = useWatch({ control: form.control, name: "lines" });
  const listError =
    form.formState.errors.lines?.message ?? form.formState.errors.lines?.root?.message;
  return (
    <div>
      {listError && (
        <p role="alert" className="pb-2 text-sm text-danger">
          {listError}
        </p>
      )}
      <ol className="border-t border-border">
        {lines.fields.map((field, i) => {
          const isOpen = open[field.id] ?? Boolean(values?.[i]?.receiptNumber);
          const panel = `${ids}-more-${i}`;
          return (
            <li key={field.id} className="border-b border-border py-3.5">
              <fieldset className="flex min-w-0 flex-col gap-2.5">
                <legend className="sr-only">{f.line(i + 1)}</legend>
                <div className="flex items-start gap-2">
                  <RowInput
                    form={form}
                    name={`lines.${i}.vendor`}
                    label={f.vendor}
                    className="flex-1"
                    strong
                  />
                  <RemoveButton label={f.removeLine(i + 1)} onClick={() => lines.remove(i)} />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <RowInput form={form} name={`lines.${i}.date`} label={f.date} type="date" />
                  <RowInput
                    form={form}
                    name={`lines.${i}.amount`}
                    label={f.amount}
                    inputMode="decimal"
                    placeholder={f.amountPlaceholder}
                    strong
                  />
                </div>
                <RowInput form={form} name={`lines.${i}.description`} label={f.description} />
                <MoreToggle
                  open={isOpen}
                  onToggle={() => setOpen({ ...open, [field.id]: !isOpen })}
                  more={f.moreLine}
                  less={f.lessLine}
                  controls={panel}
                />
                <div id={panel} hidden={!isOpen}>
                  <RowInput
                    form={form}
                    name={`lines.${i}.receiptNumber`}
                    label={`${f.receiptNumber} ${f.optional}`}
                  />
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={() =>
          lines.append(BLANK_LINE, {
            shouldFocus: true,
            focusName: `lines.${lines.fields.length}.vendor`,
          })
        }
        className={cn(TEXT_LINK, "mt-2 text-fg")}
      >
        <Plus className="size-4" aria-hidden="true" />
        {f.addAnotherLine}
      </button>
    </div>
  );
}

function LinkedField({ form, linkable }: FormProps & { linkable: LinkableRequest[] }) {
  const id = useId();
  const error = form.formState.errors.linkedPurchaseRequestId?.message;
  if (linkable.length === 0) return null;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className={LABEL}>
        {f.linked} {f.optional}
      </label>
      <select
        id={id}
        {...form.register("linkedPurchaseRequestId")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(`${id}-hint`, error && `${id}-error`)}
        className={FIELD}
      >
        <option value="">{f.linkedNone}</option>
        {linkable.map((l) => (
          <option key={l.id} value={l.id}>
            {f.linkedOption(l.reference, l.title, formatCAD(l.committedCents))}
          </option>
        ))}
      </select>
      <p id={`${id}-hint`} className="text-[13px] text-fg-muted">
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
    <div className="space-y-2">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        {...form.register(name)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint && `${id}-hint`, error && `${id}-error`)}
        className={FIELD}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-[13px] text-fg-muted">
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
    <div className="space-y-4">
      <ChoiceList
        form={form}
        name="payeeKind"
        legend={f.payee}
        options={PAYEE_KINDS.map((v) => ({
          value: v,
          label: expensesCopy.payee[v],
          hint: f.payeeHints[v],
        }))}
      />
      {values.payeeKind === "other" && (
        <div className="space-y-4">
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
          {/* The church pays claims by cheque (decided 2026-11-07): nothing to choose. */}
          <p className="flex items-center gap-3 rounded-[12px] bg-surface-2 p-4 text-[15px]">
            <Wallet className="size-5 shrink-0 text-accent" aria-hidden="true" />
            {f.paidByCheque}
          </p>
          <p className="text-[13px] text-fg-muted">{f.noBankDetails}</p>
        </>
      )}
    </div>
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
      <div className="flex min-h-11 items-center gap-3">
        <input
          id={id}
          type="checkbox"
          {...form.register("noReceipt")}
          className="size-6 shrink-0 accent-accent"
        />
        <label htmlFor={id} className="text-base">
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
    <div className="space-y-2">
      {warning && (
        <p className="flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          {warning}
        </p>
      )}
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        maxLength={LIMITS.explanation}
        {...form.register(name)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={FIELD_AREA}
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
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <ConfirmDialog
        formId={formId}
        trigger={f.deleteDraft}
        triggerClassName={cn(TEXT_LINK, "cursor-pointer text-danger")}
        title={f.deleteTitle}
        body={f.deleteBody}
        confirmLabel={f.deleteConfirm}
        confirmTone="danger"
      />
      <FormMessage state={state} />
    </form>
  );
}

// ---------------------------------------------------------------- check and send

function Review({
  mode,
  info,
  values,
  totals,
  after,
  version,
  overBy,
  linked,
  onEdit,
  onErrors,
}: {
  mode: ExpenseEditorMode;
  info: ExpenseEditorInfo;
  values: ExpenseFormValues;
  totals: TaxBreakdown;
  after: number;
  version: number;
  overBy: number;
  linked: LinkableRequest | null;
  onEdit: () => void;
  onErrors: (errors: Record<string, string>) => void;
}) {
  // One key per review: a double click or a retry sends the same key (FR-10).
  const [key] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState>({ status: "idle" });
  const claim = info.type === "expense_claim";
  const v = expensesCopy.view;
  const r = f.reviewRows;

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
  const noTax = !claim && values.addsSalesTax === false;

  const rows: { label: string; value: React.ReactNode; muted?: boolean }[] = [
    { label: claim ? r.claim : r.request, value: values.title, muted: true },
    ...(claim
      ? (values.lines ?? []).map((line) => {
          const cents = parseCAD(line.amount);
          return {
            label: [line.vendor, line.date, line.description].filter(Boolean).join(" · "),
            value: cents === null ? "—" : formatCAD(cents),
          };
        })
      : (values.items ?? []).map((item) => {
          const cents = itemTotalOf(item.quantity, item.unitPrice);
          return {
            label: `${item.quantity.trim() || "1"} × ${item.name}`,
            value: cents === null ? "—" : formatCAD(cents),
          };
        })),
    ...(claim
      ? []
      : [{ label: salesTaxLabel(info.rate), value: formatCAD(totals.tax), muted: true }]),
    ...(claim
      ? [
          {
            label: r.paidTo,
            value: values.payeeKind === "church_card" ? payee : r.byCheque(payee),
            muted: true,
          },
          ...(linked ? [{ label: v.linked, value: linked.reference, muted: true }] : []),
        ]
      : values.howBought
        ? [
            {
              label: r.boughtBy,
              value:
                expensesCopy.howBought[values.howBought as keyof typeof expensesCopy.howBought],
              muted: true,
            },
          ]
        : []),
    { label: r.department, value: `${info.department} · ${info.cycleName}`, muted: true },
  ];

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="text-sm text-fg-muted">{claim ? f.totalPaid : f.total}</p>
        <p className="tabular text-[44px] leading-none font-extrabold tracking-tight">
          {formatCAD(totals.total)}
        </p>
        <p className="text-[15px] text-fg-muted">
          {b.remainingAfter}:{" "}
          <span className={cn("font-bold text-fg", after < 0 && "text-danger")}>
            {after < 0 ? b.overBy(formatCAD(-after)) : formatCAD(after)}
          </span>
        </p>
      </div>
      {!claim && (
        <p
          className={cn(
            "inline-flex rounded-full px-3 py-1 text-[13px] font-bold",
            noTax ? "bg-accent/10 text-accent" : TONE.blue.chip,
          )}
        >
          {noTax ? f.noSalesTaxTag : `${salesTaxLabel(info.rate)} · ${formatCAD(totals.tax)}`}
        </p>
      )}
      <dl className="border-t border-border">
        {rows.map((row, i) => (
          <div key={i} className="flex justify-between gap-4 border-b border-border py-3.5">
            <dt className={cn("min-w-0", row.muted && "text-fg-muted")}>{row.label}</dt>
            <dd className="tabular text-right font-semibold">{row.value}</dd>
          </div>
        ))}
      </dl>
      <section className="space-y-1">
        <h3 className="text-sm font-semibold">{f.justification}</h3>
        <p className="text-[15px] whitespace-pre-line text-fg-muted">{values.justification}</p>
      </section>
      {overBy > 0 && (
        <OverBudgetWarning
          department={info.department}
          overBy={overBy}
          explanation={values.overBudgetExplanation}
          explanationLabel={v.overBudget}
        />
      )}
      <p className="text-[13px] text-fg-muted">{claim ? f.approversNoteClaim : f.approversNote}</p>

      <div className="space-y-2">
        <AlertDialog.Root>
          <AlertDialog.Trigger
            data-tour="expense-send"
            className={buttonClass(
              "primary",
              "min-h-12 w-full rounded-[10px] text-[15px] lg:min-h-12",
            )}
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
        <button type="button" onClick={onEdit} className={cn(TEXT_LINK, "w-full justify-center")}>
          {p.edit}
        </button>
      </div>
      <FormMessage state={state} />
    </div>
  );
}
