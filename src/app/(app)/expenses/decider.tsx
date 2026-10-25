import { expensesCopy } from "@/copy/expenses";
import { Badge } from "@/components/ui/display";
import type { ExpenseDecisionView } from "@/domain/expenses/queries";

const r = expensesCopy.review;
const t = expensesCopy.verbal;

/**
 * Who made a decision, as every screen shows it. A verbal approval names the approver,
 * says "verbally", and is never worded as if they approved in the app (2026-10-24).
 */
export function deciderText(d: ExpenseDecisionView): string {
  const role = r.roles[d.actingRole] ?? d.actingRole;
  return d.channel === "verbal" ? t.by(d.decidedBy, role) : r.by(d.decidedBy, role);
}

/** "Verbal": a decision given verbally and recorded by the Church Administrator. */
export function VerbalBadge() {
  return (
    <span className="ml-2 align-middle">
      <Badge tone="info">{t.badge}</Badge>
    </span>
  );
}
