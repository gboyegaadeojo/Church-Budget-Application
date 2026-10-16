import { CheckCircle2, Circle, Clock, XCircle } from "lucide-react";
import { expensesCopy } from "@/copy/expenses";
import type { ExpenseDecisionView } from "@/domain/expenses/queries";
import type { ExpenseStatus, ExpenseType } from "@/domain/expenses/status";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/time-zone";

const t = expensesCopy.tracker;

type StepState = "done" | "current" | "waiting" | "stopped";
type Step = { label: string; state: StepState; who?: string; when?: Date | null };

const ICON = { done: CheckCircle2, current: Clock, waiting: Circle, stopped: XCircle } as const;
const STATE_WORD = { done: t.done, current: t.current, waiting: t.waiting, stopped: t.stopped };

/**
 * Where an expense is (DRD 6.9a "approval tracker"): Submitted → Accountant → Board
 * Chair → Processing → Paid (or Purchased), with names and dates. Each step has an icon
 * and words, never colour alone.
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
  const last = (level: "accountant" | "board") =>
    input.decisions.findLast((d) => d.level === level && d.decision !== "returned");
  const accountant = last("accountant");
  const board = last("board");
  // Steps: 0 Submitted, 1 Accountant, 2 Board Chair, 3 Processing, 4 Paid or Purchased.
  const POSITION: Record<ExpenseStatus, number> = {
    draft: -1,
    submitted: 1,
    in_review: 1,
    returned: 1,
    awaiting_board: 2,
    approved: 3,
    processing: 3,
    paid: 5,
    purchased: 5,
    closed: 5,
    withdrawn: 1,
    declined: board?.decision === "declined" ? 2 : 1,
    cancelled: 3,
  };
  const stopped = status === "withdrawn" || status === "declined" || status === "cancelled";
  const at = POSITION[status];
  const stateOf = (i: number): StepState => {
    if (at < 0) return "waiting";
    if (i < at) return "done";
    if (i === at) return stopped ? "stopped" : "current";
    return "waiting";
  };
  return [
    { label: t.submitted, state: stateOf(0), who: input.requester, when: input.submittedAt },
    {
      label: t.accountant,
      state: stateOf(1),
      who: accountant?.decidedBy,
      when: accountant?.createdAt,
    },
    { label: t.board, state: stateOf(2), who: board?.decidedBy, when: board?.createdAt },
    { label: t.processing, state: stateOf(3) },
    {
      label: input.type === "purchase_request" ? t.purchased : t.paid,
      state: stateOf(4),
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
