import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { FinancialSummary } from "@/components/financial-summary";
import { AdminSkeleton, PageHeader } from "@/components/ui/display";
import { buttonClass, cardClass, linkClass } from "@/components/ui/styles";
import { expensesCopy } from "@/copy/expenses";
import { getDb } from "@/db";
import { ExpenseMessages } from "@/components/expense-messages";
import { getExpenseThread } from "@/domain/expenses/messages";
import { getExpenseView, type ExpenseView } from "@/domain/expenses/queries";
import { paymentOf } from "@/domain/expenses/payment";
import { listReceipts } from "@/domain/expenses/receipts";
import { PENDING_STATUSES } from "@/domain/expenses/status";
import { getChurchTimeZone } from "@/domain/settings";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";
import { BudgetStrip, OverBudgetWarning } from "../budget-strip";
import { ExpenseLines } from "../expense-lines";
import { ReceiptList } from "../receipt-list";
import { ExpenseStatusBadge } from "../status-badge";
import { ApprovalTracker, trackerSteps } from "../tracker";
import { ExpenseNotFound } from "./not-found-state";
import { CancelPurchaseRequest, WithdrawExpense } from "./requester-actions";

const v = expensesCopy.view;

export const metadata: Metadata = { title: expensesCopy.mine.title };

const DONE = ["submitted", "edited", "responded", "withdrawn", "cancelled"] as const;
type Done = (typeof DONE)[number];

/** One expense: where it is, what was asked, and what the person can do next (DRD 6.9a). */
export default function ExpensePage({ params, searchParams }: PageProps<"/expenses/[id]">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <ExpenseContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ExpenseContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const viewer = await getViewer();
  const db = getDb();
  const [expense, zone] = await Promise.all([
    getExpenseView(db, viewer, id),
    getChurchTimeZone(db),
  ]);
  if (!expense) return <ExpenseNotFound />;
  const done = DONE.find((d) => d === query.done);
  const receipts = await listReceipts(db, viewer, expense.id);
  // A purchase request's attachments are optional, so its list shows only when it has some.
  const showFiles = expense.type === "expense_claim" || receipts.length > 0;
  const fileKind = expense.type === "expense_claim" ? "receipts" : "attachments";
  const payment = await paymentOf(db, expense.id);
  const pending = ["draft", ...PENDING_STATUSES].includes(expense.status);
  const thread = await getExpenseThread(db, viewer, expense.id);

  return (
    <>
      <PageHeader
        title={expense.title || expensesCopy.mine.untitled}
        back={{ href: "/expenses/mine", label: expensesCopy.mine.title }}
      >
        <ExpenseStatusBadge status={expense.status} />
      </PageHeader>

      {done && <Confirmation done={done} expense={expense} zone={zone} />}

      <div className={cn(cardClass, "space-y-3")}>
        <ApprovalTracker
          zone={zone}
          steps={trackerSteps({
            type: expense.type,
            status: expense.status,
            submittedAt: expense.submittedAt,
            requester: expense.requester.name,
            decisions: expense.decisions,
            paidAt: payment ? new Date(`${payment.paidOn}T12:00:00Z`) : null,
          })}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <article className={cn(cardClass, "min-w-0 space-y-6")}>
          <p className="text-sm text-fg-muted">{expensesCopy.status[expense.status].explain}</p>
          <LatestDecision expense={expense} />
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {expense.referenceNumber && <Item label={v.reference}>{expense.referenceNumber}</Item>}
            <Item label={v.type}>{expensesCopy.types[expense.type]}</Item>
            <Item label={v.department}>{expense.department.name}</Item>
            <Item label={v.cycle}>{expense.cycle.name}</Item>
            <Item label={v.requester}>{expense.requester.name}</Item>
            {expense.submittedAt && (
              <Item label={v.submittedOn}>{formatDateTime(expense.submittedAt, zone)}</Item>
            )}
            {expense.type === "purchase_request" && expense.content.howBought && (
              <Item label={v.howBought}>{expensesCopy.howBought[expense.content.howBought]}</Item>
            )}
            {expense.type === "expense_claim" && <PayeeItems expense={expense} />}
            {expense.linked && (
              <Item label={v.linked}>
                <Link href={`/expenses/${expense.linked.id}`} className={linkClass}>
                  {expense.linked.reference ?? expense.linked.title}
                </Link>
              </Item>
            )}
          </dl>
          {expense.justification && (
            <section className="space-y-1">
              <h2 className="text-sm font-semibold">{expensesCopy.form.justification}</h2>
              <p className="text-sm whitespace-pre-line">{expense.justification}</p>
            </section>
          )}
          <ExpenseLines expense={expense} />
          {showFiles && <ReceiptList expenseId={expense.id} receipts={receipts} kind={fileKind} />}
          {payment && (
            <section className="space-y-1 rounded-control border border-success p-4 text-sm">
              <h2 className="font-semibold">{expensesCopy.payment.paidHeading}</h2>
              <p>
                {expensesCopy.payment.paidSummary(
                  expensesCopy.payment.methods[payment.method],
                  formatDate(payment.paidOn),
                )}{" "}
                · <span className="tabular font-semibold">{formatCAD(payment.amountCents)}</span>
              </p>
              {payment.reference && (
                <p>
                  {expensesCopy.payment.reference}: {payment.reference}
                </p>
              )}
              {payment.chequeSigner1Name && (
                <p>
                  {expensesCopy.payment.signers}: {payment.chequeSigner1Name},{" "}
                  {payment.chequeSigner2Name}
                </p>
              )}
            </section>
          )}
          {expense.content.noReceiptReason && (
            <Note label={v.noReceipt}>{expense.content.noReceiptReason}</Note>
          )}
          {expense.content.lateExplanation && (
            <Note label={v.late}>{expense.content.lateExplanation}</Note>
          )}
          {pending && expense.impact.overBy > 0 && (
            <OverBudgetWarning
              department={expense.department.name}
              overBy={expense.impact.overBy}
              explanation={expense.content.overBudgetExplanation}
              explanationLabel={v.overBudget}
            />
          )}
        </article>

        <aside
          aria-label={expensesCopy.budget.heading}
          className={cn(cardClass, "space-y-4 lg:sticky lg:top-20")}
        >
          {expense.type === "purchase_request" ? (
            <FinancialSummary totals={expense.totals} rate={expense.rate} />
          ) : (
            <p className="flex items-baseline justify-between gap-4 text-sm">
              <span className="font-semibold">{expensesCopy.form.totalPaid}</span>
              <span className="tabular text-xl font-semibold">
                {formatCAD(expense.totals.total)}
              </span>
            </p>
          )}
          {expense.approved && (
            <p className="flex items-baseline justify-between gap-4 border-t border-border pt-3 text-sm">
              <span className="font-semibold">{v.approvedAmount}</span>
              <span className="tabular text-lg font-semibold">
                {formatCAD(expense.approved.total)}
              </span>
            </p>
          )}
          <Actions expense={expense} />
        </aside>
      </div>

      <BudgetStrip
        department={expense.department.name}
        figures={expense.figures}
        after={pending ? expense.impact.after : undefined}
      />
      {thread && <ExpenseMessages expenseId={expense.id} thread={thread} zone={zone} />}
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

function Note({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h2 className="text-sm font-semibold">{label}</h2>
      <p className="text-sm whitespace-pre-line">{children}</p>
    </section>
  );
}

function PayeeItems({ expense }: { expense: ExpenseView }) {
  const c = expense.content;
  const payee =
    c.payeeKind === "church_card"
      ? expensesCopy.payee.church_card
      : (expense.payee.name ?? (c.payeeKind === "self" ? expense.requester.name : c.payeeName));
  return (
    <>
      <Item label={v.payee}>{payee}</Item>
      {c.payeeKind !== "church_card" && c.paymentPreference && (
        <Item label={v.paymentPreference}>
          {expensesCopy.paymentPreference[c.paymentPreference]}
          {c.paymentPreference === "e_transfer" &&
            expense.payee.email &&
            ` (${expense.payee.email})`}
        </Item>
      )}
    </>
  );
}

/** The latest decision's note for the department: a question, a reason, an approved amount. */
function LatestDecision({ expense }: { expense: ExpenseView }) {
  const latest = expense.decisions.at(-1);
  if (!latest) return null;
  const tone =
    latest.decision === "returned"
      ? "border-warning"
      : latest.decision === "declined"
        ? "border-danger"
        : "border-success";
  return (
    <section className={cn("space-y-1 rounded-control border p-4 text-sm", tone)}>
      <h2 className="font-semibold">
        {v.decision[latest.decision]} · {latest.decidedBy}
      </h2>
      {latest.approved && (
        <p>
          {v.approvedAmount}:{" "}
          <span className="tabular font-semibold">{formatCAD(latest.approved.total)}</span>
        </p>
      )}
      {latest.reason && <p className="whitespace-pre-line">{latest.reason}</p>}
    </section>
  );
}

/** What the department can do next (FR-44). */
function Actions({ expense }: { expense: ExpenseView }) {
  if (expense.readOnly) return <p className="text-sm text-fg-muted">{v.readOnly}</p>;
  const edit = `/expenses/${expense.id}/edit`;
  return (
    <div className="space-y-3">
      {expense.canEdit && (
        <Link href={edit} className={buttonClass("primary", "w-full")}>
          {expense.status === "draft"
            ? v.continueDraft
            : expense.status === "returned"
              ? v.respond
              : v.edit}
        </Link>
      )}
      {expense.canWithdraw && <WithdrawExpense id={expense.id} version={expense.version} />}
      {expense.canCancel && <CancelPurchaseRequest id={expense.id} version={expense.version} />}
    </div>
  );
}

function Confirmation({ done, expense, zone }: { done: Done; expense: ExpenseView; zone: string }) {
  return (
    <section
      aria-labelledby="confirmation-heading"
      className={cn(cardClass, "flex items-start gap-3 border-success")}
    >
      <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" />
      <div className="space-y-1 text-sm">
        <h2 id="confirmation-heading" className="text-lg font-semibold">
          {v.confirmation[done]}
        </h2>
        {expense.referenceNumber && (
          <p>
            {v.reference}: <span className="font-medium">{expense.referenceNumber}</span>
          </p>
        )}
        <p>
          {expensesCopy.status[expense.status].label} ·{" "}
          <span className="tabular font-semibold">{formatCAD(expense.totals.total)}</span>
        </p>
        {done === "submitted" && expense.submittedAt && (
          <p className="text-fg-muted">{formatDateTime(expense.submittedAt, zone)}</p>
        )}
        {(done === "submitted" || done === "responded") && <p>{v.next}</p>}
      </div>
    </section>
  );
}
