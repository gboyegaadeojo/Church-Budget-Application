import { AlertTriangle } from "lucide-react";
import { expensesCopy } from "@/copy/expenses";
import type { BudgetFigures } from "@/domain/expenses/budget";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";

const b = expensesCopy.budget;

/** A Remaining figure: below zero reads "Over budget by $X", never a bare minus (FR-43). */
export function RemainingText({ cents }: { cents: number }) {
  return cents < 0 ? (
    <span className="text-danger">{b.overBy(formatCAD(-cents))}</span>
  ) : (
    <span>{formatCAD(cents)}</span>
  );
}

/**
 * The budget strip (DRD 6.9a): Available · Committed · Spent · Remaining for the
 * department, then "Remaining after this" once an amount is known. Over budget shows a
 * warning with an icon and words, not colour alone. The figures come from the server;
 * `after` is worked out with money.ts in the caller.
 */
export function BudgetStrip({
  department,
  figures,
  after,
  showPending = true,
  className,
}: {
  department: string;
  figures: BudgetFigures;
  /** Remaining once this expense is charged; omitted when nothing is entered yet. */
  after?: number;
  showPending?: boolean;
  className?: string;
}) {
  const items = [
    { label: b.available, value: formatCAD(figures.available) },
    { label: b.committed, value: formatCAD(figures.committed) },
    ...(showPending ? [{ label: b.pending, value: formatCAD(figures.pending) }] : []),
    { label: b.spent, value: formatCAD(figures.spent) },
  ];
  return (
    <section
      aria-label={`${b.heading}: ${department}`}
      className={cn("space-y-3 rounded-card border border-border bg-surface-2 p-4", className)}
    >
      <p className="text-sm font-semibold">{department}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:flex sm:flex-wrap sm:gap-x-6">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-xs text-fg-muted">{item.label}</dt>
            <dd className="tabular font-medium">{item.value}</dd>
          </div>
        ))}
        <div>
          <dt className="text-xs text-fg-muted">{b.remaining}</dt>
          <dd className="tabular font-semibold">
            <RemainingText cents={figures.remaining} />
          </dd>
        </div>
        {after !== undefined && (
          <div>
            <dt className="text-xs text-fg-muted">{b.remainingAfter}</dt>
            <dd className="tabular font-semibold" aria-live="polite">
              <RemainingText cents={after} />
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

/** "This takes Media over budget by $X…" (FR-43), with the requester's explanation. */
export function OverBudgetWarning({
  department,
  overBy,
  explanation,
  explanationLabel,
  message,
}: {
  department: string;
  overBy: number;
  explanation?: string | null;
  explanationLabel?: string;
  /** Overrides the requester's wording, e.g. on the approvers' screens. */
  message?: string;
}) {
  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-control border border-danger p-3 text-sm"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-medium">{message ?? b.overWarning(department, formatCAD(overBy))}</p>
        {explanation && (
          <p className="whitespace-pre-line">
            {explanationLabel && <span className="text-fg-muted">{explanationLabel}: </span>}
            {explanation}
          </p>
        )}
      </div>
    </div>
  );
}
