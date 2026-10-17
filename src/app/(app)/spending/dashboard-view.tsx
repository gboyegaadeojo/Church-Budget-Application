import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  CalendarCheck,
  Lock,
  PiggyBank,
  Plus,
  Receipt,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { DownloadButton } from "@/components/download-button";
import { Badge, EmptyState, PageHeader, Section, StatCard } from "@/components/ui/display";
import { buttonClass, cardClass, inputClass, linkClass } from "@/components/ui/styles";
import { expensesCopy } from "@/copy/expenses";
import { spendingCopy } from "@/copy/spending";
import { formatPercentTenths, type BudgetStatus } from "@/domain/expenses/budget";
import type { Dashboard } from "@/domain/spending/dashboard";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/time-zone";

const d = spendingCopy.dashboard;

export const STATUS_TONE: Record<BudgetStatus, "success" | "warning" | "danger" | "neutral"> = {
  on_track: "success",
  nearing_limit: "warning",
  over_budget: "danger",
  no_budget: "neutral",
};

/** "Over budget by $X", never a bare minus sign (FR-25). */
export function Remaining({ cents }: { cents: number }) {
  return cents < 0 ? (
    <span className="font-medium text-danger">{expensesCopy.budget.overBy(formatCAD(-cents))}</span>
  ) : (
    <>{formatCAD(cents)}</>
  );
}

/** A bar with its percentage in words, never colour alone (DRD 6.8). */
export function UsedBar({ tenths, status }: { tenths: number | null; status: BudgetStatus }) {
  if (tenths === null) return <span className="text-fg-muted">{d.noUse}</span>;
  const width = Math.max(0, Math.min(100, tenths / 10));
  return (
    <div className="flex min-w-32 items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <div
          className={cn(
            "h-full rounded-full",
            status === "over_budget"
              ? "bg-danger"
              : status === "nearing_limit"
                ? "bg-warning"
                : "bg-success",
          )}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="tabular text-xs">{formatPercentTenths(tenths)}</span>
    </div>
  );
}

export function DashboardView({
  dashboard,
  basePath,
  title,
  intro,
  zone,
}: {
  dashboard: Dashboard;
  basePath: string;
  title: string;
  intro: string;
  zone: string;
}) {
  const { cycle, totals, rows } = dashboard;
  const warnings = rows.filter((r) => r.status === "nearing_limit" || r.status === "over_budget");
  return (
    <>
      <PageHeader title={title} intro={intro}>
        <div className="ml-auto flex flex-wrap gap-2">
          {dashboard.canExport && cycle && (
            <DownloadButton href={`/api/exports/spending?cycle=${cycle.id}`} label={d.export} />
          )}
          {dashboard.canLock && cycle && (
            <Link
              href={`/spending/year-end?cycle=${cycle.id}`}
              className={buttonClass("secondary")}
            >
              <CalendarCheck className="size-4" aria-hidden="true" />
              {spendingCopy.yearEnd.link}
            </Link>
          )}
          {dashboard.canRecord && cycle && !cycle.locked && (
            <Link href={`/spending/record?cycle=${cycle.id}`} className={buttonClass("primary")}>
              <Plus className="size-4" aria-hidden="true" />
              {d.record}
            </Link>
          )}
        </div>
      </PageHeader>

      {dashboard.cycles.length > 1 && (
        <form method="get" action={basePath} className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label htmlFor="dashboard-cycle" className="block text-sm font-medium">
              {d.cycle}
            </label>
            <select
              id="dashboard-cycle"
              name="cycle"
              defaultValue={cycle?.id ?? ""}
              className={cn(inputClass, "w-48")}
            >
              {dashboard.cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={buttonClass("secondary")}>
            {d.show}
          </button>
        </form>
      )}

      {!cycle ? (
        <EmptyState>{d.noCycle}</EmptyState>
      ) : (
        <>
          {cycle.locked && cycle.lockedAt && (
            <p
              role="status"
              className={cn(cardClass, "flex items-center gap-3 border-warning p-4 text-sm sm:p-4")}
            >
              <Lock className="size-5 shrink-0 text-warning" aria-hidden="true" />
              {d.locked(formatDateTime(cycle.lockedAt, zone))}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={d.available}
              value={formatCAD(totals.available)}
              icon={PiggyBank}
              tone="blue"
            >
              <p className="text-sm text-fg-muted">
                {d.approved} {formatCAD(totals.approved)}
                {totals.amendments !== 0 && ` · ${d.amendments} ${formatCAD(totals.amendments)}`}
              </p>
            </StatCard>
            <StatCard label={d.spent} value={formatCAD(totals.spent)} icon={Receipt} tone="amber">
              <p className="text-sm text-fg-muted">
                {d.committed} {formatCAD(totals.committed)}
              </p>
            </StatCard>
            <StatCard
              label={d.remaining}
              value={<Remaining cents={totals.remaining} />}
              icon={Wallet}
              tone={totals.remaining < 0 ? "red" : "green"}
            />
            <StatCard
              label={d.used}
              value={totals.usedTenths === null ? d.noUse : formatPercentTenths(totals.usedTenths)}
              icon={TrendingDown}
              tone="slate"
            />
          </div>

          {warnings.length > 0 && (
            <ul
              className={cn(cardClass, "space-y-2 border-warning text-sm")}
              aria-label={d.status.nearing_limit}
            >
              {warnings.map((w) => (
                <li key={w.departmentId} className="flex items-start gap-2">
                  <AlertTriangle
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      w.status === "over_budget" ? "text-danger" : "text-warning",
                    )}
                    aria-hidden="true"
                  />
                  {w.status === "over_budget"
                    ? d.warningOver(w.department, formatCAD(-w.figures.remaining))
                    : d.warningNear(w.department)}
                </li>
              ))}
            </ul>
          )}

          <Section
            title={d.departments}
            icon={BookOpen}
            tone="amber"
            actions={
              <Link href={`/spending/ledger?cycle=${cycle.id}`} className={linkClass}>
                {d.ledger}
              </Link>
            }
          >
            {rows.length === 0 ? (
              <EmptyState>{d.empty}</EmptyState>
            ) : (
              <div
                className="-mx-1 overflow-x-auto px-1"
                tabIndex={0}
                role="region"
                aria-label={d.departments}
              >
                <table className="w-full min-w-[60rem] text-left text-sm">
                  <caption className="sr-only">{d.departments}</caption>
                  <thead className="border-b border-border text-[11px] tracking-wide text-fg-muted uppercase">
                    <tr>
                      <th scope="col" className="py-2 pr-4 font-medium">
                        {d.columns.department}
                      </th>
                      {[
                        d.columns.approved,
                        d.columns.amendments,
                        d.columns.available,
                        d.columns.committed,
                        d.columns.spent,
                        d.columns.remaining,
                      ].map((h) => (
                        <th key={h} scope="col" className="py-2 pr-4 text-right font-medium">
                          {h}
                        </th>
                      ))}
                      <th scope="col" className="py-2 pr-4 font-medium">
                        {d.columns.used}
                      </th>
                      <th scope="col" className="py-2 pr-4 font-medium">
                        {d.columns.status}
                      </th>
                      <th scope="col" className="py-2 font-medium">
                        {d.columns.last}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((row) => (
                      <tr key={row.departmentId} className="hover:bg-surface-hover">
                        <td className="py-2.5 pr-4 align-top">
                          <Link
                            href={`/spending/departments/${row.departmentId}?cycle=${cycle.id}`}
                            className={linkClass}
                          >
                            {row.department}
                          </Link>
                          {row.unbudgetedCents !== 0 && (
                            <span className="mt-1 block">
                              <Badge tone="warning">
                                {d.unbudgeted(formatCAD(row.unbudgetedCents))}
                              </Badge>
                            </span>
                          )}
                        </td>
                        <td className="tabular py-2.5 pr-4 text-right align-top">
                          {formatCAD(row.figures.approved)}
                        </td>
                        <td className="tabular py-2.5 pr-4 text-right align-top">
                          {row.figures.amendments === 0
                            ? d.none
                            : formatCAD(row.figures.amendments)}
                        </td>
                        <td className="tabular py-2.5 pr-4 text-right align-top">
                          {formatCAD(row.figures.available)}
                        </td>
                        <td className="tabular py-2.5 pr-4 text-right align-top">
                          {formatCAD(row.figures.committed)}
                        </td>
                        <td className="tabular py-2.5 pr-4 text-right align-top">
                          {formatCAD(row.figures.spent)}
                        </td>
                        <td className="tabular py-2.5 pr-4 text-right align-top">
                          <Remaining cents={row.figures.remaining} />
                        </td>
                        <td className="py-2.5 pr-4 align-top">
                          <UsedBar tenths={row.usedTenths} status={row.status} />
                        </td>
                        <td className="py-2.5 pr-4 align-top">
                          <Badge tone={STATUS_TONE[row.status]}>{d.status[row.status]}</Badge>
                        </td>
                        <td className="py-2.5 align-top whitespace-nowrap">
                          {row.lastEntryOn ? formatDate(row.lastEntryOn) : d.none}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </>
  );
}
