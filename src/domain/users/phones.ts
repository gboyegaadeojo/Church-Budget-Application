import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { users } from "@/db/schema";
import type { Db } from "@/db/types";
import { PlanningCenterUnavailableError, type PlanningCenterDirectory } from "@/lib/pco";
import { phoneFrom } from "./verification";

/** Numbers read this recently (by tonight's Group Leader check) aren't read again. */
const FRESH_MS = 20 * 3_600_000;

/**
 * Nightly: refreshes the reminder-text number of everyone linked to Planning Center
 * (docs/decisions.md 2026-10-18). Only the phone is synced; the account email stays as it
 * was set up. Stops quietly if Planning Center goes down part way; tomorrow catches up.
 */
export async function refreshPhones(
  db: Db,
  directory: PlanningCenterDirectory,
  now: Date = new Date(),
): Promise<number> {
  const due = await db
    .select({ id: users.id, pcoPersonId: users.pcoPersonId, phone: users.phoneE164 })
    .from(users)
    .where(
      and(
        eq(users.active, true),
        isNotNull(users.pcoPersonId),
        or(
          isNull(users.phoneCheckedAt),
          lt(users.phoneCheckedAt, new Date(now.getTime() - FRESH_MS)),
        ),
      ),
    );
  let changed = 0;
  for (const user of due) {
    let person;
    try {
      person = await directory.getPerson(user.pcoPersonId!);
    } catch (error) {
      if (error instanceof PlanningCenterUnavailableError) break;
      throw error;
    }
    if (!person) continue;
    const next = phoneFrom(person, now);
    if (next.phoneE164 !== user.phone) changed++;
    await db.update(users).set(next).where(eq(users.id, user.id));
  }
  return changed;
}
