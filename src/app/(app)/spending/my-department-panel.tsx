import Link from "next/link";
import { PiggyBank, Undo2 } from "lucide-react";
import { Badge, EmptyState, Section } from "@/components/ui/display";
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
 * The requester's read-only budget panel (DRD 6.2a, FR-28): the figures, a used bar with
 * its status in words, and the spending entries without payment method or reference.
 * `limit` shows only the latest entries, with a link to the full page.
 */
export function MyDepartmentPanel({
  budget,
  cycleId,
  limit,
}: {
  budget: MyDepartmentBudget;
  cycleId: string;
  limit?: number;
}) {
  const f = budget.figures;
  const title = m.panelTitle(budget.department);
  const entries = limit === undefined ? budget.entries : budget.entries.slice(0, limit);
  const id = `my-budget-${budget.departmentId}`;
  return (
    <Section title={title} id={id} icon={PiggyBank} tone="green">
      {budget.status === "no_budget" && budget.entries.length === 0 ? (
        <EmptyState>{m.notApproved}</EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={STATUS_TONE[budget.status]}>{d.status[budget.status]}</Badge>
            <div className="min-w-48 flex-1">
              <UsedBar tenths={budget.usedTenths} status={budget.status} />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm lg:grid-cols-6">
            {[
              [d.approved, formatCAD(f.approved)],
              [d.amendments, f.amendments === 0 ? d.none : formatCAD(f.amendments)],
              [d.available, formatCAD(f.available)],
              [d.committed, formatCAD(f.committed)],
              [d.spent, formatCAD(f.spent)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-fg-muted">{label}</dt>
                <dd className="tabular font-semibold">{value}</dd>
              </div>
            ))}
            <div>
              <dt className="text-fg-muted">{d.remaining}</dt>
              <dd className="tabular font-semibold">
                <Remaining cents={f.remaining} />
              </dd>
            </div>
          </dl>

          <h3 className="text-base font-semibold">{m.entries}</h3>
          {entries.length === 0 ? (
            <EmptyState>{m.noEntries}</EmptyState>
          ) : (
            <div
              className="-mx-1 overflow-x-auto px-1"
              tabIndex={0}
              role="region"
              aria-label={`${title}: ${m.entries}`}
            >
              <table className="w-full min-w-[32rem] text-left text-sm">
                <caption className="sr-only">{`${title}: ${m.entries}`}</caption>
                <thead className="border-b border-border text-[11px] tracking-wide text-fg-muted uppercase">
                  <tr>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {m.columns.date}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {m.columns.payee}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {m.columns.description}
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      {m.columns.amount}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entries.map((e) => (
                    <tr key={e.id} className={cn(e.voided && "text-fg-muted")}>
                      <td className="tabular py-2.5 pr-4 align-top whitespace-nowrap">
                        {formatDate(e.spentOn)}
                      </td>
                      <td className="py-2.5 pr-4 align-top">{e.payee}</td>
                      <td className="py-2.5 pr-4 align-top">
                        {e.description}
                        {(e.voided || e.entryType === "refund") && (
                          <span className="ml-2 inline-flex gap-1">
                            {e.entryType === "refund" && <Badge tone="info">{m.refund}</Badge>}
                            {e.voided && <Badge tone="neutral">{m.voided}</Badge>}
                          </span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "tabular py-2.5 text-right align-top whitespace-nowrap",
                          e.voided && "line-through",
                        )}
                      >
                        {e.entryType === "refund" && (
                          <Undo2 className="mr-1 inline size-3.5" aria-hidden="true" />
                        )}
                        {formatCAD(e.entryType === "refund" ? -e.amountCents : e.amountCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {limit !== undefined && budget.entries.length > limit && (
            <p className="text-sm text-fg-muted">
              {m.latest(limit, budget.entries.length)}{" "}
              <Link href={`/spending/my-department?cycle=${cycleId}`} className={linkClass}>
                {m.seeAll}
              </Link>
            </p>
          )}
        </>
      )}
    </Section>
  );
}
