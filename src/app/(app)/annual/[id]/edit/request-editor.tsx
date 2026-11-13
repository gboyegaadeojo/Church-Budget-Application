"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  AlertCircle,
  AlignLeft,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronRight,
  ChevronUp,
  Info,
  Link2,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { FinancialSummary } from "@/components/financial-summary";
import { FormMessage } from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/display";
import { HelpPanel } from "@/components/help-panel";
import {
  buttonClass,
  cardClass,
  inputClass,
  linkClass,
  textareaClass,
} from "@/components/ui/styles";
import { useClearErrorOnEdit } from "@/components/ui/use-clear-error-on-edit";
import { adminCopy } from "@/copy/admin";
import { annualCopy } from "@/copy/annual";
import { formErrors, isHttpUrl, LIMITS, lineTotalOf } from "@/domain/annual/schema";
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
  /** The accountant's question, while responding to a return for clarification (FR-17). */
  question: string | null;
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
  useClearErrorOnEdit(form);

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [version, setVersion] = useState(request.version);
  const [serverTotals, setServerTotals] = useState(request.totals);
  const [restored, setRestored] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);
  const router = useRouter();
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

  /** Saves now, then leaves; a failed save keeps the person here with the error shown. */
  async function saveAndExit() {
    setExiting(true);
    if (await saveNow()) router.push("/annual?saved=draft");
    else setExiting(false);
  }

  const heading = f.steps[step];
  const others = request.alsoEditing;

  return (
    <div className="space-y-6 pb-36 lg:pb-0">
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
      {mode === "respond" && (
        <Banner tone="warning">
          {f.respondingBanner}
          {request.question && (
            <span className="mt-1 block whitespace-pre-line">
              <span className="font-medium">{annualCopy.view.decisionHeading.returned}: </span>
              {request.question}
            </span>
          )}
        </Banner>
      )}
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
        {/* The items sit straight on the page as their own cards; the other steps are one card. */}
        <div className={cn(step !== 1 && cardClass, "min-w-0 space-y-5")}>
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
                {mode === "draft" ? (
                  <button
                    type="button"
                    onClick={() => void saveAndExit()}
                    disabled={exiting}
                    aria-busy={exiting || undefined}
                    className={buttonClass("secondary")}
                  >
                    {exiting && (
                      <Loader2
                        className="size-4 animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    )}
                    {f.saveAndExit}
                  </button>
                ) : (
                  <div className="space-y-1">
                    <Link href={`/annual/${request.id}`} className={buttonClass("ghost")}>
                      {f.cancelEdit}
                    </Link>
                    <p className="text-xs text-fg-muted">{f.cancelEditHint}</p>
                  </div>
                )}
              </div>
              {step === 0 ? (
                <button
                  type="button"
                  data-tour="annual-next"
                  onClick={() => setStep(1)}
                  className={buttonClass("primary")}
                >
                  {f.next}
                </button>
              ) : (
                // Below lg the frosted bar at the bottom carries Preview instead.
                <PreviewButton onClick={() => void goToPreview()} className="max-lg:hidden" />
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
            onPreview={step === 1 ? () => void goToPreview() : undefined}
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
    <div data-tour="annual-details" className="space-y-5">
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

/** A filled field in the item cards (design approved 2026-11-13). */
const ITEM_FIELD =
  "block h-10 w-full rounded-[10px] border-0 bg-surface-2 px-3 text-[15px] text-fg outline-none transition-[background-color,box-shadow] duration-fast placeholder:text-fg-muted focus:bg-surface focus:ring-2 focus:ring-accent aria-[invalid=true]:bg-danger/10 aria-[invalid=true]:ring-[1.5px] aria-[invalid=true]:ring-danger";

/** Item | How many | Price each | Total, when the list is wide enough for columns. */
const SUMMARY_COLUMNS = "@2xl:grid-cols-[2rem_minmax(0,1fr)_5.5rem_8rem_7.5rem_1rem]";

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
  // One item is open for editing and the rest are one line each. It starts on the first
  // empty item, so a new request opens ready to type.
  const [openIndex, setOpenIndex] = useState<number | null>(() => {
    const blank = (form.getValues("lines") ?? []).findIndex(isBlank);
    return blank === -1 ? null : blank;
  });

  const add = () => {
    setOpenIndex(count);
    lines.append(BLANK_LINE, { shouldFocus: true, focusName: `lines.${count}.name` });
  };
  const move = (from: number, to: number) => {
    lines.move(from, to);
    setOpenIndex((o) => (o === from ? to : o === to ? from : o));
  };
  const removeAt = (i: number) => {
    lines.remove(i);
    setOpenIndex((o) => (o === null || o === i ? null : o > i ? o - 1 : o));
  };
  const askRemove = (i: number) => {
    const line = form.getValues(`lines.${i}`);
    if (isBlank(line)) removeAt(i);
    else setRemoving(i);
  };

  return (
    <div className="@container space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3">
          <p className="text-sm text-fg-muted">{f.itemsIntro(taxRateToPercent(rate))}</p>
          <HelpPanel topic="tax" />
        </div>
        {count > 0 && (
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
            {f.itemCount(count)}
          </span>
        )}
      </div>
      {listError && (
        <p role="alert" className="text-sm text-danger">
          {listError}
        </p>
      )}
      <div data-tour="annual-items" className="space-y-2">
        {count === 0 ? (
          <p className="rounded-xl bg-surface px-4 py-5 text-sm text-fg-muted shadow-card">
            {f.noItems}
          </p>
        ) : (
          <>
            <div
              aria-hidden="true"
              className={cn(
                SUMMARY_COLUMNS,
                "hidden gap-4 px-4 text-xs font-semibold tracking-wide text-fg-muted uppercase @2xl:grid",
              )}
            >
              <span />
              <span>{f.colItem}</span>
              <span className="text-right">{f.howMany}</span>
              <span className="text-right">{f.colPrice}</span>
              <span className="text-right">{f.colTotal}</span>
              <span />
            </div>
            <ol className="space-y-2">
              {lines.fields.map((field, i) => (
                <li key={field.id}>
                  <LineFields
                    form={form}
                    index={i}
                    count={count}
                    line={values.lines?.[i] ?? BLANK_LINE}
                    open={openIndex === i}
                    onOpen={() => setOpenIndex(i)}
                    onDone={() => setOpenIndex(null)}
                    onMove={(to) => move(i, to)}
                    onRemove={() => askRemove(i)}
                    onEnterLast={add}
                  />
                </li>
              ))}
            </ol>
          </>
        )}
        <button
          type="button"
          onClick={add}
          className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-surface text-[15px] font-semibold text-accent shadow-card transition-shadow duration-fast hover:ring-[1.5px] hover:ring-accent/40"
        >
          <Plus className="size-4" strokeWidth={2.6} aria-hidden="true" />
          {f.addItem}
        </button>
      </div>

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
                  if (removing !== null) removeAt(removing);
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

/** The web address's domain, shown once a link is right ("sirui.com"). */
function domainOf(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * One item (design approved 2026-11-13): a single line until it's opened, then its
 * fields slide open below. One item is open at a time; an item with an error stays
 * open. On a narrow screen Notes opens on request; on a wide one it always shows.
 */
function LineFields({
  form,
  index,
  count,
  line,
  open,
  onOpen,
  onDone,
  onMove,
  onRemove,
  onEnterLast,
}: {
  form: UseFormReturn<FormValues>;
  index: number;
  count: number;
  line: LineValues;
  open: boolean;
  onOpen: () => void;
  onDone: () => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  onEnterLast: () => void;
}) {
  const ids = useId();
  const n = index + 1;
  const errors = form.formState.errors.lines?.[index];
  const name = (line.name ?? "").trim();
  const quantity = line.quantity ?? "";
  const price = line.unitPrice ?? "";
  const link = (line.link ?? "").trim();
  const notes = (line.notes ?? "").trim();
  const total = lineTotalOf(quantity, price);
  const unitCents = lineTotalOf("1", price);
  const last = index === count - 1;
  const editing = open || Boolean(errors);
  const [notesShown, setNotesShown] = useState(false);
  const notesOpen = notesShown || notes !== "" || Boolean(errors?.notes);
  // A check once a value is right, by the same parsing the server uses.
  const valid: Partial<Record<keyof LineValues, boolean>> = {
    quantity: quantity.trim() !== "" && lineTotalOf(quantity, "0") !== null,
    unitPrice: price.trim() !== "" && unitCents !== null,
    link: link !== "" && isHttpUrl(link),
  };
  const totalText = total === null ? "—" : formatCAD(total);
  const priceText = unitCents === null ? "—" : formatCAD(unitCents);
  const extras = [valid.link ? domainOf(link) : "", notes ? f.notesAdded : ""]
    .filter(Boolean)
    .join(" · ");

  // Enter never submits the form; in the last item it adds a new one (DRD 6.3).
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (last) onEnterLast();
  };

  const open_ = () => {
    flushSync(onOpen);
    form.setFocus(`lines.${index}.name`);
  };
  // Done folds the item and puts focus on its line, so keyboard users don't lose their place.
  const summaryRef = useRef<HTMLButtonElement>(null);
  const done = () => {
    flushSync(onDone);
    summaryRef.current?.focus();
  };
  const showNotes = () => {
    flushSync(() => setNotesShown(true));
    form.setFocus(`lines.${index}.notes`);
  };

  const field = (
    key: keyof LineValues,
    label: string,
    options: {
      inputMode?: "numeric" | "decimal" | "url";
      type?: string;
      placeholder?: string;
      className?: string;
      inputClassName?: string;
      prefix?: React.ReactNode;
    } = {},
  ) => {
    const error = errors?.[key]?.message;
    const ok = !error && valid[key] === true;
    const id = `${ids}-${key}`;
    return (
      <div className={cn("min-w-0 space-y-1.5", options.className)}>
        <label
          htmlFor={id}
          className="flex items-center gap-1 pl-0.5 text-[12.5px] font-medium text-fg-muted"
        >
          <span className="truncate">{label}</span>
          {ok && (
            <Check className="size-3 shrink-0 text-success" strokeWidth={3} aria-hidden="true" />
          )}
        </label>
        <div className="relative">
          {options.prefix && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-fg-muted"
            >
              {options.prefix}
            </span>
          )}
          <input
            id={id}
            type={options.type ?? "text"}
            inputMode={options.inputMode}
            placeholder={options.placeholder}
            autoComplete="off"
            {...form.register(`lines.${index}.${key}`)}
            onKeyDown={onKeyDown}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className={cn(ITEM_FIELD, options.inputClassName)}
          />
        </div>
        {error && (
          <p id={`${id}-error`} className="pl-0.5 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    );
  };

  const segButton =
    "inline-flex h-9 min-w-10 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors duration-fast hover:bg-surface aria-disabled:cursor-not-allowed aria-disabled:text-fg-muted/60 aria-disabled:hover:bg-transparent";
  const itemLabel = (text: string, wideOnly = true) => (
    <>
      <span className={wideOnly ? "sr-only @xl:not-sr-only" : undefined}>{text}</span>
      <span className="sr-only">{f.forItem(n)}</span>
    </>
  );

  return (
    <fieldset
      className={cn(
        "min-w-0 overflow-hidden rounded-xl bg-surface shadow-card transition-shadow duration-200",
        editing && "shadow-overlay ring-[1.5px] ring-accent/30",
      )}
    >
      {/* The legend must be the fieldset's first child to name the group. */}
      <legend className="sr-only">{f.item(n)}</legend>

      {!editing && (
        <button
          ref={summaryRef}
          type="button"
          onClick={open_}
          aria-expanded={false}
          aria-controls={`${ids}-fields`}
          className={cn(
            SUMMARY_COLUMNS,
            "flex min-h-20 w-full items-center gap-3 px-3 py-3 text-left transition-colors duration-fast hover:bg-surface-2/60 @2xl:grid @2xl:min-h-17 @2xl:gap-4 @2xl:px-4",
          )}
        >
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-sm font-semibold text-accent"
          >
            {n}
          </span>
          <span className="min-w-0 flex-1">
            <span className="sr-only">{f.changeItem(n)} </span>
            <span
              className={cn(
                "block truncate text-base font-semibold tracking-tight",
                !name && "font-medium text-fg-muted",
              )}
            >
              {name || f.noName}
            </span>
            <span className="tabular block truncate text-[13px] text-fg-muted @2xl:hidden">
              {f.itemMath(quantity.trim() || "1", priceText)}
            </span>
            {extras && (
              <span className="hidden truncate text-[13px] text-fg-muted @2xl:block">{extras}</span>
            )}
          </span>
          <span className="tabular hidden text-right text-sm text-fg-muted @2xl:block">
            {quantity.trim() || "1"}
          </span>
          <span className="tabular hidden text-right text-sm text-fg-muted @2xl:block">
            {priceText}
          </span>
          <span className="tabular text-right text-base font-semibold">{totalText}</span>
          <ChevronRight className="size-4 shrink-0 text-fg-muted/60" aria-hidden="true" />
        </button>
      )}

      <div
        id={`${ids}-fields`}
        inert={!editing}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          editing ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-3 p-3 @xl:space-y-3.5 @xl:p-4">
            <div className="flex min-h-8 items-center justify-between gap-2">
              <p className="flex items-center gap-2.5 text-[15px] font-semibold">
                <span
                  aria-hidden="true"
                  className="grid size-7 place-items-center rounded-lg bg-accent-soft text-[13px] text-accent"
                >
                  {n}
                </span>
                <span aria-hidden="true">{f.item(n)}</span>
              </p>
              {!errors && (
                <button
                  type="button"
                  onClick={done}
                  className="inline-flex h-8 items-center rounded-full bg-accent-soft px-4 text-sm font-semibold text-accent transition-colors duration-fast hover:bg-surface-hover"
                >
                  {f.done}
                  <span className="sr-only">{f.forItem(n)}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] items-start gap-2.5 @xl:grid-cols-[6rem_minmax(0,1fr)_9rem] @xl:gap-3 @3xl:grid-cols-[minmax(0,1fr)_6rem_9.5rem_8.5rem]">
              {field("name", f.itemName, {
                placeholder: f.namePlaceholder,
                className: "col-span-2 @xl:col-span-3 @3xl:col-span-1",
              })}
              {field("quantity", f.howMany, {
                inputMode: "numeric",
                placeholder: "1",
                inputClassName: "tabular @xl:text-right",
              })}
              {field("unitPrice", f.priceEach, {
                inputMode: "decimal",
                placeholder: "0.00",
                prefix: "$",
                inputClassName: "tabular pl-6 @xl:text-right",
              })}
              <div className="col-span-2 flex items-baseline justify-between rounded-[10px] bg-accent-soft px-3 py-2.5 @xl:col-span-1 @xl:block @xl:space-y-1.5 @xl:bg-transparent @xl:p-0 @xl:text-right">
                <p className="text-[13px] font-medium text-fg-muted @xl:pr-0.5 @xl:text-[12.5px]">
                  {f.itemTotal}
                </p>
                <p className="tabular text-xl font-bold tracking-tight @xl:flex @xl:h-10 @xl:items-center @xl:justify-end @xl:rounded-[10px] @xl:bg-accent-soft @xl:px-3 @xl:text-[17px]">
                  {totalText}
                </p>
              </div>
            </div>

            <div className="grid gap-2.5 @xl:grid-cols-2 @xl:gap-3">
              {field("link", f.linkOptional, {
                inputMode: "url",
                type: "url",
                placeholder: "https://",
                prefix: <Link2 className="size-4" />,
                inputClassName: "pl-9",
              })}
              <div className={cn(!notesOpen && "hidden @xl:block")}>
                {field("notes", f.notesOptional, { placeholder: f.notesPlaceholder })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <div className="inline-flex items-center rounded-[10px] bg-surface-2 p-0.5">
                {!notesOpen && (
                  <button type="button" onClick={showNotes} className={cn(segButton, "@xl:hidden")}>
                    <AlignLeft className="size-4" aria-hidden="true" />
                    {itemLabel(f.addNotes, false)}
                  </button>
                )}
                {count > 1 && (
                  <>
                    <button
                      type="button"
                      aria-disabled={index === 0 || undefined}
                      onClick={() => index > 0 && onMove(index - 1)}
                      className={segButton}
                    >
                      <ArrowUp className="size-4" aria-hidden="true" />
                      {itemLabel(f.moveUp)}
                    </button>
                    <button
                      type="button"
                      aria-disabled={last || undefined}
                      onClick={() => !last && onMove(index + 1)}
                      className={segButton}
                    >
                      <ArrowDown className="size-4" aria-hidden="true" />
                      {itemLabel(f.moveDown)}
                    </button>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={onRemove}
                className="inline-flex size-10 items-center justify-center gap-1.5 rounded-[10px] bg-danger/6 text-sm font-semibold text-danger transition-colors duration-fast hover:bg-danger/10 @xl:h-9.5 @xl:w-auto @xl:px-3.5"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                {itemLabel(f.remove)}
              </button>
            </div>
          </div>
        </div>
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------- summary and saving

function SummaryPanel({
  totals,
  rate,
  save,
  onRetry,
  onPreview,
}: {
  totals: TaxBreakdown;
  rate: string;
  save: SaveState | null;
  onRetry: () => void;
  /** The items step shows Preview in the bar. */
  onPreview?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Desktop: a side panel that stays in view. */}
      <aside
        aria-label={f.summary}
        data-tour="annual-summary"
        className={cn(cardClass, "sticky top-20 hidden space-y-4 lg:block")}
      >
        <FinancialSummary totals={totals} rate={rate} heading={f.summary} />
        {save && <SaveStatus save={save} onRetry={onRetry} />}
      </aside>
      {/* Smaller screens: a frosted bar above the navigation with the subtotal (tap for the
          tax and total) and, on the items step, Preview (design approved 2026-11-13). */}
      <div
        data-tour="annual-summary"
        className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-(--z-sticky) border-t border-border bg-surface/80 px-4 py-3 backdrop-blur-xl backdrop-saturate-150 md:bottom-0 lg:hidden"
      >
        {open && <FinancialSummary totals={totals} rate={rate} className="pb-3" />}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="-mx-1 block rounded-control px-1 text-left"
            >
              <span className="flex items-center gap-1 text-[12.5px] text-fg-muted">
                {f.subtotalBeforeTax}
                <ChevronUp
                  className={cn("size-3 transition-transform duration-fast", open && "rotate-180")}
                  aria-hidden="true"
                />
                <span className="sr-only">{open ? f.hideBreakdown : f.showBreakdown}</span>
              </span>
              <span className="tabular block text-2xl font-bold tracking-tight">
                {formatCAD(totals.subtotal)}
              </span>
            </button>
            {save && <SaveStatus save={save} onRetry={onRetry} compact />}
          </div>
          {onPreview && <PreviewButton onClick={onPreview} />}
        </div>
      </div>
    </>
  );
}

/** Preview: a dark pill with an arrow (design approved 2026-11-13). */
function PreviewButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      data-tour="annual-preview"
      onClick={onClick}
      className={cn(
        "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-fg px-5 text-[15px] font-semibold text-bg transition-opacity duration-fast hover:opacity-90",
        className,
      )}
    >
      {f.toPreview}
      <ArrowRight className="size-4" aria-hidden="true" />
    </button>
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
            data-tour="annual-submit"
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
