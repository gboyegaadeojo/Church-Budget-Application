import { AlertTriangle, PiggyBank } from "lucide-react";
import { IconChip } from "@/components/ui/display";
import { cardClass } from "@/components/ui/styles";
import { TONE, type Tone } from "@/components/ui/tone";
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
  const items: { label: string; value: React.ReactNode; tone: Tone; strong?: boolean }[] = [
    { label: b.available, value: formatCAD(figures.available), tone: "blue" },
    { label: b.committed, value: formatCAD(figures.committed), tone: "amber" },
    ...(showPending
      ? [{ label: b.pending, value: formatCAD(figures.pending), tone: "violet" as Tone }]
      : []),
    { label: b.spent, value: formatCAD(figures.spent), tone: "pink" },
    {
      label: b.remaining,
      value: <RemainingText cents={figures.remaining} />,
      tone: figures.remaining < 0 ? "red" : "green",
      strong: true,
    },
  ];
  // How much of Available is spoken for: a picture only, the figures carry the meaning.
  const used =
    figures.available > 0
      ? Math.min(100, Math.max(0, ((figures.committed + figures.spent) / figures.available) * 100))
      : 0;
  return (
    <section
      aria-label={`${b.heading}: ${department}`}
      className={cn(cardClass, "space-y-4 p-5 sm:p-5", className)}
    >
      <div className="flex flex-wrap items-center gap-3">
        <IconChip icon={PiggyBank} tone="green" size="sm" />
        <p className="min-w-0 flex-1 text-[17px] font-semibold tracking-tight">
          {department} · {b.heading}
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <div
          className={cn("h-full rounded-full", figures.remaining < 0 ? "bg-danger" : TONE.blue.bar)}
          style={{ width: `${used}%` }}
        />
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((item) => (
          <div key={item.label} className={cn("rounded-[12px] px-3 py-2.5", TONE[item.tone].soft)}>
            <dt className={cn("text-xs font-semibold", TONE[item.tone].text)}>{item.label}</dt>
            <dd className={cn("tabular", item.strong ? "font-bold" : "font-semibold")}>
              {item.value}
            </dd>
          </div>
        ))}
        {after !== undefined && (
          <div
            className={cn(
              "rounded-[12px] border-2 px-3 py-2",
              after < 0 ? "border-danger" : "border-accent",
            )}
          >
            <dt className="text-xs font-semibold text-fg-muted">{b.remainingAfter}</dt>
            <dd className="tabular font-bold" aria-live="polite">
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
