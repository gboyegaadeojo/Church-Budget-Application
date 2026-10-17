import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PiggyBank, Plus, Receipt } from "lucide-react";
import {
  AdminSkeleton,
  EmptyState,
  PageHeader,
  PermissionDenied,
  Section,
} from "@/components/ui/display";
import { buttonClass, linkClass } from "@/components/ui/styles";
import { expensesCopy } from "@/copy/expenses";
import { getDb } from "@/db";
import {
  listMyExpenses,
  myDepartmentBudgets,
  type ExpenseListRow,
} from "@/domain/expenses/queries";
import { hasListFilters, parseListFilters } from "@/domain/expenses/list-filters";
import { EXPENSE_STATUSES } from "@/domain/expenses/status";
import { hasRole } from "@/lib/roles";
import { getViewer } from "@/lib/viewer";
import { BudgetStrip } from "../budget-strip";
import { ExpenseTable } from "../expense-table";
import { ExpenseFilterForm } from "../filter-form";

const m = expensesCopy.mine;

export const metadata: Metadata = { title: m.title };

/** The requester's expenses and their departments' budgets (FR-48, DRD 6.9a). */
export default function MyExpensesPage({ searchParams }: PageProps<"/expenses/mine">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <MyExpensesContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** What the department needs to do next, in words. */
function needs(row: ExpenseListRow): string {
  if (row.status === "draft") return m.needs.draft;
  if (row.status === "returned") return m.needs.returned;
  if (
    row.type === "purchase_request" &&
    row.status === "approved" &&
    row.howBought === "requester_claims"
  ) {
    return m.needs.approvedPurchase;
  }
  return expensesCopy.status[row.status].explain;
}

async function MyExpensesContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseListFilters(await searchParams);
  const filtered = hasListFilters(filters);
  const viewer = await getViewer();
  const submitter = (viewer.expenseDepartments?.length ?? 0) > 0;
  if (!hasRole(viewer, "requester") && !submitter) return <PermissionDenied />;
  const db = getDb();
  const [rows, budgets] = await Promise.all([
    listMyExpenses(db, viewer, filters),
    myDepartmentBudgets(db, viewer),
  ]);
  // Things waiting for the department come first.
  const first = (r: ExpenseListRow) => (r.status === "returned" || r.status === "draft" ? 0 : 1);
  const sorted = [...rows].sort((a, b) => first(a) - first(b));

  return (
    <>
      <PageHeader title={m.title} intro={m.intro}>
        <Link href="/expenses/new" className={buttonClass("primary", "ml-auto")}>
          <Plus className="size-4" aria-hidden="true" />
          {m.newExpense}
        </Link>
      </PageHeader>

      {budgets.length > 0 && (
        <Section title={m.budgets} icon={PiggyBank} tone="amber">
          <div className="grid gap-3">
            {budgets.map((b) => (
              <BudgetStrip
                key={`${b.departmentId}-${b.cycleId}`}
                department={`${b.department} · ${b.cycleName}`}
                figures={b.figures}
              />
            ))}
          </div>
        </Section>
      )}

      <Section title={m.title} icon={Receipt} tone="teal">
        <ExpenseFilterForm
          basePath="/expenses/mine"
          filters={filters}
          departments={[...viewer.departments, ...(viewer.expenseDepartments ?? [])].map((d) => ({
            id: d.id,
            name: d.name,
          }))}
          statuses={EXPENSE_STATUSES}
        />
        {sorted.length === 0 && filtered ? (
          <EmptyState>{expensesCopy.review.emptyFiltered}</EmptyState>
        ) : sorted.length === 0 ? (
          <EmptyState>
            {m.empty}{" "}
            <Link href="/expenses/new" className={linkClass}>
              {m.newExpense}
            </Link>
          </EmptyState>
        ) : (
          <ExpenseTable
            rows={sorted}
            caption={m.title}
            extra={[{ header: m.columns.next, cell: needs }]}
          />
        )}
      </Section>
    </>
  );
}
