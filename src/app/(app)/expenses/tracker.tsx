import { CheckCircle2, Circle, Clock, XCircle } from "lucide-react";
import { expensesCopy } from "@/copy/expenses";
import type { ExpenseDecisionView } from "@/domain/expenses/queries";
import { levelApproved, type ExpenseStatus, type ExpenseType } from "@/domain/expenses/status";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/time-zone";

const t = expensesCopy.tracker;

type StepState = "done" | "current" | "waiting" | "stopped";
type Step = { label: string; state: StepState; who?: string; when?: Date | null };

const ICON = { done: CheckCircle2, current: Clock, waiting: Circle, stopped: XCircle } as const;
const STATE_WORD = { done: t.done, current: t.current, waiting: t.waiting, stopped: t.stopped };

/**
 * Where an expense is (DRD 6.9a "approval tracker"): Submitted → Accountant and Board
 * Chair (side by side, in either order) → Processing → Paid (or Purchased), with names and
 * dates. Each step has an icon and words, never colour alone.
 */
export function trackerSteps(input: {
  type: ExpenseType;
  status: ExpenseStatus;
  submittedAt: Date | null;
  requester: string;
  decisions: ExpenseDecisionView[];
  paidAt?: Date | null;
}): Step[] {
  const { status } = input;
  // This round's decisions: everything since the latest return to the department.
  const lastReturn = input.decisions.findLastIndex((d) => d.decision === "returned");
  const round = input.decisions.slice(lastReturn + 1);
  const last = (level: "accountant" | "board") => round.findLast((d) => d.level === level);
  const stopped = status === "withdrawn" || status === "declined" || status === "cancelled";
  const finished = status === "paid" || status === "purchased" || status === "closed";

  const approval = (level: "accountant" | "board"): StepState => {
    if (status === "draft") return "waiting";
    if (levelApproved(status, level)) return "done";
    if (status === "declined") return last(level)?.decision === "declined" ? "stopped" : "waiting";
    if (status === "withdrawn") return "stopped";
    if (status === "returned") return "waiting";
    return "current";
  };
  const decidedBy = (level: "accountant" | "board") => {
    const d = last(level);
    return d && d.decision !== "returned" ? d : undefined;
  };
  const accountant = decidedBy("accountant");
  const board = decidedBy("board");
  const processing: StepState = finished
    ? "done"
    : status === "approved" || status === "processing"
      ? "current"
      : status === "cancelled"
        ? "stopped"
        : "waiting";

  return [
    {
      label: t.submitted,
      state: status === "draft" ? "waiting" : "done",
      who: input.requester,
      when: input.submittedAt,
    },
    {
      label: t.accountant,
      state: approval("accountant"),
      who: accountant?.decidedBy,
      when: accountant?.createdAt,
    },
    {
      label: t.board,
      state: approval("board"),
      who: board?.decidedBy,
      when: board?.createdAt,
    },
    { label: t.processing, state: stopped && status !== "cancelled" ? "waiting" : processing },
    {
      label: input.type === "purchase_request" ? t.purchased : t.paid,
      state: finished ? "done" : "waiting",
      when: input.paidAt,
    },
  ];
}

export function ApprovalTracker({ steps, zone }: { steps: Step[]; zone: string }) {
  return (
    <nav aria-label={t.label} className="overflow-x-auto" tabIndex={0}>
      <ol className="flex min-w-max gap-2 sm:gap-4">
        {steps.map((step, i) => {
          const Icon = ICON[step.state];
          return (
            <li
              key={step.label}
              aria-current={step.state === "current" ? "step" : undefined}
              className="flex items-start gap-2"
            >
              {i > 0 && (
                <span aria-hidden="true" className="mt-2.5 h-px w-4 bg-border-strong sm:w-8" />
              )}
              <span className="flex items-start gap-1.5">
                <Icon
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    step.state === "done" && "text-success",
                    step.state === "current" && "text-info",
                    step.state === "waiting" && "text-fg-muted",
                    step.state === "stopped" && "text-danger",
                  )}
                  aria-hidden="true"
                />
                <span className="text-sm">
                  <span className="block font-medium">{step.label}</span>
                  <span className="block text-xs text-fg-muted">
                    {STATE_WORD[step.state]}
                    {step.who && ` · ${step.who}`}
                  </span>
                  {step.when && (
                    <span className="block text-xs text-fg-muted">
                      {formatDateTime(step.when, zone)}
                    </span>
                  )}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
