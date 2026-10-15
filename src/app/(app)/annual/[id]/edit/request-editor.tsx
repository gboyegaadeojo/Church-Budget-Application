"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useFieldArray, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronUp,
  Info,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { FinancialSummary } from "@/components/financial-summary";
import { FormMessage } from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/display";
import {
  buttonClass,
  cardClass,
  inputClass,
  linkClass,
  textareaClass,
} from "@/components/ui/styles";
import { adminCopy } from "@/copy/admin";
import { annualCopy } from "@/copy/annual";
import { formErrors, LIMITS, lineTotalOf } from "@/domain/annual/schema";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import {
  formatCAD,
  sumCents,
  taxRateToPercent,
  totalForward,
  type TaxBreakdown,
} from "@/lib/money";
import { deleteDraftAction, reviseAction, saveDraftAction, submitAction } from "../../actions";
import { LinesTable } from "../../lines-table";
import { StepIndicator } from "../../step-indicator";

const f = annualCopy.form;
const p = annualCopy.preview;

export type EditorMode = "draft" | "revise" | "respond";

type LineValues = {
  name: string;
  quantity: string;
  unitPrice: string;
  link: string;
  notes: string;
};
type FormValues = { title: string; justification: string; lines: LineValues[] };

type RequestInfo = {
  id: string;
  version: number;
  departmentName: string;
  departmentProposed: boolean;
  cycleName: string;
  requesterName: string;
  alsoEditing: string[];
  editsRemaining: number;
  rate: string;
  totals: TaxBreakdown;
};

type SaveState =
  | { kind: "idle" | "dirty" | "saving" | "saved" }
  | { kind: "error"; message: string; latestHref?: string };

const BLANK_LINE: LineValues = { name: "", quantity: "", unitPrice: "", link: "", notes: "" };
const AUTOSAVE_MS = 1200;

const isBlank = (line: LineValues) => Object.values(line).every((v) => v.trim() === "");
const stepOfError = (key: string) => (key === "title" || key === "justification" ? 0 : 1);
const storageKey = (id: string) => `annual-request:${id}`;

/** Totals while typing, from the same money.ts the server uses; unfinished lines count 0. */
function liveTotals(lines: readonly LineValues[], rate: string): TaxBreakdown {
  const totals = lines.map((l) => lineTotalOf(l.quantity, l.unitPrice) ?? 0);
  return totalForward(sumCents(totals), rate);
}

/**
 * The annual budget form (DRD 6.3 to 6.5): details → items with the sticky summary →
 * preview → confirm. Drafts autosave; a revision or a clarification response is only
 * saved when confirmed. Unsaved values are kept on this device so a timeout or a
 * closed tab doesn't lose them (DRD 11.1). The server recalculates every total.
 */
export function RequestEditor({
  mode,
  request,
  initial,
}: {
  mode: EditorMode;
  request: RequestInfo;
  initial: FormValues;
}) {
  const form = useForm<FormValues>({
    defaultValues: { ...initial, lines: initial.lines.length > 0 ? initial.lines : [BLANK_LINE] },
  });
  const { control, getValues, setError, clearErrors, reset } = form;
  const values = useWatch({ control }) as FormValues;

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [version, setVersion] = useState(request.version);
  const [serverTotals, setServerTotals] = useState(request.totals);
  const [restored, setRestored] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const versionRef = useRef(request.version);
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const totals = useMemo(
    () => liveTotals(values.lines ?? [], request.rate),
    [values, request.rate],
  );

  // Restore values kept on this device if they belong to the version we loaded.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(request.id));
      if (!raw) return;
      const kept = JSON.parse(raw) as { version: number; values: FormValues };
      if (
        kept.version === request.version &&
        JSON.stringify(kept.values) !== JSON.stringify(getValues())
      ) {
        reset(kept.values, { keepDefaultValues: true });
        setRestored(true);
      } else {
        localStorage.removeItem(storageKey(request.id));
      }
    } catch {
      // Storage may be unavailable (private window); the server copy is the source of truth.
    }
  }, [request.id, request.version, getValues, reset]);

  const keepLocally = useCallback(
    (next: FormValues) => {
      try {
        localStorage.setItem(
          storageKey(request.id),
          JSON.stringify({ version: versionRef.current, values: next }),
        );
      } catch {
        // Ignore: keeping a local copy is a convenience only.
      }
    },
    [request.id],
  );
  const forgetLocally = useCallback(() => {
    try {
      localStorage.removeItem(storageKey(request.id));
    } catch {
      // Ignore.
    }
  }, [request.id]);

  const applyFieldErrors = useCallback(
    (errors: Record<string, string>) => {
      for (const [key, message] of Object.entries(errors)) {
        setError(key as never, { type: "server", message });
      }
    },
    [setError],
  );

  /** One save at a time, in order, each with the version the last one returned. */
  const saveNow = useCallback((): Promise<boolean> => {
    clearTimeout(timer.current);
    const run = chain.current.then(async () => {
      setSave({ kind: "saving" });
      const result = await saveDraftAction({
        id: request.id,
        version: versionRef.current,
        ...getValues(),
      });
      if (result.status === "success") {
        versionRef.current = result.data.version;
        setVersion(result.data.version);
        setServerTotals(result.data.totals);
        setSave({ kind: "saved" });
        forgetLocally();
        return true;
      }
      if (result.fieldErrors) applyFieldErrors(result.fieldErrors);
      setSave({ kind: "error", message: result.message, latestHref: result.latestHref });
      return false;
    });
    chain.current = run.catch(() => false);
    return run.catch(() => {
      setSave({ kind: "error", message: adminCopy.common.unexpected });
      return false;
    });
  }, [request.id, getValues, forgetLocally, applyFieldErrors]);

  // Every change is kept locally; a draft also autosaves after a short pause.
  useEffect(() => {
    const subscription = form.watch((next) => {
      keepLocally(next as FormValues);
      if (mode !== "draft") return;
      setSave({ kind: "dirty" });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void saveNow(), AUTOSAVE_MS);
    });
    return () => subscription.unsubscribe();
  }, [form, mode, keepLocally, saveNow]);

  // Warn before leaving with changes that aren't saved yet.
  const unsaved =
    mode === "draft"
      ? save.kind === "dirty" || save.kind === "saving" || save.kind === "error"
      : form.formState.isDirty;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  // Move focus to the step's heading when the step changes (not on first load).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [step]);

  const lines = useFieldArray({ control, name: "lines" });

  /** Checks everything submission needs, then shows the preview (DRD 6.5). */
  async function goToPreview() {
    setProblem(null);
    clearErrors();
    // Rows with nothing typed are dropped, as the server does, so error numbers line up.
    const current = getValues();
    const blanks = current.lines.flatMap((line, i) => (isBlank(line) ? [i] : []));
    if (blanks.length > 0) lines.remove(blanks);
    const errors = formErrors(getValues(), true);
    if (Object.keys(errors).length > 0) {
      applyFieldErrors(errors);
      setProblem(f.fixErrors);
      setStep(Math.min(...Object.keys(errors).map(stepOfError)) as 0 | 1);
      return;
    }
    if (mode === "draft" && !(await saveNow())) return;
    setStep(2);
  }

  const heading = f.steps[step];
  const others = request.alsoEditing;

  return (
    <div className="space-y-6 pb-28 lg:pb-0">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {f.titleEdit}: {request.departmentName}
        </h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
          <span>{request.cycleName}</span>
          {request.departmentProposed && <Badge tone="warning">{f.proposedLabel}</Badge>}
          {others.length > 0 && <span>· {f.alsoEditing(others.join(", "))}</span>}
        </p>
      </header>

      {mode === "revise" && <Banner tone="info">{f.revisingBanner(request.editsRemaining)}</Banner>}
      {mode === "respond" && <Banner tone="warning">{f.respondingBanner}</Banner>}
      {restored && (
        <Banner tone="info">
          {f.restored}{" "}
          <button
            type="button"
            className={linkClass}
            onClick={() => {
              reset(initial);
              forgetLocally();
              setRestored(false);
            }}
          >
            {f.discardRestored}
          </button>
        </Banner>
      )}

      <StepIndicator current={step} />

      <form
        noValidate
        onSubmit={(e) => e.preventDefault()}
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
      >
        <div className={cn(cardClass, "min-w-0 space-y-5")}>
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
            {heading}
          </h2>
          {problem && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-control border border-danger p-3 text-sm text-danger"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {problem}
            </div>
          )}

          {step === 0 && <DetailsStep form={form} values={values} />}
          {step === 1 && (
            <ItemsStep form={form} lines={lines} values={values} rate={request.rate} />
          )}
          {step === 2 && (
            <PreviewStep
              mode={mode}
              request={request}
              values={values}
              totals={mode === "draft" ? serverTotals : totals}
              version={version}
              onEdit={(s) => setStep(s)}
              onBeforeSend={forgetLocally}
              onErrors={(errors) => {
                applyFieldErrors(errors);
                setProblem(f.fixErrors);
                setStep(Math.min(...Object.keys(errors).map(stepOfError)) as 0 | 1);
              }}
            />
          )}

          {step < 2 && (
            <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {step === 1 && (
                  <button
                    type="button"
                    onClick={() => setStep(0)}
                    className={buttonClass("secondary")}
                  >
                    {f.back}
                  </button>
                )}
                {mode !== "draft" && (
                  <Link href={`/annual/${request.id}`} className={buttonClass("ghost")}>
                    {f.cancelEdit}
                  </Link>
                )}
              </div>
              {step === 0 ? (
                <button type="button" onClick={() => setStep(1)} className={buttonClass("primary")}>
                  {f.next}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void goToPreview()}
                  className={buttonClass("primary")}
                >
                  {f.toPreview}
                </button>
              )}
            </div>
          )}
        </div>

        {step < 2 && (
          <SummaryPanel
            totals={totals}
            rate={request.rate}
            save={mode === "draft" ? save : null}
            onRetry={() => void saveNow()}
          />
        )}
      </form>

      {mode === "draft" && step < 2 && <DeleteDraft id={request.id} version={version} />}
    </div>
  );
}

function Banner({ tone, children }: { tone: "info" | "warning"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-control border p-3 text-sm",
        tone === "info" ? "border-info" : "border-warning",
      )}
    >
      <Info
        className={cn("mt-0.5 size-4 shrink-0", tone === "info" ? "text-info" : "text-warning")}
        aria-hidden="true"
      />
      <p>{children}</p>
    </div>
  );
}

// ---------------------------------------------------------------- step 1: details

function DetailsStep({ form, values }: { form: UseFormReturn<FormValues>; values: FormValues }) {
  const ids = useId();
  const { register, formState } = form;
  const titleError = formState.errors.title?.message;
  const justError = formState.errors.justification?.message;
  const used = values.justification?.length ?? 0;
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor={`${ids}-title`} className="block text-sm font-medium">
          {f.title}
        </label>
        <input
          id={`${ids}-title`}
          {...register("title")}
          maxLength={LIMITS.title}
          aria-invalid={titleError ? true : undefined}
          aria-describedby={[`${ids}-title-hint`, titleError && `${ids}-title-error`]
            .filter(Boolean)
            .join(" ")}
          className={inputClass}
        />
        <p id={`${ids}-title-hint`} className="text-xs text-fg-muted">
          {f.titleHint}
        </p>
        {titleError && (
          <p id={`${ids}-title-error`} className="text-sm text-danger">
            {titleError}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${ids}-just`} className="block text-sm font-medium">
          {f.justification}
        </label>
        <textarea
          id={`${ids}-just`}
          {...register("justification")}
          rows={6}
          maxLength={LIMITS.justification}
          aria-invalid={justError ? true : undefined}
          aria-describedby={[
            `${ids}-just-hint`,
            `${ids}-just-count`,
            justError && `${ids}-just-error`,
          ]
            .filter(Boolean)
            .join(" ")}
          className={textareaClass}
        />
        <div className="flex flex-wrap justify-between gap-2 text-xs text-fg-muted">
          <p id={`${ids}-just-hint`}>{f.justificationHint}</p>
          <p id={`${ids}-just-count`} className="tabular">
            {f.characters(used, LIMITS.justification)}
          </p>
        </div>
        {justError && (
          <p id={`${ids}-just-error`} className="text-sm text-danger">
            {justError}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- step 2: items

type Lines = ReturnType<typeof useFieldArray<FormValues, "lines">>;

function ItemsStep({
  form,
  lines,
  values,
  rate,
}: {
  form: UseFormReturn<FormValues>;
  lines: Lines;
  values: FormValues;
  rate: string;
}) {
  const [removing, setRemoving] = useState<number | null>(null);
  const listError =
    form.formState.errors.lines?.root?.message ?? form.formState.errors.lines?.message;
  const count = lines.fields.length;

  const add = () =>
    lines.append(BLANK_LINE, { shouldFocus: true, focusName: `lines.${count}.name` });
  const askRemove = (i: number) => {
    const line = form.getValues(`lines.${i}`);
    if (isBlank(line)) lines.remove(i);
    else setRemoving(i);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">{f.itemsIntro(taxRateToPercent(rate))}</p>
      {listError && (
        <p role="alert" className="text-sm text-danger">
          {listError}
        </p>
      )}
      {count === 0 && <p className="text-sm text-fg-muted">{f.noItems}</p>}
      <ol className="space-y-4">
        {lines.fields.map((field, i) => (
          <li key={field.id}>
            <LineFields
              form={form}
              index={i}
              count={count}
              line={values.lines?.[i] ?? BLANK_LINE}
              onMove={(to) => lines.move(i, to)}
              onRemove={() => askRemove(i)}
              onEnterLast={add}
            />
          </li>
        ))}
      </ol>
      <button type="button" onClick={add} className={buttonClass("secondary")}>
        <Plus className="size-4" aria-hidden="true" />
        {f.addItem}
      </button>

      <AlertDialog.Root
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-(--z-overlay) bg-black/40" />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 z-(--z-overlay) w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-card border border-border bg-surface p-6 text-fg shadow-overlay">
            <AlertDialog.Title className="text-lg font-semibold">
              {f.removeTitle(
                (removing !== null && values.lines?.[removing]?.name.trim()) || f.unnamedItem,
              )}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-fg-muted">
              {f.removeBody}
            </AlertDialog.Description>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <AlertDialog.Cancel className={buttonClass("secondary")}>
                {adminCopy.common.cancel}
              </AlertDialog.Cancel>
              <AlertDialog.Action
                className={buttonClass("danger")}
                onClick={() => {
                  if (removing !== null) lines.remove(removing);
                  setRemoving(null);
                }}
              >
                {f.removeConfirm}
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}

function LineFields({
  form,
  index,
  count,
  line,
  onMove,
  onRemove,
  onEnterLast,
}: {
  form: UseFormReturn<FormValues>;
  index: number;
  count: number;
  line: LineValues;
  onMove: (to: number) => void;
  onRemove: () => void;
  onEnterLast: () => void;
}) {
  const ids = useId();
  const n = index + 1;
  const errors = form.formState.errors.lines?.[index];
  const total = lineTotalOf(line.quantity ?? "", line.unitPrice ?? "");
  const last = index === count - 1;
  // Enter never submits the form; in the last row it adds a new one (DRD 6.3).
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (last) onEnterLast();
  };

  const field = (
    name: keyof LineValues,
    label: string,
    options: {
      inputMode?: "numeric" | "decimal" | "url";
      hint?: string;
      className?: string;
      type?: string;
    } = {},
  ) => {
    const error = errors?.[name]?.message;
    const id = `${ids}-${name}`;
    return (
      <div className={cn("space-y-1.5", options.className)}>
        <label htmlFor={id} className="block text-sm font-medium">
          {label}
          {(name === "link" || name === "notes") && (
            <span className="font-normal text-fg-muted"> {adminCopy.common.optional}</span>
          )}
        </label>
        <input
          id={id}
          type={options.type ?? "text"}
          inputMode={options.inputMode}
          autoComplete="off"
          {...form.register(`lines.${index}.${name}`)}
          onKeyDown={onKeyDown}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [options.hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") ||
            undefined
          }
          className={inputClass}
        />
        {options.hint && (
          <p id={`${id}-hint`} className="text-xs text-fg-muted">
            {options.hint}
          </p>
        )}
        {error && (
          <p id={`${id}-error`} className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  };

  return (
    <fieldset className="space-y-4 rounded-control border border-border p-4">
      {/* The legend must be the fieldset's first child to name the group. */}
      <legend className="sr-only">{f.item(n)}</legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p aria-hidden="true" className="text-sm font-semibold">
          {f.item(n)}
        </p>
        <div className="flex gap-1">
          <IconButton label={f.moveUp(n)} disabled={index === 0} onClick={() => onMove(index - 1)}>
            <ArrowUp className="size-4" aria-hidden="true" />
          </IconButton>
          <IconButton label={f.moveDown(n)} disabled={last} onClick={() => onMove(index + 1)}>
            <ArrowDown className="size-4" aria-hidden="true" />
          </IconButton>
          <IconButton label={f.remove(n)} onClick={onRemove} danger>
            <Trash2 className="size-4" aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-6">
        {field("name", f.itemName, { className: "sm:col-span-6" })}
        {field("quantity", f.quantity, { inputMode: "numeric", className: "sm:col-span-2" })}
        {field("unitPrice", f.unitPrice, { inputMode: "decimal", className: "sm:col-span-2" })}
        <div className="space-y-1.5 sm:col-span-2">
          <p className="text-sm font-medium">{f.lineTotal}</p>
          <p className="tabular flex min-h-11 items-center text-sm font-semibold lg:min-h-10">
            {total === null ? "—" : formatCAD(total)}
          </p>
        </div>
        {field("link", f.link, { inputMode: "url", type: "url", className: "sm:col-span-3" })}
        {field("notes", f.notes, { hint: f.notesHint, className: "sm:col-span-3" })}
      </div>
    </fieldset>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid size-11 place-items-center rounded-control border border-border-strong bg-surface transition-colors duration-fast hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 lg:size-10",
        danger && "text-danger",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- summary and saving

function SummaryPanel({
  totals,
  rate,
  save,
  onRetry,
}: {
  totals: TaxBreakdown;
  rate: string;
  save: SaveState | null;
  onRetry: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Desktop: a side panel that stays in view. */}
      <aside
        aria-label={f.summary}
        className={cn(cardClass, "sticky top-20 hidden space-y-4 lg:block")}
      >
        <FinancialSummary totals={totals} rate={rate} heading={f.summary} />
        {save && <SaveStatus save={save} onRetry={onRetry} />}
      </aside>
      {/* Mobile: a bar above the navigation showing the total; it expands for the breakdown. */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-(--z-sticky) border-t border-border bg-surface px-4 py-3 shadow-overlay lg:hidden">
        {open && <FinancialSummary totals={totals} rate={rate} className="pb-3" />}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {!open && (
              <p className="text-sm">
                <span className="text-fg-muted">{annualCopy.dashboard.columns.total} </span>
                <span className="tabular font-semibold">{formatCAD(totals.total)}</span>
              </p>
            )}
            {save && <SaveStatus save={save} onRetry={onRetry} compact />}
          </div>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={buttonClass("ghost", "shrink-0 px-2")}
          >
            <ChevronUp
              className={cn("size-4 transition-transform duration-fast", open && "rotate-180")}
              aria-hidden="true"
            />
            {open ? f.hideBreakdown : f.showBreakdown}
          </button>
        </div>
      </div>
    </>
  );
}

function SaveStatus({
  save,
  onRetry,
  compact,
}: {
  save: SaveState;
  onRetry: () => void;
  compact?: boolean;
}) {
  if (save.kind === "error") {
    return (
      <div role="alert" className={cn("text-sm text-danger", compact ? "text-xs" : "space-y-1")}>
        <span>
          {f.notSaved} {!compact && save.message}{" "}
        </span>
        <button type="button" onClick={onRetry} className="font-medium underline">
          {f.retry}
        </button>
        {!compact && save.latestHref && (
          <a href={save.latestHref} className="ml-2 font-medium underline">
            {adminCopy.common.viewLatest}
          </a>
        )}
      </div>
    );
  }
  const text = save.kind === "saving" ? f.saving : save.kind === "saved" ? f.saved : "";
  return (
    <p
      role="status"
      className={cn("flex items-center gap-1.5 text-fg-muted", compact ? "text-xs" : "text-sm")}
    >
      {save.kind === "saving" && (
        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      )}
      {save.kind === "saved" && (
        <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
      )}
      {text}
    </p>
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
        startTransition(async () => setState(await deleteDraftAction(state, data)));
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

// ---------------------------------------------------------------- step 3: preview

function PreviewStep({
  mode,
  request,
  values,
  totals,
  version,
  onEdit,
  onBeforeSend,
  onErrors,
}: {
  mode: EditorMode;
  request: RequestInfo;
  values: FormValues;
  totals: TaxBreakdown;
  version: number;
  onEdit: (step: 0 | 1) => void;
  onBeforeSend: () => void;
  onErrors: (errors: Record<string, string>) => void;
}) {
  // One key per preview: a double click or a retry sends the same key (FR-10, AC-38).
  const [key] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState>({ status: "idle" });
  const lines = values.lines ?? [];

  const send = () =>
    startTransition(async () => {
      onBeforeSend();
      const result =
        mode === "draft"
          ? await submitAction({ id: request.id, version, idempotencyKey: key })
          : await reviseAction({ id: request.id, version, idempotencyKey: key, ...values });
      // Success redirects to the confirmation; only a problem comes back here.
      if (!result || result.status !== "error") return;
      if (result.fieldErrors) onErrors(result.fieldErrors);
      else setState(result);
    });

  const confirm =
    mode === "draft"
      ? {
          trigger: p.submit,
          title: p.submitTitle(formatCAD(totals.total)),
          body: p.submitBody(request.editsRemaining),
          label: p.submitConfirm,
        }
      : mode === "revise"
        ? {
            trigger: p.revise,
            title: p.reviseTitle,
            body: p.reviseBody(request.editsRemaining - 1),
            label: p.reviseConfirm,
          }
        : {
            trigger: p.respond,
            title: p.respondTitle,
            body: p.respondBody,
            label: p.respondConfirm,
          };

  return (
    <div className="space-y-6">
      <p className="text-sm text-fg-muted">{p.intro}</p>

      <article className="space-y-6 rounded-control border border-border p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="text-2xl font-semibold">{values.title}</h3>
          <button type="button" onClick={() => onEdit(0)} className={buttonClass("ghost", "px-2")}>
            {p.edit(f.steps[0])}
          </button>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-fg-muted">{p.requester}</dt>
            <dd className="font-medium">{request.requesterName}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">{f.department}</dt>
            <dd className="font-medium">
              {request.departmentName}
              {request.departmentProposed && (
                <span className="block text-xs font-normal text-fg-muted">{f.proposedLabel}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">{f.cycle}</dt>
            <dd className="font-medium">{request.cycleName}</dd>
          </div>
        </dl>
        <section className="space-y-1">
          <h4 className="text-sm font-semibold">{f.justification}</h4>
          <p className="text-sm whitespace-pre-line">{values.justification}</p>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-semibold">{f.items}</h4>
            <button
              type="button"
              onClick={() => onEdit(1)}
              className={buttonClass("ghost", "px-2")}
            >
              {p.edit(f.items)}
            </button>
          </div>
          <LinesTable
            caption={f.items}
            lines={lines.map((l) => ({
              name: l.name,
              quantity: l.quantity.trim() || "1",
              unitPriceCents: lineTotalOf("1", l.unitPrice),
              totalCents: lineTotalOf(l.quantity, l.unitPrice),
              link: l.link || null,
              notes: l.notes || null,
            }))}
          />
        </section>

        <FinancialSummary totals={totals} rate={request.rate} className="sm:ml-auto sm:max-w-sm" />
      </article>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={() => onEdit(1)} className={buttonClass("secondary")}>
          {f.back}
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
