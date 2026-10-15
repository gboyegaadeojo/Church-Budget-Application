import { linkClass } from "@/components/ui/styles";
import { annualCopy } from "@/copy/annual";
import { isHttpUrl } from "@/domain/annual/schema";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";

const p = annualCopy.preview;

export type LineRow = {
  name: string;
  quantity: string;
  /** null while what was typed isn't a valid amount yet. */
  unitPriceCents: number | null;
  totalCents: number | null;
  link: string | null;
  notes: string | null;
};

/** The items as a document table (DRD 6.5); links show their domain and open safely. */
export function LinesTable({ lines, caption }: { lines: LineRow[]; caption: string }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1" tabIndex={0} role="region" aria-label={caption}>
      <table className="w-full min-w-[32rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-border text-xs text-fg-muted">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">
              {p.columns.item}
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              {p.columns.qty}
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              {p.columns.price}
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              {p.columns.total}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {lines.map((line, i) => (
            <tr key={i}>
              <td className="py-2 pr-4 align-top">
                <span className="font-medium">{line.name}</span>
                {line.link && isHttpUrl(line.link) && (
                  <a
                    href={line.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(linkClass, "block text-xs")}
                  >
                    {new URL(line.link).hostname}
                  </a>
                )}
                {line.notes && (
                  <span className="block text-xs whitespace-pre-line text-fg-muted">
                    {line.notes}
                  </span>
                )}
              </td>
              <td className="tabular py-2 pr-4 text-right align-top">{line.quantity}</td>
              <td className="tabular py-2 pr-4 text-right align-top">
                {line.unitPriceCents === null ? "—" : formatCAD(line.unitPriceCents)}
              </td>
              <td className="tabular py-2 text-right align-top">
                {line.totalCents === null ? "—" : formatCAD(line.totalCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
