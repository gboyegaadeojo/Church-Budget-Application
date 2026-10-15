import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";
import { formatCAD, formatTaxRate, type TaxBreakdown, type TaxRate } from "@/lib/money";

/**
 * Subtotal / Sales tax (rate) / Total (incl. tax), the same everywhere amounts appear
 * (DRD 6.4). The total is the strongest element. Only the Requested variant exists so
 * far; Requested vs Approved and Budget vs Actual arrive with the steps that use them.
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
