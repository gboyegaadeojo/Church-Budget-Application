import { AlertTriangle, Clock, Inbox, Wallet } from "lucide-react";
import { EmptyState, PageHeader, Section, StatCard } from "@/components/ui/display";
import { expensesCopy } from "@/copy/expenses";
import { hasListFilters } from "@/domain/expenses/list-filters";
import type { Queue, QueueFilters, QueueRow } from "@/domain/expenses/review-queries";
import type { ExpenseStatus } from "@/domain/expenses/status";
import { formatCAD } from "@/lib/money";
import { ExpenseTable } from "../expense-table";
import { ExpenseFilterForm } from "../filter-form";

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
  const filtered = hasListFilters(filters);
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
        <ExpenseFilterForm
          basePath={basePath}
          filters={filters}
          departments={queue.departments}
          statuses={statuses}
          overBudget
        />

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
