import { AlertTriangle, FileText, Image as ImageIcon } from "lucide-react";
import { linkClass } from "@/components/ui/styles";
import { expensesCopy } from "@/copy/expenses";
import type { ReceiptFileView } from "@/domain/expenses/receipts";
import { cn } from "@/lib/cn";

const r = expensesCopy.receipts;

/**
 * A claim's receipt files, each opening through the app's checked link (6B.9, AC-81),
 * so a link copied out of the page works only for someone allowed to see it.
 */
export function ReceiptList({
  expenseId,
  receipts,
  kind = "receipts",
}: {
  expenseId: string;
  receipts: ReceiptFileView[];
  /** A claim's receipts, or a purchase request's attachments. */
  kind?: "receipts" | "attachments";
}) {
  const words = kind === "attachments" ? { ...r, ...expensesCopy.attachments } : r;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{words.heading}</h2>
      {receipts.length === 0 ? (
        <p className="text-sm text-fg-muted">{words.none}</p>
      ) : (
        <ul className="divide-y divide-border rounded-control border border-border">
          {receipts.map((item) => {
            const Icon = item.contentType === "application/pdf" ? FileText : ImageIcon;
            return (
              <li key={item.id} className="flex items-start gap-3 p-3 text-sm">
                <Icon className="mt-0.5 size-5 shrink-0 text-fg-muted" aria-hidden="true" />
                <div className="min-w-0">
                  <a
                    href={`/api/expenses/${expenseId}/receipts/${item.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(linkClass, "break-all")}
                  >
                    {item.fileName}
                  </a>
                  <p className="text-xs text-fg-muted">
                    {r.size(Math.ceil(item.sizeBytes / 1024))} · {r.uploadedBy(item.uploadedBy)}
                  </p>
                  {item.duplicateOf && (
                    <p className="flex items-center gap-1 text-xs text-warning">
                      <AlertTriangle className="size-3.5" aria-hidden="true" />
                      {r.duplicate}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
