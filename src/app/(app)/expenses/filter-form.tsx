import Link from "next/link";
import { buttonClass, inputClass } from "@/components/ui/styles";
import { expensesCopy } from "@/copy/expenses";
import { hasListFilters, type ExpenseListFilters } from "@/domain/expenses/list-filters";
import { EXPENSE_TYPES, type ExpenseStatus } from "@/domain/expenses/status";

const f = expensesCopy.review.filters;

/**
 * Search and filters for an expense list (FR-48), sent as a plain GET so they stay in the
 * address (DRD 6.0) and work without JavaScript. The server ignores anything that doesn't
 * parse; an amount that isn't one is shown back with a hint.
 */
export function ExpenseFilterForm({
  basePath,
  filters,
  departments,
  statuses,
  overBudget = false,
}: {
  basePath: string;
  filters: ExpenseListFilters;
  departments: { id: string; name: string }[];
  statuses: readonly ExpenseStatus[];
  /** Offer "Over budget only" (approver queues). */
  overBudget?: boolean;
}) {
  const id = (name: string) => `filter-${name}`;
  const text = (name: keyof ExpenseListFilters, label: string, type = "text", hint?: string) => (
    <div className="space-y-1.5">
      <label htmlFor={id(name)} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id(name)}
        name={name}
        type={type}
        inputMode={hint ? "decimal" : undefined}
        defaultValue={filters[name] ?? ""}
        placeholder={hint}
        className={inputClass}
      />
    </div>
  );
  const select = (
    name: keyof ExpenseListFilters,
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <div className="space-y-1.5">
      <label htmlFor={id(name)} className="block text-sm font-medium">
        {label}
      </label>
      <select id={id(name)} name={name} defaultValue={filters[name] ?? ""} className={inputClass}>
        <option value="">{f.any}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <form method="get" action={basePath} aria-label={f.heading} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">{text("q", f.search, "search")}</div>
        {select(
          "department",
          f.department,
          departments.map((d) => ({ value: d.id, label: d.name })),
        )}
        {select(
          "type",
          f.type,
          EXPENSE_TYPES.map((t) => ({ value: t, label: expensesCopy.types[t] })),
        )}
        {statuses.length > 1 &&
          select(
            "status",
            f.status,
            statuses.map((s) => ({ value: s, label: expensesCopy.status[s].label })),
          )}
        {text("from", f.from, "date")}
        {text("to", f.to, "date")}
        <div className="grid grid-cols-2 gap-3">
          {text("min", f.min, "text", f.amountHint)}
          {text("max", f.max, "text", f.amountHint)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {overBudget && (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="overBudget"
              value="yes"
              defaultChecked={filters.overBudget === "yes"}
              className="size-6 accent-accent"
            />
            {f.overBudget}
          </label>
        )}
        <div className="ml-auto flex gap-2">
          <button type="submit" className={buttonClass("secondary")}>
            {f.apply}
          </button>
          {hasListFilters(filters) && (
            <Link href={basePath} className={buttonClass("ghost")}>
              {f.clear}
            </Link>
          )}
        </div>
      </div>
    </form>
  );
}
