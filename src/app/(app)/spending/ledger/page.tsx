import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Plus, Undo2 } from "lucide-react";
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
import { spendingCopy } from "@/copy/spending";
import { getDb } from "@/db";
import { getLedger, type LedgerFilters } from "@/domain/spending/ledger";
import { PAYMENT_METHODS } from "@/domain/spending/schema";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import { formatDate } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";

const l = expensesCopy.ledger;
const f = spendingCopy.ledgerFilters;

export const metadata: Metadata = { title: l.title };

const KEYS = ["department", "from", "to", "method", "type", "q", "enteredBy", "status"] as const;

/**
 * The spending ledger (FR-24, FR-26): every entry, including those made from approved
 * expenses (AC-80), with search and filters kept in the address. Refunds show as −$X,
 * voided entries stay visible, muted and struck through (DRD 6.8). Those who record
 * spending open an entry to correct or void it.
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
  const one = (k: string) => (typeof query[k] === "string" ? (query[k] as string).trim() : "");
  const filters: LedgerFilters = {};
  for (const k of KEYS) if (one(k)) filters[k] = one(k);
  const filtered = Object.keys(filters).length > 0;
  const viewer = await getViewer();
  const ledger = await getLedger(getDb(), viewer, one("cycle") || undefined, filters);
  if (!ledger) return <PermissionDenied />;
  const methods = {
    ...(expensesCopy.payment.methods as Record<string, string>),
    ...spendingCopy.methods,
  };
  const select = (
    name: keyof LedgerFilters,
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <div className="space-y-1.5">
      <label htmlFor={`ledger-${name}`} className="block text-sm font-medium">
        {label}
      </label>
      <select
        id={`ledger-${name}`}
        name={name}
        defaultValue={filters[name] ?? ""}
        className={inputClass}
      >
        <option value="">{f.any}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
  const dateField = (name: "from" | "to", label: string) => (
    <div className="space-y-1.5">
      <label htmlFor={`ledger-${name}`} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={`ledger-${name}`}
        name={name}
        type="date"
        defaultValue={filters[name] ?? ""}
        className={inputClass}
      />
    </div>
  );

  return (
    <>
      <PageHeader title={l.title} intro={l.intro}>
        {ledger.canRecord && (
          <Link
            href={`/spending/record${ledger.cycleId ? `?cycle=${ledger.cycleId}` : ""}`}
            className={buttonClass("primary", "ml-auto")}
          >
            <Plus className="size-4" aria-hidden="true" />
            {spendingCopy.record.title}
          </Link>
        )}
      </PageHeader>
      <Section
        title={l.entries}
        icon={BookOpen}
        tone="amber"
        actions={
          <p className="text-sm">
            <span className="text-fg-muted">{filtered ? f.shownSpent : l.spent}: </span>
            <span className="tabular font-semibold">{formatCAD(ledger.spentCents)}</span>
          </p>
        }
      >
        <form method="get" action="/spending/ledger" aria-label={f.heading} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <label htmlFor="ledger-cycle" className="block text-sm font-medium">
                {l.cycle}
              </label>
              <select
                id="ledger-cycle"
                name="cycle"
                defaultValue={ledger.cycleId ?? ""}
                className={inputClass}
              >
                {ledger.cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 lg:col-span-3">
              <label htmlFor="ledger-q" className="block text-sm font-medium">
                {f.search}
              </label>
              <input
                id="ledger-q"
                name="q"
                type="search"
                defaultValue={filters.q ?? ""}
                className={inputClass}
              />
            </div>
            {select(
              "department",
              f.department,
              ledger.departments.map((d) => ({ value: d.id, label: d.name })),
            )}
            {select(
              "method",
              f.method,
              [...PAYMENT_METHODS, "supplier_invoice"].map((m) => ({
                value: m,
                label: methods[m] ?? m,
              })),
            )}
            {select("type", f.type, [
              { value: "expense", label: spendingCopy.types.expense },
              { value: "refund", label: spendingCopy.types.refund },
            ])}
            {select("status", f.status, [
              { value: "recorded", label: spendingCopy.ledgerStatus.recorded },
              { value: "voided", label: spendingCopy.ledgerStatus.voided },
            ])}
            {select(
              "enteredBy",
              f.enteredBy,
              ledger.people.map((p) => ({ value: p.id, label: p.name })),
            )}
            {dateField("from", f.from)}
            {dateField("to", f.to)}
          </div>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("secondary")}>
              {f.apply}
            </button>
            {filtered && (
              <Link
                href={`/spending/ledger${ledger.cycleId ? `?cycle=${ledger.cycleId}` : ""}`}
                className={buttonClass("ghost")}
              >
                {f.clear}
              </Link>
            )}
          </div>
        </form>
        {ledger.rows.length === 0 ? (
          <EmptyState>{filtered ? f.emptyFiltered : l.empty}</EmptyState>
        ) : (
          <div
            className="-mx-1 overflow-x-auto px-1"
            tabIndex={0}
            role="region"
            aria-label={l.entries}
          >
            <table className="w-full min-w-[56rem] text-left text-sm">
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
                {ledger.rows.map((row) => {
                  const voided = row.status === "voided";
                  return (
                    <tr
                      key={row.id}
                      className={cn("hover:bg-surface-hover", voided && "text-fg-muted")}
                    >
                      <td className="tabular py-2.5 pr-4 align-top whitespace-nowrap">
                        {formatDate(row.spentOn)}
                      </td>
                      <td className="py-2.5 pr-4 align-top">{row.department}</td>
                      <td className="py-2.5 pr-4 align-top">
                        {ledger.canRecord ? (
                          <Link href={`/spending/entries/${row.id}`} className={linkClass}>
                            {row.payee}
                          </Link>
                        ) : (
                          row.payee
                        )}
                        <span className="block text-xs text-fg-muted">{row.enteredBy}</span>
                      </td>
                      <td className="py-2.5 pr-4 align-top">{row.description}</td>
                      <td
                        className={cn(
                          "tabular py-2.5 pr-4 text-right align-top whitespace-nowrap",
                          voided && "line-through",
                        )}
                      >
                        {row.entryType === "refund" && (
                          <Undo2 className="mr-1 inline size-3.5" aria-hidden="true" />
                        )}
                        {formatCAD(row.entryType === "refund" ? -row.amountCents : row.amountCents)}
                      </td>
                      <td className="py-2.5 pr-4 align-top">
                        {row.paymentMethod
                          ? (methods[row.paymentMethod] ?? row.paymentMethod)
                          : "—"}
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
                      <td className="space-x-1 py-2.5 align-top whitespace-nowrap">
                        {row.unbudgeted && (
                          <Badge tone="warning">{spendingCopy.dashboard.status.no_budget}</Badge>
                        )}
                        <Badge
                          tone={
                            voided ? "neutral" : row.entryType === "refund" ? "info" : "success"
                          }
                        >
                          {voided ? l.voided : row.entryType === "refund" ? l.refund : l.recorded}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
