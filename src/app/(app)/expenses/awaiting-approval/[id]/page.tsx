import { Suspense } from "react";
import type { Metadata } from "next";
import { BadgeCheck } from "lucide-react";
import { AdminSkeleton } from "@/components/ui/display";
import { cardClass } from "@/components/ui/styles";
import { expensesCopy } from "@/copy/expenses";
import { getDb } from "@/db";
import { boardPermission } from "@/domain/expenses/board";
import { getExpenseView } from "@/domain/expenses/queries";
import { listReceipts } from "@/domain/expenses/receipts";
import { warningsFor } from "@/domain/expenses/review-queries";
import { loadExpense } from "@/domain/expenses/service";
import { getChurchTimeZone } from "@/domain/settings";
import { authorize } from "@/lib/authz";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import { getViewer } from "@/lib/viewer";
import { ExpenseNotFound } from "../../[id]/not-found-state";
import { DecisionPanel } from "../../review/decision-panel";
import { ReviewView } from "../../review/review-view";
import { boardDecideAction } from "../actions";

const r = expensesCopy.review;

export const metadata: Metadata = { title: r.boardTitle };

/**
 * The Board Chair's decision screen (DRD 6.9a "Board Chair review"): the accountant's
 * approved amount and note first, the same warnings the accountant saw (worked out now),
 * and the final decision. Mobile-first: the approval email's button opens it.
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
  const waiting = expense.status === "awaiting_board";
  const permission = await boardPermission(db, viewer, row);
  const [receipts, warnings, zone] = await Promise.all([
    expense.type === "expense_claim" ? listReceipts(db, viewer, id) : null,
    warningsFor(db, row, waiting ? (expense.approved?.total ?? 0) : 0),
    getChurchTimeZone(db),
  ]);
  const doneKey = typeof query.done === "string" ? query.done : null;
  const done = doneKey && doneKey in r.done ? r.done[doneKey as keyof typeof r.done] : null;
  const accountant = expense.decisions.findLast(
    (d) => d.level === "accountant" && d.decision !== "returned" && d.decision !== "declined",
  );

  const top = accountant?.approved ? (
    <section className={cn(cardClass, "space-y-2 border-success")}>
      <p className="flex items-start gap-2 text-sm font-medium">
        <BadgeCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
        {r.accountantApproved(formatCAD(accountant.approved.total), accountant.decidedBy)}
      </p>
      {accountant.reason && (
        <p className="text-sm whitespace-pre-line">
          <span className="text-fg-muted">{r.accountantNote}: </span>
          {accountant.reason}
        </p>
      )}
    </section>
  ) : null;

  let decision: React.ReactNode;
  if (!waiting) {
    decision = (
      <p className="text-sm text-fg-muted">{expensesCopy.status[expense.status].explain}</p>
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
    const max = expense.approved?.total ?? 0;
    decision = (
      <DecisionPanel
        id={expense.id}
        version={expense.version}
        type={expense.type}
        rate={expense.rate}
        maxCents={max}
        action={boardDecideAction}
        options={[
          {
            kind: "approve",
            label: r.finalApprove,
            note: { label: r.note, required: false },
            confirmTitle: r.confirmTitle.final_approve,
            confirmBody: r.confirmBody.final,
            tone: "primary",
          },
          {
            kind: "approve_smaller",
            label: r.approveSmaller,
            amount: true,
            note: { label: r.reason, required: true },
            confirmTitle: r.confirmTitle.approve_smaller,
            confirmBody: r.confirmBody.final,
            tone: "primary",
          },
          {
            kind: "return",
            label: r.returnToAccountant,
            note: { label: r.question, required: true },
            confirmTitle: r.confirmTitle.board_return,
            confirmBody: r.confirmBody.board_return,
            tone: "secondary",
          },
          {
            kind: "decline",
            label: r.decline,
            note: { label: r.reason, required: true },
            confirmTitle: r.confirmTitle.board_decline,
            confirmBody: r.confirmBody.decline,
            tone: "danger",
          },
        ]}
      />
    );
  }

  return (
    <ReviewView
      expense={expense}
      receipts={receipts}
      warnings={warnings}
      zone={zone}
      done={done}
      top={top}
      back={{ href: "/expenses/awaiting-approval", label: r.boardTitle }}
      decision={decision}
    />
  );
}
