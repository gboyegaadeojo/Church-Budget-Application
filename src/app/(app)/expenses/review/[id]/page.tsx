import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminSkeleton } from "@/components/ui/display";
import { expensesCopy } from "@/copy/expenses";
import { getDb } from "@/db";
import { getExpenseThread } from "@/domain/expenses/messages";
import { getExpenseView } from "@/domain/expenses/queries";
import { listReceipts } from "@/domain/expenses/receipts";
import { warningsFor } from "@/domain/expenses/review-queries";
import { authzContextOf, loadExpense } from "@/domain/expenses/service";
import { getChurchTimeZone } from "@/domain/settings";
import { ACCOUNTANT_WAITING } from "@/domain/expenses/status";
import { authorize } from "@/lib/authz";
import { getViewer } from "@/lib/viewer";
import { ExpenseNotFound } from "../../[id]/not-found-state";
import { accountantDecideAction, startExpenseReviewAction } from "../actions";
import { decisionOptions, OtherApproval } from "../approvals";
import { DecisionPanel } from "../decision-panel";
import { ReviewView } from "../review-view";
import { StartReview } from "../start-review";

const r = expensesCopy.review;

export const metadata: Metadata = { title: r.queueTitle };

/** The accountant's review screen (6B.4, DRD 6.9a); the Board Chair decides alongside. */
export default function ExpenseReviewPage({
  params,
  searchParams,
}: PageProps<"/expenses/review/[id]">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <ReviewContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ReviewContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const viewer = await getViewer();
  const db = getDb();
  if (!authorize(viewer, "expense.review_queue").allowed) return <ExpenseNotFound />;
  const expense = await getExpenseView(db, viewer, id);
  if (!expense || expense.status === "draft") return <ExpenseNotFound />;
  const row = await loadExpense(db, id);
  const can = authorize(viewer, "expense.first_approve", authzContextOf(row));
  const decidable = ACCOUNTANT_WAITING.includes(expense.status);
  const amount = expense.approved?.total ?? expense.totals.total;
  const [receipts, warnings, zone] = await Promise.all([
    expense.type === "expense_claim" ? listReceipts(db, viewer, id) : null,
    warningsFor(db, row, decidable ? amount : 0),
    getChurchTimeZone(db),
  ]);
  const doneKey = typeof query.done === "string" ? query.done : null;
  const done = doneKey && doneKey in r.done ? r.done[doneKey as keyof typeof r.done] : null;

  let decision: React.ReactNode;
  if (!decidable) {
    decision = (
      <p className="text-sm text-fg-muted">
        {expense.status === "awaiting_board"
          ? r.alreadyApproved
          : expensesCopy.status[expense.status].explain}
      </p>
    );
  } else if (!can.allowed) {
    decision = (
      <p className="text-sm text-fg-muted">
        {r.conflict[can.reason as keyof typeof r.conflict] ?? r.conflict.default}
      </p>
    );
  } else {
    decision = (
      <>
        {expense.status === "submitted" && (
          <StartReview start={startExpenseReviewAction.bind(null, id)} />
        )}
        <DecisionPanel
          id={expense.id}
          version={expense.version}
          type={expense.type}
          rate={expense.rate}
          maxCents={expense.totals.total}
          action={accountantDecideAction}
          options={decisionOptions("accountant", expense.status === "awaiting_accountant")}
        />
      </>
    );
  }

  return (
    <ReviewView
      expense={expense}
      receipts={receipts}
      warnings={warnings}
      zone={zone}
      done={done}
      back={{ href: "/expenses/review", label: r.queueTitle }}
      thread={await getExpenseThread(db, viewer, id)}
      top={<OtherApproval expense={expense} level="accountant" />}
      decision={decision}
    />
  );
}
