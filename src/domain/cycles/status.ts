/** Budget cycle status machine (Requirements 4.2, 4.3). Draft → Open → Closed, and reopen. */

export const CYCLE_STATUSES = ["draft", "open", "closed"] as const;
export type CycleStatus = (typeof CYCLE_STATUSES)[number];

export type CycleEvent = "open" | "close" | "reopen";

const TRANSITIONS: Record<CycleEvent, Partial<Record<CycleStatus, CycleStatus>>> = {
  open: { draft: "open" },
  close: { open: "closed" },
  reopen: { closed: "open" },
};

export class InvalidCycleTransitionError extends Error {
  constructor(
    readonly from: CycleStatus,
    readonly event: CycleEvent,
  ) {
    super(`Cannot ${event} a budget cycle that is ${from}`);
    this.name = "InvalidCycleTransitionError";
  }
}

export function canTransitionCycle(from: CycleStatus, event: CycleEvent): boolean {
  return TRANSITIONS[event][from] !== undefined;
}

export function transitionCycle(from: CycleStatus, event: CycleEvent): CycleStatus {
  const to = TRANSITIONS[event][from];
  if (!to) throw new InvalidCycleTransitionError(from, event);
  return to;
}

/** The deadline can change while the cycle is Draft or Open (4.3). */
export function deadlineEditable(status: CycleStatus): boolean {
  return status === "draft" || status === "open";
}
