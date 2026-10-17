import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminSkeleton } from "@/components/ui/display";
import { expensesCopy } from "@/copy/expenses";
import { getDb } from "@/db";
import { boardPermission } from "@/domain/expenses/board";
import { getExpenseView } from "@/domain/expenses/queries";
import { listReceipts } from "@/domain/expenses/receipts";
import { warningsFor } from "@/domain/expenses/review-queries";
import { loadExpense } from "@/domain/expenses/service";
import { BOARD_WAITING } from "@/domain/expenses/status";
import { getChurchTimeZone } from "@/domain/settings";
import { authorize } from "@/lib/authz";
import { getViewer } from "@/lib/viewer";
import { ExpenseNotFound } from "../../[id]/not-found-state";
import { startExpenseReviewAction } from "../../review/actions";
import { decisionOptions, OtherApproval } from "../../review/approvals";
import { DecisionPanel } from "../../review/decision-panel";
import { ReviewView } from "../../review/review-view";
import { StartReview } from "../../review/start-review";
import { boardDecideAction } from "../actions";

const r = expensesCopy.review;

export const metadata: Metadata = { title: r.boardTitle };

/**
 * The Board Chair's decision screen (DRD 6.9a "Board Chair review"), asked at submission
 * alongside the accountant (6B.4 as changed 2026-10-16): the accountant's approval if they
 * gave it first, the same warnings the accountant sees (worked out now), and the decision.
 * Mobile-first: the approval email's button opens it.
 */
export default function BoardReviewPage({
  params,
  searchParams,
}: PageProps<"/expenses/awaiting-approval/[id]">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <BoardReviewContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function BoardReviewContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const viewer = await getViewer();
  const db = getDb();
  if (!authorize(viewer, "expense.board_queue").allowed) return <ExpenseNotFound />;
  const expense = await getExpenseView(db, viewer, id);
  if (!expense) return <ExpenseNotFound />;
  const row = await loadExpense(db, id);
  const waiting = BOARD_WAITING.includes(expense.status);
  const permission = await boardPermission(db, viewer, row);
  const amount = expense.approved?.total ?? expense.totals.total;
  const [receipts, warnings, zone] = await Promise.all([
    expense.type === "expense_claim" ? listReceipts(db, viewer, id) : null,
    warningsFor(db, row, waiting ? amount : 0),
    getChurchTimeZone(db),
  ]);
  const doneKey = typeof query.done === "string" ? query.done : null;
  const done = doneKey && doneKey in r.done ? r.done[doneKey as keyof typeof r.done] : null;

  let decision: React.ReactNode;
  if (!waiting) {
    decision = (
      <p className="text-sm text-fg-muted">
        {expense.status === "awaiting_accountant"
          ? r.alreadyApproved
          : expensesCopy.status[expense.status].explain}
      </p>
    );
  } else if (!permission.allowed) {
    decision = (
      <p className="text-sm text-fg-muted">
        {permission.reason === "vice_not_needed"
          ? expensesCopy.errors.viceChairNotNeeded
          : (r.conflict[permission.reason as keyof typeof r.conflict] ?? r.conflict.default)}
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
          action={boardDecideAction}
          options={decisionOptions("board", expense.status === "awaiting_board")}
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
      top={<OtherApproval expense={expense} level="board" />}
      back={{ href: "/expenses/awaiting-approval", label: r.boardTitle }}
      decision={decision}
    />
  );
}
