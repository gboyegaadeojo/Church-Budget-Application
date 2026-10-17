import Link from "next/link";
import {
  AlertTriangle,
  CalendarRange,
  Hourglass,
  PiggyBank,
  Receipt,
  Wallet,
  Workflow,
} from "lucide-react";
import { DownloadButton } from "@/components/download-button";
import { EmptyState, StatCard } from "@/components/ui/display";
import { activityCopy } from "@/copy/activity";
import { expensesCopy } from "@/copy/expenses";
import { spendingCopy } from "@/copy/spending";
import { formatPercentTenths } from "@/domain/expenses/budget";
import type { SpendingOverview } from "@/domain/analytics/spending";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import { ChartCard, td, th } from "./chart-card";

const s = activityCopy.overview.spending;
const c = s.columns;
const status = spendingCopy.dashboard.status;

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Date(Date.UTC(2000, i, 15)).toLocaleString("en-CA", { month: "short", timeZone: "UTC" }),
);
const LONG_MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Date(Date.UTC(2000, i, 15)).toLocaleString("en-CA", { month: "long", timeZone: "UTC" }),
);

/** The Overview's spending and expense half (FR-52): headlines, then three charts. */
export function SpendingSection({ data }: { data: SpendingOverview }) {
  const { totals, cycle } = data.dashboard;
  return (
    <section aria-labelledby="spending-overview-heading" className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2
          id="spending-overview-heading"
          className="text-xl leading-tight font-semibold tracking-tight"
        >
          {activityCopy.overview.spendingHeading}
        </h2>
        {data.dashboard.canExport && (
          <DownloadButton
            href={`/api/exports/spending?cycle=${cycle.id}`}
            label={s.export}
            className="sm:ml-auto"
          />
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={s.available}
          value={formatCAD(totals.available)}
          icon={PiggyBank}
          tone="blue"
        >
          <p className="text-sm text-fg-muted">
            {s.availableFrom(formatCAD(totals.approved), formatCAD(totals.amendments))}
          </p>
        </StatCard>
        <StatCard label={s.spent} value={formatCAD(totals.spent)} icon={Receipt} tone="amber">
          <p className="text-sm text-fg-muted">{s.committed(formatCAD(totals.committed))}</p>
        </StatCard>
        <StatCard
          label={s.remaining}
          value={
            totals.remaining < 0
              ? expensesCopy.budget.overBy(formatCAD(-totals.remaining))
              : formatCAD(totals.remaining)
          }
          icon={Wallet}
          tone={totals.remaining < 0 ? "red" : "green"}
        >
          {totals.usedTenths !== null && (
            <p className="text-sm text-fg-muted">
              {s.used(formatPercentTenths(totals.usedTenths))}
            </p>
          )}
        </StatCard>
        <StatCard
          label={s.waiting}
          value={String(data.waiting.decision)}
          icon={Hourglass}
          tone="violet"
        >
          <p className="text-sm text-fg-muted">
            {s.waitingDetail(data.waiting.accountant, data.waiting.board, data.waiting.requester)}
          </p>
          <p className="text-sm text-fg-muted">
            {s.payment}: {data.waiting.payment}
          </p>
          <p className="text-sm text-fg-muted">
            {data.payments.averageDays === null
              ? s.noPayments
              : s.paymentDays(data.payments.averageDays, data.payments.paid)}
          </p>
        </StatCard>
      </div>
      <BudgetChart data={data} />
      <div className="grid gap-6 xl:grid-cols-2">
        <MonthsChart data={data} />
        <PipelineChart data={data} />
      </div>
    </section>
  );
}

/** Budget used by department: one series of bars; over budget adds an icon and words. */
function BudgetChart({ data }: { data: SpendingOverview }) {
  const { cycle } = data.dashboard;
  // Departments with no budget and no spending have nothing to show.
  const rows = data.dashboard.rows.filter(
    (r) => r.status !== "no_budget" || r.figures.spent !== 0 || r.figures.committed !== 0,
  );
  const over = rows.filter((r) => r.status === "over_budget").length;
  const near = rows.filter((r) => r.status === "nearing_limit").length;
  return (
    <ChartCard
      id="budget-actual"
      icon={PiggyBank}
      tone="green"
      title={s.budgetTitle(over, near)}
      table={
        <table className="w-full text-sm">
          <caption className="sr-only">{s.budgetCaption}</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className={th}>
                {c.department}
              </th>
              <th scope="col" className={`${th} text-right`}>
                {c.available}
              </th>
              <th scope="col" className={`${th} text-right`}>
                {c.spent}
              </th>
              <th scope="col" className={`${th} text-right`}>
                {c.remaining}
              </th>
              <th scope="col" className={`${th} text-right`}>
                {c.used}
              </th>
              <th scope="col" className={th}>
                {c.status}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.departmentId}>
                <th scope="row" className={`${td} text-left font-normal`}>
                  {r.department}
                </th>
                <td className={`${td} text-right tabular`}>{formatCAD(r.figures.available)}</td>
                <td className={`${td} text-right tabular`}>
                  {formatCAD(r.figures.spent + r.figures.committed)}
                </td>
                <td className={`${td} text-right tabular`}>
                  {r.figures.remaining < 0
                    ? s.overBy(formatCAD(-r.figures.remaining))
                    : formatCAD(r.figures.remaining)}
                </td>
                <td className={`${td} text-right tabular`}>
                  {r.usedTenths === null ? "—" : formatPercentTenths(r.usedTenths)}
                </td>
                <td className={td}>{status[r.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      {rows.length === 0 ? (
        <EmptyState>{s.noBudgets}</EmptyState>
      ) : (
        <ul aria-label={s.budgetCaption} className="space-y-1">
          {rows.map((r) => {
            const used = r.usedTenths ?? 0;
            const isOver = r.status === "over_budget";
            const words =
              r.usedTenths === null ? status[r.status] : formatPercentTenths(r.usedTenths);
            const label = `${r.department}: ${words}, ${status[r.status]}${
              isOver ? `, ${s.overBy(formatCAD(-r.figures.remaining))}` : ""
            }`;
            return (
              <li key={r.departmentId} title={label}>
                <Link
                  href={`/spending/departments/${r.departmentId}?cycle=${cycle.id}`}
                  aria-label={label}
                  className="grid grid-cols-[8rem_1fr_4.5rem] items-center gap-3 rounded-control py-1.5 text-sm hover:bg-surface-hover sm:grid-cols-[12rem_1fr_9rem]"
                >
                  <span className="truncate">{r.department}</span>
                  <span className="h-4 rounded-r-[4px] bg-surface-2" aria-hidden="true">
                    <span
                      className={cn(
                        "block h-full rounded-r-[4px]",
                        isOver ? "bg-danger" : "bg-chart-1",
                      )}
                      style={{ width: `${Math.min(100, Math.max(0, used / 10))}%` }}
                    />
                  </span>
                  <span
                    className={cn(
                      "flex items-center justify-end gap-1 text-right tabular",
                      isOver && "font-medium text-danger",
                    )}
                    aria-hidden="true"
                  >
                    {isOver && <AlertTriangle className="size-3.5 shrink-0" />}
                    <span className="truncate">
                      {isOver ? (
                        <>
                          <span className="sm:hidden">{words}</span>
                          <span className="hidden sm:inline">
                            {s.overBy(formatCAD(-r.figures.remaining))}
                          </span>
                        </>
                      ) : (
                        words
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}

/** Spending by month: this year as bars, last year as a tick, told apart by shape. */
function MonthsChart({ data }: { data: SpendingOverview }) {
  const { cycle } = data.dashboard;
  const max = Math.max(1, ...data.months.flatMap((m) => [m.cents, m.lastYearCents ?? 0]));
  const pct = (cents: number) => `${(Math.max(0, cents) / max) * 100}%`;
  const year = cycle.budgetYear;
  const lastDay = (m: number) => new Date(Date.UTC(year, m, 0)).getUTCDate();
  const range = (m: number) => {
    const mm = String(m).padStart(2, "0");
    return `from=${year}-${mm}-01&to=${year}-${mm}-${lastDay(m)}`;
  };
  return (
    <ChartCard
      id="months"
      icon={CalendarRange}
      tone="amber"
      title={s.monthsTitle(formatCAD(data.dashboard.totals.spent))}
      table={
        <table className="w-full text-sm">
          <caption className="sr-only">{s.monthsCaption}</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className={th}>
                {c.month}
              </th>
              <th scope="col" className={`${th} text-right`}>
                {c.thisYear}
              </th>
              {data.lastYear && (
                <th scope="col" className={`${th} text-right`}>
                  {c.lastYear}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.months.map((m) => (
              <tr key={m.month}>
                <th scope="row" className={`${td} text-left font-normal`}>
                  {LONG_MONTHS[m.month - 1]}
                </th>
                <td className={`${td} text-right tabular`}>{formatCAD(m.cents)}</td>
                {data.lastYear && (
                  <td className={`${td} text-right tabular`}>{formatCAD(m.lastYearCents ?? 0)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <p className="flex flex-wrap gap-4 text-sm text-fg-muted" aria-hidden="true">
        <span className="flex items-center gap-2">
          <span className="h-3 w-2 rounded-t-[2px] bg-chart-1" />
          {s.legendThisYear}
        </span>
        {data.lastYear ? (
          <span className="flex items-center gap-2">
            <span className="h-0.5 w-3 bg-fg" />
            {s.legendLastYear}
          </span>
        ) : (
          <span>{s.noLastYear}</span>
        )}
      </p>
      <ul aria-label={s.monthsCaption} className="grid h-40 grid-cols-12 items-end gap-1">
        {data.months.map((m) => {
          const label = `${LONG_MONTHS[m.month - 1]}: ${s.legendThisYear} ${formatCAD(m.cents)}${
            data.lastYear ? `, ${s.legendLastYear} ${formatCAD(m.lastYearCents ?? 0)}` : ""
          }`;
          return (
            <li key={m.month} title={label} className="flex h-full flex-col">
              <Link
                href={`/spending/ledger?cycle=${cycle.id}&${range(m.month)}`}
                aria-label={label}
                className="relative flex flex-1 items-end rounded-[4px] hover:bg-surface-hover"
              >
                <span
                  className="mx-auto block w-3/5 rounded-t-[4px] bg-chart-1"
                  style={{ height: pct(m.cents) }}
                  aria-hidden="true"
                />
                {m.lastYearCents !== null && (
                  <span
                    className="absolute inset-x-[10%] h-0.5 bg-fg ring-2 ring-surface"
                    style={{ bottom: pct(m.lastYearCents) }}
                    aria-hidden="true"
                  />
                )}
              </Link>
              <span className="pt-1 text-center text-[11px] text-fg-muted" aria-hidden="true">
                {MONTHS[m.month - 1].slice(0, 1)}
                <span className="hidden sm:inline">{MONTHS[m.month - 1].slice(1, 3)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </ChartCard>
  );
}

/** Expenses by status: counts as bars, with the amount beside each. */
function PipelineChart({ data }: { data: SpendingOverview }) {
  const rows = data.pipeline.filter((p) => p.count > 0);
  const total = rows.reduce((n, p) => n + p.count, 0);
  const max = Math.max(1, ...rows.map((p) => p.count));
  const labelOf = (st: (typeof rows)[number]["status"]) => expensesCopy.status[st].label;
  return (
    <ChartCard
      id="pipeline"
      icon={Workflow}
      tone="violet"
      title={s.pipelineTitle(total)}
      table={
        <table className="w-full text-sm">
          <caption className="sr-only">{s.pipelineCaption}</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className={th}>
                {c.expenseStatus}
              </th>
              <th scope="col" className={`${th} text-right`}>
                {c.count}
              </th>
              <th scope="col" className={`${th} text-right`}>
                {c.amount}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((p) => (
              <tr key={p.status}>
                <th scope="row" className={`${td} text-left font-normal`}>
                  {labelOf(p.status)}
                </th>
                <td className={`${td} text-right tabular`}>{p.count}</td>
                <td className={`${td} text-right tabular`}>{formatCAD(p.cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      {rows.length === 0 ? (
        <EmptyState>{s.noExpenses}</EmptyState>
      ) : (
        <ul aria-label={s.pipelineCaption} className="space-y-1">
          {rows.map((p) => {
            const label = `${labelOf(p.status)}: ${p.count}, ${formatCAD(p.cents)}`;
            const row = (
              <span className="grid grid-cols-[8rem_1fr_6rem] items-center gap-3 text-sm sm:grid-cols-[10rem_1fr_8rem]">
                <span className="truncate">{labelOf(p.status)}</span>
                <span className="h-4 rounded-r-[4px] bg-surface-2" aria-hidden="true">
                  <span
                    className="block h-full rounded-r-[4px] bg-chart-1"
                    style={{ width: `${(p.count / max) * 100}%` }}
                  />
                </span>
                <span className="truncate text-right tabular" aria-hidden="true">
                  {p.count} · {formatCAD(p.cents)}
                </span>
              </span>
            );
            return (
              <li key={p.status} title={label}>
                {data.canListExpenses ? (
                  <Link
                    href={`/expenses/all?status=${p.status}`}
                    aria-label={label}
                    className="block rounded-control py-1.5 hover:bg-surface-hover"
                  >
                    {row}
                  </Link>
                ) : (
                  <span className="block py-1.5" role="img" aria-label={label}>
                    {row}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}
