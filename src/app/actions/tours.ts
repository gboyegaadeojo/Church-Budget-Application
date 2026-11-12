"use server";

import { recordTour } from "@/domain/tours/service";
import type { ActionState } from "@/lib/action-state";
import { runAction } from "@/lib/admin-server";

/** The pages that offer a tour, so the offer goes once it's answered. */
const PATHS = ["/", "/annual/new", "/expenses/new", "/help"];

/**
 * Remembers how the person left a guided tour. The service checks they may take it.
 * Waiting leaders can use the annual form (FR-03), so they can take its tour too.
 */
export async function recordTourAction(input: {
  tour: unknown;
  outcome: unknown;
}): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      await recordTour(tx, viewer, input);
      return "";
    },
    { paths: PATHS, allowWaiting: true },
  );
}
