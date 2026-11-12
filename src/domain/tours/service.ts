import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { userTours } from "@/db/schema";
import type { Tx } from "@/db/types";
import { parseInput } from "@/domain/errors";
import { assertCan, can, type Subject } from "@/lib/authz";
import { TOUR_IDS, TOUR_OUTCOMES, type TourId, type TourOutcome } from "./tours";

/**
 * Who may take each guided tour, and how they left it (decided 2026-11-12). Remembered on
 * the server so the first-time offer shows once, whichever device the person uses. A
 * tour choice isn't financial history and isn't audited (docs/decisions.md 2026-11-12).
 */

export type TourState = { tour: TourId; outcome: TourOutcome | null };

/** The tours this person may take, each with how they left it (null: never). */
export async function myTours(tx: Tx, viewer: Subject): Promise<TourState[]> {
  const allowed = TOUR_IDS.filter((tour) => can(viewer, `tour.${tour}`));
  if (allowed.length === 0) return [];
  const rows = await tx.select().from(userTours).where(eq(userTours.userId, viewer.id));
  return allowed.map((tour) => ({
    tour,
    outcome: rows.find((r) => r.tour === tour)?.outcome ?? null,
  }));
}

const recordSchema = z.object({ tour: z.enum(TOUR_IDS), outcome: z.enum(TOUR_OUTCOMES) });

/** Remembers that the person finished or put aside a tour; a later choice replaces it. */
export async function recordTour(
  tx: Tx,
  actor: Subject,
  input: { tour: unknown; outcome: unknown },
): Promise<void> {
  const { tour, outcome } = parseInput(recordSchema, input);
  assertCan(actor, `tour.${tour}`);
  await tx
    .insert(userTours)
    .values({ userId: actor.id, tour, outcome })
    .onConflictDoUpdate({
      target: [userTours.userId, userTours.tour],
      // Finishing is never undone by a later "Not now".
      set: {
        outcome: sql`case when ${userTours.outcome} = 'finished' then 'finished' else excluded.outcome end`,
        updatedAt: new Date(),
      },
    });
}
