import { CheckCircle2 } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/display";
import { expensesCopy } from "@/copy/expenses";
import type { ExpenseStatus } from "@/domain/expenses/status";

/**
 * Expense status badges (DRD 6.9a): pending states Information, Returned Warning,
 * Approved Success, Paid / Purchased / Closed success with a check, Declined Danger,
 * Cancelled and Withdrawn neutral.
 */
const TONE: Record<ExpenseStatus, BadgeTone> = {
  draft: "neutral",
  submitted: "info",
  in_review: "info",
  returned: "warning",
  awaiting_board: "info",
  approved: "success",
  processing: "info",
  paid: "success",
  purchased: "success",
  closed: "success",
  cancelled: "neutral",
  withdrawn: "neutral",
  declined: "danger",
};

const DONE: readonly ExpenseStatus[] = ["paid", "purchased", "closed"];

export function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
  return (
    <Badge tone={TONE[status]}>
      {DONE.includes(status) && <CheckCircle2 className="mr-1 size-3.5" aria-hidden="true" />}
      {expensesCopy.status[status].label}
    </Badge>
  );
}
