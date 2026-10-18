import Link from "next/link";
import { linkClass } from "@/components/ui/styles";
import { expensesCopy } from "@/copy/expenses";
import type { ExpenseListRow } from "@/domain/expenses/queries";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import { ExpenseStatusBadge } from "./status-badge";

const c = expensesCopy.mine.columns;

export type ExtraColumn = {
  header: string;
  cell: (row: ExpenseListRow) => React.ReactNode;
  align?: "right";
};

/**
 * A list of expenses (FR-48): reference (a link), title, type, department, amount and
 * status, plus any columns the page adds. Scrolls sideways on a phone, reachable by
 * keyboard.
 */
export function ExpenseTable({
  rows,
  caption,
  href = (row) => `/expenses/${row.id}`,
  extra = [],
}: {
  rows: ExpenseListRow[];
  caption: string;
  href?: (row: ExpenseListRow) => string;
  extra?: ExtraColumn[];
}) {
  return (
    <div
      className="relative -mx-1 overflow-x-auto px-1"
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className="w-full min-w-[44rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-border text-[11px] tracking-wide text-fg-muted uppercase">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">
              {c.reference}
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              {c.title}
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              {c.type}
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              {c.department}
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              {c.amount}
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              {c.status}
            </th>
            {extra.map((x) => (
              <th
                key={x.header}
                scope="col"
                className={cn("py-2 pr-4 font-medium", x.align === "right" && "text-right")}
              >
                {x.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-surface-hover">
              <td className="py-2.5 pr-4 align-top whitespace-nowrap">
                <Link href={href(row)} className={linkClass}>
                  {row.referenceNumber ?? expensesCopy.status.draft.label}
                </Link>
              </td>
              <td className="py-2.5 pr-4 align-top">{row.title || expensesCopy.mine.untitled}</td>
              <td className="py-2.5 pr-4 align-top">{expensesCopy.types[row.type]}</td>
              <td className="py-2.5 pr-4 align-top">{row.department}</td>
              <td className="tabular py-2.5 pr-4 text-right align-top">
                {row.amountCents === null ? "—" : formatCAD(row.amountCents)}
              </td>
              <td className="py-2.5 pr-4 align-top">
                <ExpenseStatusBadge status={row.status} />
              </td>
              {extra.map((x) => (
                <td
                  key={x.header}
                  className={cn(
                    "py-2.5 pr-4 align-top",
                    x.align === "right" && "tabular text-right",
                  )}
                >
                  {x.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
