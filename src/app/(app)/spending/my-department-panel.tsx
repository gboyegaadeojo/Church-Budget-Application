import Link from "next/link";
import { Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/display";
import { linkClass } from "@/components/ui/styles";
import { spendingCopy } from "@/copy/spending";
import type { MyDepartmentBudget } from "@/domain/spending/my-department";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import { formatDate } from "@/lib/time-zone";
import { Remaining, STATUS_TONE, UsedBar } from "./dashboard-view";

const d = spendingCopy.dashboard;
const m = spendingCopy.mine;

/**
 * The requester's read-only budget panel (DRD 6.2a, FR-28): what's left first, a used bar
 * with its status in words, the figures behind it in one strip, and the spending entries
 * as slim rows, without payment method or reference. `limit` shows only the latest
 * entries, with a link to the full page.
 */
export function MyDepartmentPanel({
  budget,
  cycleId,
  cycleName,
  limit,
}: {
  budget: MyDepartmentBudget;
  cycleId: string;
  cycleName: string;
  limit?: number;
}) {
  const f = budget.figures;
  const title = m.panelTitle(budget.department);
  const entries = limit === undefined ? budget.entries : budget.entries.slice(0, limit);
  const id = `my-budget-${budget.departmentId}`;
  return (
    <section
      aria-labelledby={`${id}-heading`}
      id={id}
      className="overflow-hidden rounded-card border border-border bg-surface shadow-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 sm:px-6">
        <div className="min-w-0">
          <h2
            id={`${id}-heading`}
            className="text-[17px] leading-tight font-semibold tracking-tight"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">{cycleName}</p>
        </div>
        <Badge tone={STATUS_TONE[budget.status]}>{d.status[budget.status]}</Badge>
      </div>

      {budget.status === "no_budget" && budget.entries.length === 0 ? (
        <p className="border-t border-border px-5 py-4 text-sm text-fg-muted sm:px-6">
          {m.notApproved}
        </p>
      ) : (
        <>
          <div className="space-y-3 px-5 pb-5 sm:px-6">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm text-fg-muted">{d.remaining}</span>
              <span className="tabular text-3xl font-semibold tracking-tight">
                <Remaining cents={f.remaining} />
              </span>
              <span className="text-sm text-fg-muted">{m.ofAvailable(formatCAD(f.available))}</span>
            </p>
            <UsedBar tenths={budget.usedTenths} status={budget.status} />
          </div>

          <dl className="grid grid-cols-2 border-t border-border sm:grid-cols-4">
            {[
              [d.approved, formatCAD(f.approved)],
              [d.amendments, f.amendments === 0 ? d.none : formatCAD(f.amendments)],
              [d.committed, formatCAD(f.committed)],
              [d.spent, formatCAD(f.spent)],
            ].map(([label, value], i) => (
              <div
                key={label}
                className={cn(
                  "px-5 py-3 sm:px-6",
                  i % 2 === 1 && "border-l border-border",
                  i >= 2 && "border-t border-border sm:border-t-0",
                  i === 2 && "sm:border-l",
                )}
              >
                <dt className="text-xs text-fg-muted">{label}</dt>
                <dd className="tabular mt-0.5 font-semibold">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="border-t border-border">
            <h3 className="px-5 pt-4 pb-2 text-sm font-semibold sm:px-6">{m.entries}</h3>
            {entries.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-fg-muted sm:px-6">{m.noEntries}</p>
            ) : (
              <ul aria-label={`${title}: ${m.entries}`}>
                {entries.map((e) => (
                  <li
                    key={e.id}
                    className={cn(
                      "flex items-start gap-4 border-t border-border px-5 py-3 text-sm sm:px-6",
                      e.voided && "text-fg-muted",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {e.payee}
                        {e.entryType === "refund" && (
                          <span className="ml-2">
                            <Badge tone="info">{m.refund}</Badge>
                          </span>
                        )}
                        {e.voided && (
                          <span className="ml-2">
                            <Badge tone="neutral">{m.voided}</Badge>
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-fg-muted">
                        <span className="tabular">{formatDate(e.spentOn)}</span>
                        {e.description ? ` · ${e.description}` : ""}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "tabular shrink-0 font-semibold whitespace-nowrap",
                        e.voided && "line-through",
                      )}
                    >
                      {e.entryType === "refund" && (
                        <Undo2 className="mr-1 inline size-3.5" aria-hidden="true" />
                      )}
                      {formatCAD(e.entryType === "refund" ? -e.amountCents : e.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {limit !== undefined && budget.entries.length > limit && (
              <p className="border-t border-border px-5 py-3 text-sm text-fg-muted sm:px-6">
                {m.latest(limit, budget.entries.length)}{" "}
                <Link href={`/spending/my-department?cycle=${cycleId}`} className={linkClass}>
                  {m.seeAll}
                </Link>
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
