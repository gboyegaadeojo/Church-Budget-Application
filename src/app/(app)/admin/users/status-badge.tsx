import { Badge, type BadgeTone } from "@/components/ui/display";
import { adminCopy } from "@/copy/admin";

const labels = adminCopy.users.statusLabels;

const TONES: Record<keyof typeof labels, BadgeTone> = {
  active: "success",
  pending_department: "info",
  suspended_not_leader: "warning",
  inactive: "neutral",
  deactivated: "neutral",
};

export function UserStatusBadge({
  active,
  accessStatus,
}: {
  active: boolean;
  accessStatus: "active" | "pending_department" | "suspended_not_leader" | "inactive";
}) {
  const key = active ? accessStatus : "deactivated";
  return <Badge tone={TONES[key]}>{labels[key]}</Badge>;
}
