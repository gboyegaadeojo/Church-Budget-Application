import { Suspense } from "react";
import type { Metadata } from "next";
import { Receipt } from "lucide-react";
import {
  AdminSkeleton,
  EmptyState,
  PageHeader,
  PermissionDenied,
  Section,
} from "@/components/ui/display";
import { expensesCopy } from "@/copy/expenses";
import { getDb } from "@/db";
import { hasListFilters, parseListFilters } from "@/domain/expenses/list-filters";
import { allExpenses } from "@/domain/expenses/review-queries";
import { EXPENSE_STATUSES } from "@/domain/expenses/status";
import { getViewer } from "@/lib/viewer";
import { ExpenseTable } from "../expense-table";
import { ExpenseFilterForm } from "../filter-form";

const a = expensesCopy.all;
const r = expensesCopy.review;

export const metadata: Metadata = { title: a.title };

/** Every submitted expense, with search and filters kept in the address (FR-48, DRD 6.0). */
export default function AllExpensesPage({ searchParams }: PageProps<"/expenses/all">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <AllExpensesContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AllExpensesContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseListFilters(await searchParams);
  const viewer = await getViewer();
  const list = await allExpenses(getDb(), viewer, filters);
  if (!list) return <PermissionDenied />;

  return (
    <>
      <PageHeader title={a.title} intro={list.readOnly ? a.introReadOnly : a.intro} />
      <Section title={r.listHeading} icon={Receipt} tone="teal">
        <ExpenseFilterForm
          basePath="/expenses/all"
          filters={filters}
          departments={list.departments}
          statuses={EXPENSE_STATUSES.filter((s) => s !== "draft")}
        />
        {list.rows.length === 0 ? (
          <EmptyState>{hasListFilters(filters) ? r.emptyFiltered : a.empty}</EmptyState>
        ) : (
          <ExpenseTable
            rows={list.rows}
            caption={a.title}
            extra={[{ header: a.payee, cell: (row) => row.payeeName ?? "" }]}
          />
        )}
      </Section>
    </>
  );
}
