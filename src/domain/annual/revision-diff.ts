/**
 * What changed between two submitted versions of a request (DRD 6.7 "highlighted diff
 * between versions"). Items are paired by name, ignoring case; two items with the same
 * name pair up in order.
 */

export type SnapshotLine = { name: string; quantity: number; unitPriceCents: number };
export type Snapshot = { title: string; justification: string; lines: SnapshotLine[] };

export type RevisionChange =
  | { kind: "title" }
  | { kind: "justification" }
  | { kind: "added"; item: string }
  | { kind: "removed"; item: string }
  | {
      kind: "changed";
      item: string;
      from: { quantity: number; unitPriceCents: number };
      to: { quantity: number; unitPriceCents: number };
    };

const key = (name: string) => name.trim().toLowerCase();

export function revisionChanges(previous: Snapshot, next: Snapshot): RevisionChange[] {
  const changes: RevisionChange[] = [];
  if (previous.title !== next.title) changes.push({ kind: "title" });
  if (previous.justification !== next.justification) changes.push({ kind: "justification" });

  const unmatched = [...previous.lines];
  for (const line of next.lines) {
    const i = unmatched.findIndex((old) => key(old.name) === key(line.name));
    if (i === -1) {
      changes.push({ kind: "added", item: line.name });
      continue;
    }
    const [old] = unmatched.splice(i, 1);
    if (old.quantity !== line.quantity || old.unitPriceCents !== line.unitPriceCents) {
      changes.push({
        kind: "changed",
        item: line.name,
        from: { quantity: old.quantity, unitPriceCents: old.unitPriceCents },
        to: { quantity: line.quantity, unitPriceCents: line.unitPriceCents },
      });
    }
  }
  for (const old of unmatched) changes.push({ kind: "removed", item: old.name });
  return changes;
}
