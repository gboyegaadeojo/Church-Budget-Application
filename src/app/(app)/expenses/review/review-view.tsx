import Link from "next/link";
import { AlertTriangle, CheckCircle2, Copy, Clock } from "lucide-react";
import { FinancialSummary } from "@/components/financial-summary";
import { PageHeader } from "@/components/ui/display";
import { cardClass, linkClass } from "@/components/ui/styles";
import { expensesCopy } from "@/copy/expenses";
import type { ExpenseView } from "@/domain/expenses/queries";
import type { ReceiptFileView } from "@/domain/expenses/receipts";
import type { ExpenseWarnings } from "@/domain/expenses/review-queries";
import { PENDING_STATUSES } from "@/domain/expenses/status";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import { formatDateTime } from "@/lib/time-zone";
import { BudgetStrip, OverBudgetWarning, RemainingText } from "../budget-strip";
import { ExpenseLines } from "../expense-lines";
import { ReceiptList } from "../receipt-list";
import { ExpenseStatusBadge } from "../status-badge";
import { ApprovalTracker, trackerSteps } from "../tracker";

const r = expensesCopy.review;
const v = expensesCopy.view;

/**
 * The split review layout (DRD 6.9a): details and lines on the left; receipts, budget
 * impact, warnings and the decision on the right. Warnings use icons and words above the
 * decision, so each approver decides knowing the overage, duplicates and lateness (FR-43,
 * FR-46, FR-47). Shared by the accountant's and the Board Chair's screens.
 */
export function ReviewView({
  expense,
  receipts,
  warnings,
  zone,
  back,
  done,
  top,
  decision,
}: {
  expense: ExpenseView;
  receipts: ReceiptFileView[] | null;
  warnings: ExpenseWarnings;
  zone: string;
  back: { href: string; label: string };
  done?: string | null;
  /** Shown first on the right: the accountant's approved amount, for the board. */
  top?: React.ReactNode;
  decision: React.ReactNode;
}) {
  const amount = expense.approved?.total ?? expense.totals.total;
  const c = expense.content;
  const pending = PENDING_STATUSES.includes(expense.status);
  return (
    <>
      <PageHeader title={expense.title || expensesCopy.mine.untitled} back={back}>
        <ExpenseStatusBadge status={expense.status} />
      </PageHeader>

      {done && (
        <p
          role="status"
          className={cn(cardClass, "flex items-center gap-3 border-success p-4 text-sm sm:p-4")}
        >
          <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
          {done}
        </p>
      )}

      <div className={cardClass}>
        <ApprovalTracker
          zone={zone}
          steps={trackerSteps({
            type: expense.type,
            status: expense.status,
            submittedAt: expense.submittedAt,
            requester: expense.requester.name,
            decisions: expense.decisions,
          })}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <article className={cn(cardClass, "min-w-0 space-y-6")}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Item label={v.reference}>{expense.referenceNumber}</Item>
            <Item label={v.type}>{expensesCopy.types[expense.type]}</Item>
            <Item label={v.department}>{expense.department.name}</Item>
            <Item label={v.cycle}>{expense.cycle.name}</Item>
            <Item label={v.requester}>{expense.requester.name}</Item>
            {expense.submittedAt && (
              <Item label={v.submittedOn}>{formatDateTime(expense.submittedAt, zone)}</Item>
            )}
            {expense.type === "purchase_request" && c.howBought && (
              <Item label={v.howBought}>{expensesCopy.howBought[c.howBought]}</Item>
            )}
            {expense.type === "expense_claim" && (
              <>
                <Item label={v.payee}>
                  {c.payeeKind === "church_card"
                    ? expensesCopy.payee.church_card
                    : (expense.payee.name ?? "")}
                </Item>
                {c.paymentPreference && (
                  <Item label={v.paymentPreference}>
                    {expensesCopy.paymentPreference[c.paymentPreference]}
                    {expense.payee.email && ` (${expense.payee.email})`}
                  </Item>
                )}
              </>
            )}
            {expense.linked && (
              <Item label={v.linked}>
                <Link href={`/expenses/${expense.linked.id}`} className={linkClass}>
                  {expense.linked.reference}
                </Link>
              </Item>
            )}
          </dl>
          <section className="space-y-1">
            <h2 className="text-sm font-semibold">{expensesCopy.form.justification}</h2>
            <p className="text-sm whitespace-pre-line">{expense.justification}</p>
          </section>
          <ExpenseLines expense={expense} />
          {expense.type === "purchase_request" ? (
            <FinancialSummary
              totals={expense.totals}
              rate={expense.rate}
              heading={v.requested}
              className="sm:ml-auto sm:max-w-sm"
            />
          ) : (
            <p className="flex justify-between text-sm sm:ml-auto sm:max-w-sm">
              <span className="font-semibold">{expensesCopy.form.totalPaid}</span>
              <span className="tabular text-xl font-semibold">
                {formatCAD(expense.totals.total)}
              </span>
            </p>
          )}
          <DecisionHistory expense={expense} zone={zone} />
        </article>

        <div className="space-y-6">
          {top}
          {receipts && (
            <div className={cardClass}>
              <ReceiptList expenseId={expense.id} receipts={receipts} />
            </div>
          )}
          <section aria-labelledby="impact-heading" className={cn(cardClass, "space-y-3")}>
            <h2 id="impact-heading" className="text-base font-semibold">
              {r.impact}
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-fg-muted">{r.remainingBefore}</dt>
                <dd className="tabular font-medium">
                  <RemainingText cents={expense.figures.remaining} />
                </dd>
              </div>
              {pending && (
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-muted">{r.remainingAfter}</dt>
                  <dd className="tabular font-semibold">
                    <RemainingText
                      cents={expense.figures.remaining + expense.releasesCents - amount}
                    />
                  </dd>
                </div>
              )}
            </dl>
          </section>
          <section className={cn(cardClass, "space-y-4")}>
            <Warnings expense={expense} warnings={warnings} />
            {decision}
          </section>
        </div>
      </div>

      <BudgetStrip department={expense.department.name} figures={expense.figures} />
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function Warning({
  icon: Icon = AlertTriangle,
  children,
}: {
  icon?: typeof AlertTriangle;
  children: React.ReactNode;
}) {
  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-control border border-warning p-3 text-sm"
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Warnings({ expense, warnings }: { expense: ExpenseView; warnings: ExpenseWarnings }) {
  const c = expense.content;
  return (
    <div className="space-y-3">
      {warnings.overBy > 0 && (
        <OverBudgetWarning
          department={expense.department.name}
          overBy={warnings.overBy}
          message={r.overNow(expense.department.name, formatCAD(warnings.overBy))}
          explanation={c.overBudgetExplanation}
          explanationLabel={r.overExplanation}
        />
      )}
      {warnings.aboveCommitmentBy > 0 && (
        <Warning>
          <p>{r.aboveCommitment(formatCAD(warnings.aboveCommitmentBy))}</p>
        </Warning>
      )}
      {warnings.duplicates.length > 0 && (
        <Warning icon={Copy}>
          <p>{r.duplicateWarning}</p>
          <p>
            {warnings.duplicates.map((d, i) => (
              <span key={d.id}>
                {i > 0 && ", "}
                <Link href={`/expenses/${d.id}`} className={linkClass}>
                  {d.reference ?? d.id.slice(0, 8)}
                </Link>
              </span>
            ))}
          </p>
        </Warning>
      )}
      {warnings.late && (
        <Warning icon={Clock}>
          <p>{r.lateWarning(warnings.claimDeadlineDays)}</p>
          {c.lateExplanation && (
            <p className="whitespace-pre-line">
              <span className="text-fg-muted">{r.lateExplanation}: </span>
              {c.lateExplanation}
            </p>
          )}
        </Warning>
      )}
      {c.noReceiptReason && (
        <Warning>
          <p>{r.noReceiptWarning}</p>
          <p className="whitespace-pre-line">{c.noReceiptReason}</p>
        </Warning>
      )}
    </div>
  );
}

function DecisionHistory({ expense, zone }: { expense: ExpenseView; zone: string }) {
  if (expense.decisions.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{r.history}</h2>
      <ol className="space-y-2">
        {expense.decisions.map((d) => (
          <li key={d.id} className="rounded-control border border-border p-3 text-sm">
            <p className="font-medium">
              {v.decision[d.decision]} · {r.by(d.decidedBy, r.roles[d.actingRole] ?? d.actingRole)}
            </p>
            <p className="text-xs text-fg-muted">{formatDateTime(d.createdAt, zone)}</p>
            {d.approved && (
              <p className="tabular">
                {v.approvedAmount}: {formatCAD(d.approved.total)}
              </p>
            )}
            {d.reason && <p className="whitespace-pre-line">{d.reason}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
