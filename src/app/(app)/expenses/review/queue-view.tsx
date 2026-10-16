import { AlertTriangle, Clock, Inbox, Wallet } from "lucide-react";
import { EmptyState, PageHeader, Section, StatCard } from "@/components/ui/display";
import { buttonClass, inputClass } from "@/components/ui/styles";
import { expensesCopy } from "@/copy/expenses";
import type { Queue, QueueFilters, QueueRow } from "@/domain/expenses/review-queries";
import { EXPENSE_TYPES, type ExpenseStatus } from "@/domain/expenses/status";
import { formatCAD } from "@/lib/money";
import { ExpenseTable } from "../expense-table";

const r = expensesCopy.review;

/**
 * An approver's queue (FR-48, DRD 6.9a): headline figures, filters kept in the address
 * (DRD 6.0), and the list with days waiting and over-budget flags in words and icons.
 */
export function QueueView({
  title,
  intro,
  queue,
  filters,
  statuses,
  basePath,
}: {
  title: string;
  intro: string;
  queue: Queue;
  filters: QueueFilters;
  statuses: readonly ExpenseStatus[];
  basePath: string;
}) {
  const waiting = queue.rows.filter((row) => row.canDecide);
  const filtered = Object.values(filters).some(Boolean);
  return (
    <>
      <PageHeader title={title} intro={intro} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={r.stats.waiting}
          value={waiting.length}
          icon={Inbox}
          tone="teal"
          emphasis={waiting.length > 0}
        />
        <StatCard
          label={r.stats.total}
          value={formatCAD(queue.waitingCents)}
          icon={Wallet}
          tone="blue"
        />
        <StatCard
          label={r.stats.overBudget}
          value={queue.overBudgetCount}
          icon={AlertTriangle}
          tone={queue.overBudgetCount > 0 ? "red" : "slate"}
        />
        <StatCard
          label={r.stats.oldest}
          value={queue.oldestDays === null ? r.stats.none : r.stats.days(queue.oldestDays)}
          icon={Clock}
          tone="amber"
        />
      </div>

      <Section title={r.listHeading} icon={Inbox} tone="teal">
        <form
          method="get"
          action={basePath}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end"
        >
          <Select
            name="department"
            label={r.filters.department}
            value={filters.department}
            options={queue.departments.map((d) => ({ value: d.id, label: d.name }))}
          />
          <Select
            name="type"
            label={r.filters.type}
            value={filters.type}
            options={EXPENSE_TYPES.map((t) => ({ value: t, label: expensesCopy.types[t] }))}
          />
          <Select
            name="status"
            label={r.filters.status}
            value={filters.status}
            options={statuses.map((s) => ({ value: s, label: expensesCopy.status[s].label }))}
          />
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="overBudget"
              value="yes"
              defaultChecked={filters.overBudget === "yes"}
              className="size-5 accent-accent"
            />
            {r.filters.overBudget}
          </label>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("secondary")}>
              {r.filters.apply}
            </button>
            {filtered && (
              <a href={basePath} className={buttonClass("ghost")}>
                {r.filters.clear}
              </a>
            )}
          </div>
        </form>

        {queue.rows.length === 0 ? (
          <EmptyState>{filtered ? r.emptyFiltered : r.empty}</EmptyState>
        ) : (
          <ExpenseTable
            rows={queue.rows}
            caption={title}
            href={(row) => `${basePath}/${row.id}`}
            extra={[
              {
                header: r.columns.waiting,
                cell: (row) => r.stats.days((row as QueueRow).daysWaiting),
                align: "right",
              },
              { header: r.columns.flags, cell: (row) => <Flags row={row as QueueRow} /> },
            ]}
          />
        )}
      </Section>
    </>
  );
}

function Flags({ row }: { row: QueueRow }) {
  return (
    <span className="flex flex-col gap-1 text-xs">
      {row.overBy > 0 && (
        <span className="inline-flex items-center gap-1 text-danger">
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          {r.overBudgetFlag} · {formatCAD(row.overBy)}
        </span>
      )}
      {!row.canDecide && <span className="text-fg-muted">{r.yoursFlag}</span>}
    </span>
  );
}

function Select({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value?: string;
  options: { value: string; label: string }[];
}) {
  const id = `filter-${name}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <select id={id} name={name} defaultValue={value ?? ""} className={inputClass}>
        <option value="">{r.filters.any}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The filters from the address, as plain strings. */
export function filtersFrom(query: Record<string, string | string[] | undefined>): QueueFilters {
  const one = (key: string) =>
    typeof query[key] === "string" ? (query[key] as string) : undefined;
  return {
    department: one("department") || undefined,
    type: one("type") || undefined,
    status: one("status") || undefined,
    overBudget: one("overBudget") || undefined,
  };
}
