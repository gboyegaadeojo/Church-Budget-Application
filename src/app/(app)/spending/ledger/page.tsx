import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import {
  AdminSkeleton,
  Badge,
  EmptyState,
  PageHeader,
  PermissionDenied,
  Section,
} from "@/components/ui/display";
import { buttonClass, inputClass, linkClass } from "@/components/ui/styles";
import { expensesCopy } from "@/copy/expenses";
import { getDb } from "@/db";
import { getLedger } from "@/domain/spending/ledger";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import { formatDate } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";

const l = expensesCopy.ledger;

export const metadata: Metadata = { title: l.title };

/**
 * The spending ledger (FR-24), read-only in Stage 3: entries made from approved expenses
 * appear here without re-typing (AC-80). Recording, refunds and voids come with Stage 4.
 */
export default function LedgerPage({ searchParams }: PageProps<"/spending/ledger">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <LedgerContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function LedgerContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const viewer = await getViewer();
  const ledger = await getLedger(
    getDb(),
    viewer,
    typeof query.cycle === "string" ? query.cycle : undefined,
  );
  if (!ledger) return <PermissionDenied />;
  const methods = expensesCopy.payment.methods as Record<string, string>;

  return (
    <>
      <PageHeader title={l.title} intro={l.intro} />
      <Section
        title={l.entries}
        icon={BookOpen}
        tone="amber"
        actions={
          <p className="text-sm">
            <span className="text-fg-muted">{l.spent}: </span>
            <span className="tabular font-semibold">{formatCAD(ledger.spentCents)}</span>
          </p>
        }
      >
        <form method="get" action="/spending/ledger" className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label htmlFor="ledger-cycle" className="block text-sm font-medium">
              {l.cycle}
            </label>
            <select
              id="ledger-cycle"
              name="cycle"
              defaultValue={ledger.cycleId ?? ""}
              className={cn(inputClass, "w-48")}
            >
              {ledger.cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={buttonClass("secondary")}>
            {l.show}
          </button>
        </form>
        {ledger.rows.length === 0 ? (
          <EmptyState>{l.empty}</EmptyState>
        ) : (
          <div
            className="-mx-1 overflow-x-auto px-1"
            tabIndex={0}
            role="region"
            aria-label={l.entries}
          >
            <table className="w-full min-w-[52rem] text-left text-sm">
              <caption className="sr-only">{l.entries}</caption>
              <thead className="border-b border-border text-[11px] tracking-wide text-fg-muted uppercase">
                <tr>
                  {[
                    l.columns.date,
                    l.columns.department,
                    l.columns.payee,
                    l.columns.description,
                  ].map((h) => (
                    <th key={h} scope="col" className="py-2 pr-4 font-medium">
                      {h}
                    </th>
                  ))}
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    {l.columns.amount}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {l.columns.method}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {l.columns.expense}
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    {l.columns.status}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ledger.rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "hover:bg-surface-hover",
                      row.status === "voided" && "text-fg-muted line-through",
                    )}
                  >
                    <td className="tabular py-2.5 pr-4 align-top whitespace-nowrap">
                      {formatDate(row.spentOn)}
                    </td>
                    <td className="py-2.5 pr-4 align-top">{row.department}</td>
                    <td className="py-2.5 pr-4 align-top">{row.payee}</td>
                    <td className="py-2.5 pr-4 align-top">{row.description}</td>
                    <td className="tabular py-2.5 pr-4 text-right align-top">
                      {formatCAD(row.entryType === "refund" ? -row.amountCents : row.amountCents)}
                    </td>
                    <td className="py-2.5 pr-4 align-top">
                      {row.paymentMethod ? (methods[row.paymentMethod] ?? row.paymentMethod) : "—"}
                    </td>
                    <td className="py-2.5 pr-4 align-top">
                      {row.expense ? (
                        <Link href={`/expenses/${row.expense.id}`} className={linkClass}>
                          {row.expense.reference}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2.5 align-top">
                      <Badge
                        tone={
                          row.status === "voided"
                            ? "neutral"
                            : row.entryType === "refund"
                              ? "info"
                              : "success"
                        }
                      >
                        {row.status === "voided"
                          ? l.voided
                          : row.entryType === "refund"
                            ? l.refund
                            : l.recorded}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-fg-muted">{l.stage4}</p>
      </Section>
    </>
  );
}
