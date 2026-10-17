import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Receipt } from "lucide-react";
import {
  AdminSkeleton,
  EmptyState,
  PageHeader,
  PermissionDenied,
  Section,
} from "@/components/ui/display";
import { buttonClass, inputClass } from "@/components/ui/styles";
import { expensesCopy } from "@/copy/expenses";
import { getDb } from "@/db";
import { allExpenses, type AllFilters } from "@/domain/expenses/review-queries";
import { EXPENSE_STATUSES, EXPENSE_TYPES } from "@/domain/expenses/status";
import { getViewer } from "@/lib/viewer";
import { ExpenseTable } from "../expense-table";

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
  const query = await searchParams;
  const one = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : "");
  const filters: AllFilters = {
    q: one("q") || undefined,
    department: one("department") || undefined,
    type: one("type") || undefined,
    status: one("status") || undefined,
  };
  const viewer = await getViewer();
  const list = await allExpenses(getDb(), viewer, filters);
  if (!list) return <PermissionDenied />;
  const filtered = Object.values(filters).some(Boolean);
  const select = (
    name: keyof AllFilters,
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <div className="space-y-1.5">
      <label htmlFor={`all-${name}`} className="block text-sm font-medium">
        {label}
      </label>
      <select
        id={`all-${name}`}
        name={name}
        defaultValue={filters[name] ?? ""}
        className={inputClass}
      >
        <option value="">{r.filters.any}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <>
      <PageHeader title={a.title} intro={list.readOnly ? a.introReadOnly : a.intro} />
      <Section title={r.listHeading} icon={Receipt} tone="teal">
        <form
          method="get"
          action="/expenses/all"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end"
        >
          <div className="space-y-1.5">
            <label htmlFor="all-q" className="block text-sm font-medium">
              {a.search}
            </label>
            <input
              id="all-q"
              name="q"
              type="search"
              defaultValue={filters.q ?? ""}
              className={inputClass}
            />
          </div>
          {select(
            "department",
            r.filters.department,
            list.departments.map((d) => ({ value: d.id, label: d.name })),
          )}
          {select(
            "type",
            r.filters.type,
            EXPENSE_TYPES.map((t) => ({ value: t, label: expensesCopy.types[t] })),
          )}
          {select(
            "status",
            r.filters.status,
            EXPENSE_STATUSES.filter((s) => s !== "draft").map((s) => ({
              value: s,
              label: expensesCopy.status[s].label,
            })),
          )}
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("secondary")}>
              {r.filters.apply}
            </button>
            {filtered && (
              <Link href="/expenses/all" className={buttonClass("ghost")}>
                {r.filters.clear}
              </Link>
            )}
          </div>
        </form>
        {list.rows.length === 0 ? (
          <EmptyState>{filtered ? r.emptyFiltered : a.empty}</EmptyState>
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
