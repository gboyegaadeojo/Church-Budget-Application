import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock, HandCoins, Inbox, Wallet } from "lucide-react";
import {
  AdminSkeleton,
  EmptyState,
  PageHeader,
  PermissionDenied,
  Section,
  StatCard,
} from "@/components/ui/display";
import { buttonClass, cardClass, linkClass } from "@/components/ui/styles";
import { expensesCopy } from "@/copy/expenses";
import { getDb } from "@/db";
import { readyQueue, type ReadyRow } from "@/domain/expenses/payment-queries";
import { getChurchTimeZone } from "@/domain/settings";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import { formatDate, zonedDate } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";
import { ExpenseStatusBadge } from "../status-badge";
import { StartProcessing } from "./start-processing";

const p = expensesCopy.payment;
const r = expensesCopy.review;

export const metadata: Metadata = { title: p.queueTitle };

/** Ready to process (6B.5, DRD 6.9a): approved expenses, oldest first, and recent payments. */
export default function ReadyPage({ searchParams }: PageProps<"/expenses/ready">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <ReadyContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function preference(row: ReadyRow): string {
  if (row.type === "purchase_request") {
    return row.howBought
      ? expensesCopy.howBought[row.howBought as keyof typeof expensesCopy.howBought]
      : "";
  }
  if (row.payeeKind === "church_card") return p.nothingOwed;
  return row.paymentPreference
    ? expensesCopy.paymentPreference[row.paymentPreference as "cheque" | "e_transfer"]
    : "";
}

async function ReadyContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const viewer = await getViewer();
  const db = getDb();
  const [queue, zone] = await Promise.all([readyQueue(db, viewer), getChurchTimeZone(db)]);
  if (!queue) return <PermissionDenied />;
  const day = (d: Date | null) => (d ? formatDate(zonedDate(d, zone)) : "");

  return (
    <>
      <PageHeader title={p.queueTitle} intro={p.queueIntro} />
      {typeof query.done === "string" && (
        <p
          role="status"
          className={cn(cardClass, "flex items-center gap-3 border-success p-4 text-sm sm:p-4")}
        >
          <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
          {p.done}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={p.stats.waiting} value={queue.rows.length} icon={Inbox} tone="teal" />
        <StatCard
          label={p.stats.total}
          value={formatCAD(queue.waitingCents)}
          icon={Wallet}
          tone="blue"
        />
        <StatCard
          label={p.stats.owed}
          value={formatCAD(queue.owedCents)}
          icon={HandCoins}
          tone="amber"
        />
        <StatCard
          label={p.stats.oldest}
          value={queue.oldestDays === null ? r.stats.none : r.stats.days(queue.oldestDays)}
          icon={Clock}
          tone="slate"
        />
      </div>

      <Section title={r.listHeading} icon={Inbox} tone="teal">
        {queue.rows.length === 0 ? (
          <EmptyState>{p.empty}</EmptyState>
        ) : (
          <div
            className="-mx-1 overflow-x-auto px-1"
            tabIndex={0}
            role="region"
            aria-label={p.queueTitle}
          >
            <table className="w-full min-w-[56rem] text-left text-sm">
              <caption className="sr-only">{p.queueTitle}</caption>
              <thead className="border-b border-border text-[11px] tracking-wide text-fg-muted uppercase">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {expensesCopy.mine.columns.reference}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {expensesCopy.mine.columns.type}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {p.columns.payee}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {expensesCopy.mine.columns.department}
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    {expensesCopy.mine.columns.amount}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {p.columns.approvedOn}
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    {p.columns.waiting}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {p.columns.preference}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {expensesCopy.mine.columns.status}
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    {p.columns.action}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {queue.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-hover">
                    <td className="py-2.5 pr-4 align-top whitespace-nowrap">
                      <Link href={`/expenses/${row.id}`} className={linkClass}>
                        {row.referenceNumber}
                      </Link>
                      <span className="block text-xs text-fg-muted">{row.title}</span>
                    </td>
                    <td className="py-2.5 pr-4 align-top">{expensesCopy.types[row.type]}</td>
                    <td className="py-2.5 pr-4 align-top">
                      {row.type === "purchase_request"
                        ? p.churchAccount
                        : (row.payee ?? p.nothingOwed)}
                    </td>
                    <td className="py-2.5 pr-4 align-top">{row.department}</td>
                    <td className="tabular py-2.5 pr-4 text-right align-top">
                      {formatCAD(row.approvedCents)}
                    </td>
                    <td className="py-2.5 pr-4 align-top whitespace-nowrap">
                      {day(row.approvedAt)}
                    </td>
                    <td className="tabular py-2.5 pr-4 text-right align-top">
                      {r.stats.days(row.daysWaiting)}
                    </td>
                    <td className="py-2.5 pr-4 align-top">{preference(row)}</td>
                    <td className="py-2.5 pr-4 align-top">
                      <ExpenseStatusBadge status={row.status} />
                    </td>
                    <td className="py-2.5 align-top">
                      {row.canPay && !queue.readOnly ? (
                        <div className="flex flex-col gap-2">
                          {row.status === "approved" && (
                            <StartProcessing
                              id={row.id}
                              version={row.version}
                              reference={row.referenceNumber}
                            />
                          )}
                          <Link
                            href={`/expenses/ready/${row.id}`}
                            className={buttonClass("primary")}
                            aria-label={`${p.record}: ${row.referenceNumber}`}
                          >
                            {p.record}
                          </Link>
                        </div>
                      ) : (
                        <span className="text-xs text-fg-muted">{expensesCopy.view.readOnly}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={p.recent} icon={CheckCircle2} tone="green">
        {queue.recent.length === 0 ? (
          <EmptyState>{p.recentEmpty}</EmptyState>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {queue.recent.map((paid) => (
              <li
                key={paid.id}
                className="flex flex-wrap items-baseline justify-between gap-2 py-2"
              >
                <span>
                  <Link href={`/expenses/${paid.id}`} className={linkClass}>
                    {paid.referenceNumber}
                  </Link>{" "}
                  · {paid.department} · {p.methods[paid.method as keyof typeof p.methods]},{" "}
                  {formatDate(paid.paidOn)}
                </span>
                <span className="tabular font-medium">{formatCAD(paid.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
