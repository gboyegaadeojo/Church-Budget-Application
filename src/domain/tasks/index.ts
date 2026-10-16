import { getDb } from "@/db";
import type { Viewer } from "@/lib/roles";
import {
  annualRequesterTasks,
  annualReviewTasks,
  canHaveAnnualRequesterTasks,
  canHaveAnnualReviewTasks,
} from "./annual";
import type { Task, TaskProvider } from "./types";

export type { Task, TaskProvider } from "./types";

/**
 * Providers are registered as each part of the app is built
 * (annual budgets in Stage 1, expenses in Stage 3, spending in Stage 4).
 * Each skips the database for people it can have nothing for.
 */
export const taskProviders: TaskProvider[] = [
  async (viewer) =>
    canHaveAnnualRequesterTasks(viewer) ? annualRequesterTasks(getDb(), viewer) : [],
  async (viewer) => (canHaveAnnualReviewTasks(viewer) ? annualReviewTasks(getDb(), viewer) : []),
];

/**
 * Everything waiting for this person across all their roles, oldest first (FR-37).
 * The same item reached through two roles appears once.
 */
export async function getMyTasks(
  viewer: Viewer,
  providers: readonly TaskProvider[] = taskProviders,
): Promise<Task[]> {
  const lists = await Promise.all(providers.map((provider) => provider(viewer)));
  const byId = new Map<string, Task>();
  for (const task of lists.flat()) {
    const existing = byId.get(task.id);
    if (!existing || task.waitingSince < existing.waitingSince) byId.set(task.id, task);
  }
  return [...byId.values()].sort(
    (a, b) => a.waitingSince.getTime() - b.waitingSince.getTime() || a.id.localeCompare(b.id),
  );
}

/** Whole days an item has waited, for "Waiting 3 days". */
export function daysWaiting(since: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / 86_400_000));
}
