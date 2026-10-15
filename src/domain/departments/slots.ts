import type { RepresentativeType } from "@/lib/roles";

/**
 * A leader's place in a department (FR-38): the Primary, up to two ranked Backups
 * (Backup 1 takes over first), or a Representative. Stored as `representative_type`
 * plus `backup_rank`.
 */
export const LEADER_SLOTS = ["primary", "backup_1", "backup_2", "representative"] as const;
export type LeaderSlot = (typeof LEADER_SLOTS)[number];

export type SlotParts = { type: RepresentativeType; backupRank: 1 | 2 | null };

export function slotOf(row: { type: RepresentativeType; backupRank: number | null }): LeaderSlot {
  if (row.type !== "backup") return row.type;
  return row.backupRank === 2 ? "backup_2" : "backup_1";
}

export function slotParts(slot: LeaderSlot): SlotParts {
  switch (slot) {
    case "backup_1":
      return { type: "backup", backupRank: 1 };
    case "backup_2":
      return { type: "backup", backupRank: 2 };
    default:
      return { type: slot, backupRank: null };
  }
}

/** Display order: Primary, Backup 1, Backup 2, Representatives. */
export const SLOT_ORDER: Record<LeaderSlot, number> = {
  primary: 0,
  backup_1: 1,
  backup_2: 2,
  representative: 3,
};
