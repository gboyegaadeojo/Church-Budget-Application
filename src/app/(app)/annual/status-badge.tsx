import { Badge, type BadgeTone } from "@/components/ui/display";
import { annualCopy } from "@/copy/annual";
import type { AnnualStatus } from "@/domain/annual/status";

/** Semantic tones for request statuses (DRD 7.2). */
const TONE: Record<AnnualStatus, BadgeTone> = {
  draft: "neutral",
  submitted: "info",
  updated: "info",
  in_review: "info",
  returned: "warning",
  awaiting_second_approval: "info",
  approved: "success",
  declined: "danger",
  closed: "neutral",
};

export function AnnualStatusBadge({ status }: { status: AnnualStatus }) {
  return <Badge tone={TONE[status]}>{annualCopy.status[status].label}</Badge>;
}

/** The plain-language explanation under a status (DRD 7.1). */
export function statusExplanation(status: AnnualStatus, editsLeft: number): string {
  const entry = annualCopy.status[status];
  return typeof entry.explain === "function" ? entry.explain(editsLeft) : entry.explain;
}
