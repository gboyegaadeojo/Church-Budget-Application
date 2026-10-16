import type { AreaId } from "@/domain/navigation";
import type { Viewer } from "@/lib/roles";

/** One item waiting for this person's action (FR-37). */
export type Task = {
  /** Stable across providers, e.g. "expense:EXP-2027-0042:final-approval". */
  id: string;
  area: Exclude<AreaId, "home">;
  /** Plain-language action, e.g. "Final approval needed". */
  action: string;
  /** What it is about, e.g. "Worship expense". */
  item: string;
  amountCents?: number;
  /** When the item started waiting for this person. */
  waitingSince: Date;
  href: string;
  buttonLabel: string;
  /** A short extra fact, e.g. "Backup reminded" (FR-38). */
  note?: string;
};

/**
 * A source of tasks for one kind of work (annual reviews, expense approvals, ...).
 * Each provider checks the viewer's roles itself and returns nothing if they don't apply.
 */
export type TaskProvider = (viewer: Viewer) => Promise<Task[]>;
