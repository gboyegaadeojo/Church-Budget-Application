import { sql } from "drizzle-orm";
import { referenceSequences } from "./schema";
import type { Tx } from "./types";

export type ReferenceKind = "annual" | "expense";

const FORMAT: Record<ReferenceKind, (year: number, n: string) => string> = {
  annual: (year, n) => `IFC-${year}-MEDIA-${n}`,
  expense: (year, n) => `EXP-${year}-${n}`,
};

/**
 * The next reference number for the year, e.g. IFC-2027-MEDIA-0007 or EXP-2027-0042
 * (CLAUDE.md conventions). The counter row is locked by the upsert until the
 * transaction ends, so concurrent submissions never share a number, and a rolled-back
 * submission gives its number back.
 */
export async function nextReference(tx: Tx, kind: ReferenceKind, year: number): Promise<string> {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new RangeError(`Invalid reference year: ${year}`);
  }
  const [row] = await tx
    .insert(referenceSequences)
    .values({ kind, year, lastValue: 1 })
    .onConflictDoUpdate({
      target: [referenceSequences.kind, referenceSequences.year],
      set: { lastValue: sql`${referenceSequences.lastValue} + 1` },
    })
    .returning({ value: referenceSequences.lastValue });
  return FORMAT[kind](year, String(row.value).padStart(4, "0"));
}
