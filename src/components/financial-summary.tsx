import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";
import { formatCAD, formatTaxRate, type TaxBreakdown, type TaxRate } from "@/lib/money";

/**
 * Subtotal / Sales tax (rate) / Total (incl. tax), the same everywhere amounts appear
 * (DRD 6.4). The total is the strongest element. Requested is this component; Requested
 * vs Approved is `ComparisonSummary` below; Budget vs Actual arrives with Stage 4.
 * The figures always come from money.ts; this component never does arithmetic.
 */
export function FinancialSummary({
  totals,
  rate,
  className,
  heading,
  headingLevel = 2,
}: {
  totals: TaxBreakdown;
  rate: TaxRate;
  className?: string;
  heading?: string;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={cn("space-y-3", className)}>
      {heading && <Heading className="text-sm font-semibold text-fg-muted">{heading}</Heading>}
      <dl className="space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-fg-muted">{copy.money.subtotal}</dt>
          <dd className="tabular">{formatCAD(totals.subtotal)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-fg-muted">{copy.money.salesTax(formatTaxRate(rate))}</dt>
          <dd className="tabular">{formatCAD(totals.tax)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-border pt-2">
          <dt className="font-semibold">{copy.money.total}</dt>
          <dd className="tabular text-xl font-semibold">{formatCAD(totals.total)}</dd>
        </div>
      </dl>
    </div>
  );
}

/** How the approved total compares with what was asked: "$14,800.00 less than requested". */
export function differenceText(
  requestedCents: number,
  approvedCents: number,
  words: {
    less: (amount: string) => string;
    more: (amount: string) => string;
    none: string;
  },
): string {
  const diff = approvedCents - requestedCents;
  if (diff === 0) return words.none;
  return diff < 0 ? words.less(formatCAD(-diff)) : words.more(formatCAD(diff));
}

/**
 * Requested vs Approved (DRD 6.4): two columns of Subtotal, Sales tax and Total, then
 * the difference in words. Used on the review screen and in the approval dialog.
 */
export function ComparisonSummary({
  requested,
  approved,
  rate,
  labels,
  className,
}: {
  requested: TaxBreakdown;
  approved: TaxBreakdown | null;
  rate: TaxRate;
  labels: {
    requested: string;
    approved: string;
    difference: string;
    less: (amount: string) => string;
    more: (amount: string) => string;
    none: string;
  };
  className?: string;
}) {
  const rows = [
    { label: copy.money.subtotal, key: "subtotal" as const },
    { label: copy.money.salesTax(formatTaxRate(rate)), key: "tax" as const },
    { label: copy.money.total, key: "total" as const },
  ];
  return (
    <div className={cn("space-y-2", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-fg-muted">
            <td />
            <th scope="col" className="pb-1 text-right font-medium">
              {labels.requested}
            </th>
            <th scope="col" className="pb-1 pl-4 text-right font-medium">
              {labels.approved}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, key }) => {
            const total = key === "total";
            return (
              <tr key={key} className={cn(total && "border-t border-border")}>
                <th
                  scope="row"
                  className={cn(
                    "py-1 pr-2 text-left font-normal text-fg-muted",
                    total && "pt-2 font-semibold text-fg",
                  )}
                >
                  {label}
                </th>
                <td className={cn("tabular py-1 text-right", total && "pt-2 font-semibold")}>
                  {formatCAD(requested[key])}
                </td>
                <td
                  className={cn(
                    "tabular py-1 pl-4 text-right",
                    total && "pt-2 text-lg font-semibold",
                  )}
                >
                  {approved ? formatCAD(approved[key]) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {approved && (
        <p className="text-sm">
          <span className="text-fg-muted">{labels.difference}: </span>
          <span className="font-medium">
            {differenceText(requested.total, approved.total, labels)}
          </span>
        </p>
      )}
    </div>
  );
}
