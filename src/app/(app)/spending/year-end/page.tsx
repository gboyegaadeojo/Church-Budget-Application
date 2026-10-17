import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { CalendarCheck, Hourglass, Lock, LockOpen, PackageOpen, Wallet } from "lucide-react";
import { ActionForm, SubmitButton, TextAreaField } from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  AdminSkeleton,
  EmptyState,
  PageHeader,
  PermissionDenied,
  Section,
} from "@/components/ui/display";
import { buttonClass, cardClass, inputClass, linkClass } from "@/components/ui/styles";
import { spendingCopy } from "@/copy/spending";
import { getDb } from "@/db";
import { getChurchTimeZone } from "@/domain/settings";
import { yearEndView, type YearEndItem } from "@/domain/spending/year-end";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import { formatDateTime } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";
import { ExpenseStatusBadge } from "../../expenses/status-badge";
import { carryOverAction, lockSpendingAction, reopenSpendingAction } from "../actions";

const y = spendingCopy.yearEnd;

export const metadata: Metadata = { title: y.title };

/** Year-end (FR-29, FR-46, DRD 6.8 "Locked period"): lock, reopen and carry over. */
export default function YearEndPage({ searchParams }: PageProps<"/spending/year-end">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <YearEndContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function YearEndContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const viewer = await getViewer();
  const db = getDb();
  const cycleId = typeof query.cycle === "string" ? query.cycle : undefined;
  const view = await yearEndView(db, viewer, cycleId);
  if (!view) return <PermissionDenied />;
  const zone = await getChurchTimeZone(db);
  const { cycle, next } = view;
  const locked = cycle.lockedAt !== null;
  const settled = view.awaitingDecision.length === 0 && view.awaitingPayment.length === 0;

  return (
    <>
      <PageHeader
        title={`${y.title} · ${cycle.name}`}
        intro={y.intro}
        back={{ href: `/spending?cycle=${cycle.id}`, label: y.back }}
      />

      {view.cycles.length > 1 && (
        <form method="get" action="/spending/year-end" className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label htmlFor="year-end-cycle" className="block text-sm font-medium">
              {spendingCopy.dashboard.cycle}
            </label>
            <select
              id="year-end-cycle"
              name="cycle"
              defaultValue={cycle.id}
              className={cn(inputClass, "w-48")}
            >
              {view.cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={buttonClass("secondary")}>
            {spendingCopy.dashboard.show}
          </button>
        </form>
      )}

      <p
        role="status"
        className={cn(
          cardClass,
          "flex items-center gap-3 p-4 text-sm sm:p-4",
          locked && "border-warning",
        )}
      >
        {locked ? (
          <Lock className="size-5 shrink-0 text-warning" aria-hidden="true" />
        ) : (
          <LockOpen className="size-5 shrink-0 text-fg-muted" aria-hidden="true" />
        )}
        {locked && cycle.lockedAt
          ? y.lockedBanner(formatDateTime(cycle.lockedAt, zone), cycle.lockedBy)
          : y.openBanner}
      </p>

      {!locked && (
        <Section title={y.checklist} icon={CalendarCheck} tone="blue">
          <h3 className="text-base font-semibold">{y.awaitingDecision}</h3>
          <ItemList items={view.awaitingDecision} empty={y.awaitingDecisionNone} />
          <h3 className="text-base font-semibold">{y.awaitingPayment}</h3>
          <ItemList items={view.awaitingPayment} empty={y.awaitingPaymentNone} />
          {settled ? (
            <ActionForm
              action={lockSpendingAction}
              id="lock-spending"
              aria-label={y.lock}
              className="space-y-3"
            >
              <input type="hidden" name="cycleId" value={cycle.id} />
              <input type="hidden" name="cycleName" value={cycle.name} />
              <input type="hidden" name="version" value={cycle.version} />
              <input type="hidden" name="idempotencyKey" value={randomUUID()} />
              <p className="text-sm text-fg-muted">{y.openPurchasesAfterLock}</p>
              <ConfirmDialog
                formId="lock-spending"
                trigger={y.lock}
                triggerTone="primary"
                title={y.lockTitle(cycle.name)}
                body={y.lockBody}
                confirmLabel={y.lock}
              />
            </ActionForm>
          ) : (
            <p className="flex items-start gap-2 text-sm text-fg-muted">
              <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {y.settleFirst}
            </p>
          )}
        </Section>
      )}

      {locked && (
        <Section title={y.openPurchases} icon={PackageOpen} tone="amber">
          <p className="text-sm text-fg-muted">
            {next ? y.openPurchasesIntro(next.name) : y.openPurchasesNoNext(cycle.budgetYear + 1)}
          </p>
          {view.openPurchases.length === 0 ? (
            <EmptyState>{y.openPurchasesNone}</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {view.openPurchases.map((item) => (
                <li key={item.id} className="space-y-3 py-4">
                  <ItemSummary item={item} />
                  <div className="flex flex-wrap items-start gap-3">
                    <Link href={`/expenses/${item.id}`} className={buttonClass("secondary")}>
                      {y.cancel}
                    </Link>
                  </div>
                  {next && !next.locked && item.nextHasBudget && (
                    <ActionForm
                      action={carryOverAction}
                      aria-label={`${y.carry(next.name)}: ${item.reference ?? item.title}`}
                      resetOnSuccess
                      className="space-y-3"
                    >
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="version" value={item.version} />
                      <input type="hidden" name="nextName" value={next.name} />
                      <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                      <TextAreaField name="reason" label={y.carryReason} rows={2} required />
                      <SubmitButton>{y.carry(next.name)}</SubmitButton>
                    </ActionForm>
                  )}
                  {next && !item.nextHasBudget && (
                    <p className="text-sm text-fg-muted">{y.noNextBudget(next.name)}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {locked && (
        <Section title={y.reopenHeading} icon={LockOpen} tone="slate">
          <ActionForm
            action={reopenSpendingAction}
            aria-label={y.reopenHeading}
            resetOnSuccess
            className="space-y-3"
          >
            <p className="text-sm text-fg-muted">{y.reopenIntro}</p>
            <input type="hidden" name="cycleId" value={cycle.id} />
            <input type="hidden" name="cycleName" value={cycle.name} />
            <input type="hidden" name="version" value={cycle.version} />
            <TextAreaField name="reason" label={y.reopenReason} rows={2} required />
            <SubmitButton tone="secondary">{y.reopen}</SubmitButton>
          </ActionForm>
        </Section>
      )}

      {view.carriedIn.length > 0 && (
        <Section title={y.carriedIn(String(cycle.budgetYear - 1))} icon={Wallet} tone="teal">
          <ul className="divide-y divide-border">
            {view.carriedIn.map((item) => (
              <li key={item.id} className="space-y-1 py-3">
                <ItemSummary item={item} />
                <p className="text-sm text-fg-muted">{item.reason}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function ItemSummary({ item }: { item: YearEndItem }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
      <div className="min-w-0 space-y-1">
        <Link href={`/expenses/${item.id}`} className={cn(linkClass, "font-medium")}>
          {[item.reference, item.title].filter(Boolean).join(" · ")}
        </Link>
        <p className="flex flex-wrap items-center gap-2 text-fg-muted">
          {item.department}
          <ExpenseStatusBadge status={item.status} />
        </p>
      </div>
      <span className="tabular font-semibold">{formatCAD(item.amountCents)}</span>
    </div>
  );
}

function ItemList({ items, empty }: { items: YearEndItem[]; empty: string }) {
  if (items.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={item.id} className="py-3">
          <ItemSummary item={item} />
        </li>
      ))}
    </ul>
  );
}
