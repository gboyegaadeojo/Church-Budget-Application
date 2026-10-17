import { BadgeCheck } from "lucide-react";
import { cardClass } from "@/components/ui/styles";
import { expensesCopy } from "@/copy/expenses";
import type { ExpenseView } from "@/domain/expenses/queries";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import type { DecisionOption } from "./decision-panel";

const r = expensesCopy.review;

type Level = "accountant" | "board";

/** The other approver's approval in this round, if they've given it (6B.4, AC-143). */
export function otherApprovalOf(expense: ExpenseView, level: Level) {
  const waitingOnMe = level === "accountant" ? "awaiting_accountant" : "awaiting_board";
  if (expense.status !== waitingOnMe) return null;
  const other = level === "accountant" ? "board" : "accountant";
  const d = expense.decisions.findLast((x) => x.level === other);
  return d?.approved ? d : null;
}

/** Shown first on the decision screen: the other approver's amount and note. */
export function OtherApproval({ expense, level }: { expense: ExpenseView; level: Level }) {
  const d = otherApprovalOf(expense, level);
  if (!d?.approved) return null;
  const amount = formatCAD(d.approved.total);
  return (
    <section className={cn(cardClass, "space-y-2 border-success")}>
      <p className="flex items-start gap-2 text-sm font-medium">
        <BadgeCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
        {level === "accountant"
          ? r.boardApproved(amount, d.decidedBy)
          : r.accountantApproved(amount, d.decidedBy)}
      </p>
      {d.reason && (
        <p className="text-sm whitespace-pre-line">
          <span className="text-fg-muted">{r.otherNote}: </span>
          {d.reason}
        </p>
      )}
      <p className="text-sm text-fg-muted">{r.lowerWins}</p>
    </section>
  );
}

/** The four decisions for either approver; the confirmation says whether it's the second. */
export function decisionOptions(level: Level, secondOfTwo: boolean): DecisionOption[] {
  const approveBody = secondOfTwo ? r.confirmBody.secondOfTwo : r.confirmBody.firstOfTwo;
  return [
    {
      kind: "approve",
      label: level === "accountant" ? r.approve : r.finalApprove,
      note: { label: r.note, required: false },
      confirmTitle: level === "accountant" ? r.confirmTitle.approve : r.confirmTitle.final_approve,
      confirmBody: approveBody,
      tone: "primary",
    },
    {
      kind: level === "accountant" ? "approve_different_amount" : "approve_smaller",
      label: level === "accountant" ? r.approveDifferent : r.approveSmaller,
      amount: true,
      note: { label: r.reason, required: true },
      confirmTitle:
        level === "accountant"
          ? r.confirmTitle.approve_different_amount
          : r.confirmTitle.approve_smaller,
      confirmBody: approveBody,
      tone: "primary",
    },
    {
      kind: "return",
      label: r.returnToRequester,
      note: { label: r.question, required: true },
      confirmTitle: level === "accountant" ? r.confirmTitle.return : r.confirmTitle.board_return,
      confirmBody: r.confirmBody.return,
      tone: "secondary",
    },
    {
      kind: "decline",
      label: r.decline,
      note: { label: r.reason, required: true },
      confirmTitle: level === "accountant" ? r.confirmTitle.decline : r.confirmTitle.board_decline,
      confirmBody: r.confirmBody.decline,
      tone: "danger",
    },
  ];
}

/** The done banner after a decision: which one, and whether it completed the approval. */
export function doneKey(kind: string, status: string): keyof typeof r.done {
  if (kind === "return") return "return";
  if (kind === "decline") return "decline";
  return status === "approved" ? "fully_approved" : "waiting";
}
