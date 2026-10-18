import { linkClass } from "@/components/ui/styles";
import { expensesCopy } from "@/copy/expenses";
import { isHttpUrl } from "@/domain/annual/schema";
import type { ExpenseContent } from "@/domain/expenses/schema";
import type { ExpenseType } from "@/domain/expenses/status";
import { cn } from "@/lib/cn";
import { formatCAD, lineTotal } from "@/lib/money";
import { formatDate } from "@/lib/time-zone";

const c = expensesCopy.table;
const v = expensesCopy.view;

/**
 * A purchase request's items or a claim's receipt lines, as a document table (DRD 6.5
 * pattern). Product links show their domain and open safely (CLAUDE.md "Links").
 */
export function ExpenseLines({
  expense,
}: {
  expense: { type: ExpenseType; content: Pick<ExpenseContent, "items" | "lines"> };
}) {
  const caption = expense.type === "purchase_request" ? v.items : v.lines;
  const rows = expense.type === "purchase_request" ? expense.content.items : expense.content.lines;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{caption}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted">{v.noLines}</p>
      ) : (
        <div
          className="relative -mx-1 overflow-x-auto px-1"
          tabIndex={0}
          role="region"
          aria-label={caption}
        >
          <table className="w-full min-w-[30rem] text-left text-sm">
            <caption className="sr-only">{caption}</caption>
            {expense.type === "purchase_request" ? (
              <>
                <thead className="border-b border-border text-xs text-fg-muted">
                  <tr>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {c.item}
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">
                      {c.qty}
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">
                      {c.price}
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      {c.total}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {expense.content.items.map((item, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-4 align-top">
                        <span className="font-medium">{item.name}</span>
                        {item.link && isHttpUrl(item.link) && (
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(linkClass, "block text-xs")}
                          >
                            {new URL(item.link).hostname}
                          </a>
                        )}
                      </td>
                      <td className="tabular py-2 pr-4 text-right align-top">
                        {item.quantity.toLocaleString("en-CA")}
                      </td>
                      <td className="tabular py-2 pr-4 text-right align-top">
                        {formatCAD(item.unitPriceCents)}
                      </td>
                      <td className="tabular py-2 text-right align-top">
                        {formatCAD(lineTotal(item.quantity, item.unitPriceCents))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            ) : (
              <>
                <thead className="border-b border-border text-xs text-fg-muted">
                  <tr>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {c.date}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {c.vendor}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {c.description}
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      {c.amount}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {expense.content.lines.map((line, i) => (
                    <tr key={i}>
                      <td className="tabular py-2 pr-4 align-top whitespace-nowrap">
                        {formatDate(line.date)}
                      </td>
                      <td className="py-2 pr-4 align-top">{line.vendor}</td>
                      <td className="py-2 pr-4 align-top">
                        {line.description}
                        {line.receiptNumber && (
                          <span className="block text-xs text-fg-muted">
                            {c.receiptNumber}: {line.receiptNumber}
                          </span>
                        )}
                      </td>
                      <td className="tabular py-2 text-right align-top">
                        {formatCAD(line.amountCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          </table>
        </div>
      )}
    </section>
  );
}
