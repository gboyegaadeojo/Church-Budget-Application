import type { BadgeTone } from "@/components/ui/display";
import type { CycleStatus } from "@/domain/cycles/status";

/** DRD 7.2: Open is information; Draft and Closed are neutral. */
export const CYCLE_TONE: Record<CycleStatus, BadgeTone> = {
  draft: "neutral",
  open: "info",
  closed: "neutral",
};
