"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { AlertCircle, Loader2 } from "lucide-react";
import { boardWarning } from "@/components/board-allocation";
import { ComparisonSummary } from "@/components/financial-summary";
import { buttonClass, inputClass } from "@/components/ui/styles";
import { adminCopy } from "@/copy/admin";
import { annualCopy } from "@/copy/annual";
import {
  approvedFigures,
  approvedLineTotal,
  decisionSchema,
  type DecisionInput,
  type DecisionKind,
} from "@/domain/annual/decision";
import { centsToInput } from "@/domain/annual/schema";
import { cn } from "@/lib/cn";
import { formatCAD, formatTaxRate, lineTotal, parseCAD, type TaxBreakdown } from "@/lib/money";
import { decideAction, reopenAction, startReviewAction } from "../actions";

const r = annualCopy.review;

const KINDS: readonly DecisionKind[] = [
  "approve_as_requested",
  "approve_different_amount",
  "approve_line_changes",
  "return",
  "decline",
];

const isApproval = (kind: DecisionKind) => kind.startsWith("approve_");

type Line = { id: string; name: string; quantity: number; unitPriceCents: number };
type LineInput = { quantity: string; unitPrice: string; reason: string };

const comparisonLabels = {
  requested: r.requested,
  approved: r.approved,
  difference: r.difference,
  less: r.differenceLess,
  more: r.differenceMore,
  none: r.differenceNone,
};

/** Opening the review screen starts the review (Submitted or Updated → In Review). */
export function StartReview({ id }: { id: string }) {
  const router = useRouter();
  useEffect(() => {
    void startReviewAction(id).then((moved) => {
      if (moved) router.refresh();
    });
  }, [id, router]);
  return null;
}

/**
 * The decision controls (FR-15 to FR-18, DRD 6.7), in the DRD's order. The figures shown
 * are worked out with the same `approvedFigures` the server uses; the server recalculates
 * them on confirm and ignores anything the browser totals.
 */
export function DecisionPanel({
  id,
  version,
  rate,
  requested,
  lines,
  board,
  secondThreshold = null,
}: {
  id: string;
  version: number;
  rate: string;
  requested: TaxBreakdown;
  lines: Line[];
  /** The cycle's board total and what's approved elsewhere, when one is set (4.2). */
  board?: { totalCents: number; allocatedCents: number } | null;
  /** FR-34: approvals at or above this total need a second sign-off. */
  secondThreshold?: number | null;
}) {
  const ids = useId();
  const [kind, setKind] = useState<DecisionKind>("approve_as_requested");
  const [approvedTotal, setApprovedTotal] = useState("");
  const [note, setNote] = useState("");
  const [boardReference, setBoardReference] = useState("");
  const [lineInputs, setLineInputs] = useState<LineInput[]>(() =>
    lines.map((l) => ({
      quantity: String(l.quantity),
      unitPrice: centsToInput(l.unitPriceCents),
      reason: "",
    })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [key, setKey] = useState("");
  const [pending, startTransition] = useTransition();

  const input = buildInput(kind, { approvedTotal, note, boardReference, lines, lineInputs });
  const parsed = decisionSchema.safeParse(input);
  // The live figures depend on the amounts only, so they show before the note is written.
  const amounts = isApproval(kind) ? decisionSchema.safeParse({ ...input, note: "-" }) : null;
  const figures = amounts?.success
    ? approvedFigures(lines, rate, amounts.data as Parameters<typeof approvedFigures>[2])
    : null;
  const approved = figures && "totals" in figures ? figures.totals : null;
  const overBoard = isApproval(kind) ? boardWarning(board, approved?.total) : null;
  const needsSecond =
    isApproval(kind) &&
    secondThreshold !== null &&
    approved !== null &&
    approved.total >= secondThreshold;
  const fieldId = (name: string) => `${ids}-${name.replaceAll(".", "-")}`;

  function review() {
    const found: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        found[issue.path.join(".") || "form"] ??= issue.message;
    } else if (figures && "error" in figures) {
      found.form = figures.error;
    }
    setErrors(found);
    setFormError(found.form ?? null);
    const first = Object.keys(found).find((k) => k !== "form");
    if (first) {
      document.getElementById(fieldId(first))?.focus();
      return;
    }
    if (found.form) return;
    setKey(crypto.randomUUID());
    setConfirming(true);
  }

  function confirm() {
    startTransition(async () => {
      const result = await decideAction({ id, version, idempotencyKey: key, decision: input });
      // Success redirects; only a refusal comes back.
      if (result?.status === "error") {
        setConfirming(false);
        setFormError(result.message);
        setErrors(result.fieldErrors ?? {});
      }
    });
  }

  const noteLabel =
    kind === "return"
      ? r.returnNote
      : kind === "decline"
        ? r.declineReason
        : kind === "approve_as_requested"
          ? r.noteOptional
          : r.noteRequired;

  return (
    <section aria-labelledby={`${ids}-heading`} className="space-y-5">
      <h2 id={`${ids}-heading`} className="text-lg font-semibold">
        {r.decisionHeading}
      </h2>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">{r.decisionLegend}</legend>
        {KINDS.map((k) => (
          <label
            key={k}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-control border p-3 transition-colors duration-fast",
              kind === k ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-hover",
            )}
          >
            <input
              type="radio"
              name={`${ids}-kind`}
              value={k}
              checked={kind === k}
              onChange={() => {
                setKind(k);
                setErrors({});
                setFormError(null);
              }}
              aria-describedby={`${ids}-${k}-hint`}
              className="mt-0.5 size-5 shrink-0 accent-accent"
            />
            <span className="space-y-0.5">
              <span className={cn("block text-sm font-medium", k === "decline" && "text-danger")}>
                {r.kinds[k]}
              </span>
              <span id={`${ids}-${k}-hint`} className="block text-xs text-fg-muted">
                {r.kindHints[k]}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {kind === "approve_different_amount" && (
        <Field
          id={fieldId("approvedTotal")}
          label={r.approvedTotal}
          hint={
            approved
              ? r.includesTax(
                  formatCAD(approved.tax),
                  formatTaxRate(rate),
                  formatCAD(approved.subtotal),
                )
              : r.approvedTotalHint
          }
          error={errors.approvedTotal}
        >
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-fg-muted"
            >
              $
            </span>
            <input
              id={fieldId("approvedTotal")}
              inputMode="decimal"
              autoComplete="off"
              value={approvedTotal}
              onChange={(e) => setApprovedTotal(e.target.value)}
              aria-invalid={errors.approvedTotal ? true : undefined}
              aria-describedby={`${fieldId("approvedTotal")}-hint${errors.approvedTotal ? ` ${fieldId("approvedTotal")}-error` : ""}`}
              className={cn(inputClass, "tabular pl-6 text-right")}
            />
          </div>
        </Field>
      )}

      {kind === "approve_line_changes" && (
        <LineEditor
          lines={lines}
          inputs={lineInputs}
          onChange={setLineInputs}
          errors={errors}
          fieldId={fieldId}
        />
      )}

      <Field id={fieldId("note")} label={noteLabel} error={errors.note}>
        <textarea
          id={fieldId("note")}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-invalid={errors.note ? true : undefined}
          aria-describedby={errors.note ? `${fieldId("note")}-error` : undefined}
          className={inputClass}
        />
      </Field>

      {isApproval(kind) && (
        <Field
          id={fieldId("boardReference")}
          label={r.boardReferenceOptional}
          hint={r.boardReferenceHint}
          error={errors.boardReference}
        >
          <input
            id={fieldId("boardReference")}
            autoComplete="off"
            value={boardReference}
            onChange={(e) => setBoardReference(e.target.value)}
            aria-describedby={`${fieldId("boardReference")}-hint`}
            className={inputClass}
          />
        </Field>
      )}

      {isApproval(kind) && (
        <ComparisonSummary
          requested={requested}
          approved={approved}
          rate={rate}
          labels={comparisonLabels}
        />
      )}
      {overBoard && <BoardWarning text={overBoard} />}

      {formError && (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {formError}
        </p>
      )}

      {/* The decision bar stays in reach while scrolling a long request on desktop (DRD 6.7). */}
      <div className="border-t border-border bg-surface pt-4 lg:sticky lg:bottom-0 lg:pb-4">
        <button
          type="button"
          onClick={review}
          className={buttonClass(kind === "decline" ? "danger" : "primary", "w-full sm:w-auto")}
        >
          {needsSecond
            ? annualCopy.second.approveLabel
            : kind === "approve_as_requested"
              ? r.kinds.approve_as_requested
              : r.reviewDecision}
        </button>
        {needsSecond && (
          <p className="mt-2 text-sm text-fg-muted">
            {annualCopy.second.needsSecond(formatCAD(secondThreshold!))}
          </p>
        )}
      </div>

      <AlertDialog.Root open={confirming} onOpenChange={(open) => !pending && setConfirming(open)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-(--z-overlay) bg-black/40" />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 z-(--z-overlay) max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 space-y-4 overflow-y-auto rounded-dialog border border-border bg-surface p-6 text-fg shadow-overlay">
            <AlertDialog.Title className="text-lg font-semibold">
              {isApproval(kind) ? r.confirm.approve : r.confirm[kind as "return" | "decline"]}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-fg-muted">
              {isApproval(kind)
                ? r.confirm.approveBody
                : kind === "return"
                  ? r.confirm.returnBody
                  : r.confirm.declineBody}
            </AlertDialog.Description>
            {isApproval(kind) && approved && (
              <ComparisonSummary
                requested={requested}
                approved={approved}
                rate={rate}
                labels={comparisonLabels}
              />
            )}
            {overBoard && <BoardWarning text={overBoard} />}
            {note.trim() && (
              <blockquote className="border-l-2 border-border pl-3 text-sm whitespace-pre-line">
                {note.trim()}
              </blockquote>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <AlertDialog.Cancel className={buttonClass("secondary")} disabled={pending}>
                {adminCopy.common.cancel}
              </AlertDialog.Cancel>
              <button
                type="button"
                onClick={confirm}
                disabled={pending}
                aria-busy={pending || undefined}
                className={buttonClass(kind === "decline" ? "danger" : "primary")}
              >
                {pending && (
                  <Loader2
                    className="size-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                )}
                {isApproval(kind)
                  ? r.confirm.approveButton
                  : kind === "return"
                    ? r.confirm.returnButton
                    : r.confirm.declineButton}
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </section>
  );
}

function buildInput(
  kind: DecisionKind,
  v: {
    approvedTotal: string;
    note: string;
    boardReference: string;
    lines: Line[];
    lineInputs: LineInput[];
  },
): DecisionInput {
  switch (kind) {
    case "approve_as_requested":
      return { kind, note: v.note, boardReference: v.boardReference };
    case "approve_different_amount":
      return {
        kind,
        approvedTotal: v.approvedTotal,
        note: v.note,
        boardReference: v.boardReference,
      };
    case "approve_line_changes":
      return {
        kind,
        note: v.note,
        boardReference: v.boardReference,
        lines: v.lines.map((l, i) => ({ lineId: l.id, ...v.lineInputs[i] })),
      };
    case "return":
    case "decline":
      return { kind, note: v.note };
  }
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-fg-muted" aria-live="polite">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** A typed approved line total for display: null until quantity and price are valid. */
function typedLineTotal(input: LineInput): number | null {
  const qty = input.quantity.trim().replaceAll(",", "");
  const price = parseCAD(input.unitPrice);
  if (!/^\d+$/.test(qty) || price === null || Number(qty) > 10_000) return null;
  return approvedLineTotal(Number(qty), price);
}

/**
 * Approved quantity and price per item, before tax (FR-15). Approved fields have the
 * accent tint; a changed value shows what was asked, struck through (DRD 6.7).
 */
function LineEditor({
  lines,
  inputs,
  onChange,
  errors,
  fieldId,
}: {
  lines: Line[];
  inputs: LineInput[];
  onChange: (next: LineInput[]) => void;
  errors: Record<string, string>;
  fieldId: (name: string) => string;
}) {
  const set = (i: number, patch: Partial<LineInput>) =>
    onChange(inputs.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  return (
    <ol className="divide-y divide-border rounded-control border border-border">
      {lines.map((line, i) => {
        const input = inputs[i];
        const total = typedLineTotal(input);
        const requestedTotal = lineTotal(line.quantity, line.unitPriceCents);
        const changed = total !== null && total !== requestedTotal;
        const qtyKey = `lines.${i}.quantity`;
        const priceKey = `lines.${i}.unitPrice`;
        return (
          <li key={line.id} className="space-y-3 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{line.name}</p>
              <p className="tabular text-xs text-fg-muted">
                {r.requested}: {line.quantity} × {formatCAD(line.unitPriceCents)} ={" "}
                <span className={cn(changed && "line-through")}>{formatCAD(requestedTotal)}</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-[6rem_9rem_1fr]">
              <div className="space-y-1">
                <label htmlFor={fieldId(qtyKey)} className="block text-xs font-medium">
                  <span aria-hidden="true">{r.columnsLines.qty}</span>
                  <span className="sr-only">{r.approvedQty(line.name)}</span>
                </label>
                <input
                  id={fieldId(qtyKey)}
                  inputMode="numeric"
                  autoComplete="off"
                  value={input.quantity}
                  onChange={(e) => set(i, { quantity: e.target.value })}
                  aria-invalid={errors[qtyKey] ? true : undefined}
                  className={cn(inputClass, "tabular bg-accent-soft text-right")}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={fieldId(priceKey)} className="block text-xs font-medium">
                  <span aria-hidden="true">{r.columnsLines.price}</span>
                  <span className="sr-only">{r.approvedPrice(line.name)}</span>
                </label>
                <input
                  id={fieldId(priceKey)}
                  inputMode="decimal"
                  autoComplete="off"
                  value={input.unitPrice}
                  onChange={(e) => set(i, { unitPrice: e.target.value })}
                  aria-invalid={errors[priceKey] ? true : undefined}
                  className={cn(inputClass, "tabular bg-accent-soft text-right")}
                />
              </div>
              <p className="col-span-2 self-end text-right text-sm sm:col-span-1">
                <span className="text-xs text-fg-muted">{r.columnsLines.total}: </span>
                <span className="tabular font-semibold">
                  {total === null ? "—" : total === 0 ? r.excluded : formatCAD(total)}
                </span>
              </p>
            </div>
            {(errors[qtyKey] || errors[priceKey]) && (
              <p className="text-sm text-danger">{errors[qtyKey] ?? errors[priceKey]}</p>
            )}
            {changed && (
              <div className="space-y-1">
                <label htmlFor={fieldId(`lines.${i}.reason`)} className="block text-xs font-medium">
                  {r.lineReason(line.name)}
                </label>
                <input
                  id={fieldId(`lines.${i}.reason`)}
                  autoComplete="off"
                  value={input.reason}
                  onChange={(e) => set(i, { reason: e.target.value })}
                  className={inputClass}
                />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Reopen an approved or declined budget, with a reason (FR-18a, DRD 6.7a). */
export function ReopenControl({ id, version }: { id: string; version: number }) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await reopenAction({ id, version, idempotencyKey: key, reason });
      if (result?.status === "error") {
        setError(result.fieldErrors?.reason ?? result.message);
      }
    });
  }

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) {
          setKey(crypto.randomUUID());
          setError(null);
        }
        setOpen(next);
      }}
    >
      <AlertDialog.Trigger className={buttonClass("secondary")}>{r.reopen}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-(--z-overlay) bg-black/40" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-(--z-overlay) w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-dialog border border-border bg-surface p-6 text-fg shadow-overlay">
          <AlertDialog.Title className="text-lg font-semibold">{r.reopenTitle}</AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-fg-muted">
            {r.reopenBody}
          </AlertDialog.Description>
          <div className="space-y-1.5">
            <label htmlFor={`${ids}-reason`} className="block text-sm font-medium">
              {r.reopenReason}
            </label>
            <textarea
              id={`${ids}-reason`}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${ids}-reason-error` : undefined}
              className={inputClass}
            />
            {error && (
              <p id={`${ids}-reason-error`} className="text-sm text-danger">
                {error}
              </p>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel className={buttonClass("secondary")} disabled={pending}>
              {adminCopy.common.cancel}
            </AlertDialog.Cancel>
            <button
              type="button"
              onClick={confirm}
              disabled={pending}
              aria-busy={pending || undefined}
              className={buttonClass("primary")}
            >
              {pending && (
                <Loader2
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
              {r.reopen}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/** DRD 6.7a: Warning style, and the approval still allowed. */
function BoardWarning({ text }: { text: string }) {
  return (
    <p
      role="note"
      className="flex items-start gap-2 rounded-control border border-warning p-3 text-sm"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      {text}
    </p>
  );
}
