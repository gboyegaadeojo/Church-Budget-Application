import { annualCopy } from "@/copy/annual";
import type { BoardAllocation } from "@/domain/annual/review-queries";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";

const b = annualCopy.review.board;

/**
 * "Allocated $140,000.00 of $150,000.00 board total · $10,000.00 left to allocate"
 * (Requirements 4.2, DRD 6.7a). The words carry the meaning; the bar only shows it.
 */
export function BoardAllocationBar({ board }: { board: BoardAllocation }) {
  const left = board.totalCents - board.allocatedCents;
  const used = board.totalCents > 0 ? Math.min(1, board.allocatedCents / board.totalCents) : 1;
  return (
    <section
      aria-labelledby="board-heading"
      className="space-y-2 rounded-card border border-border bg-surface p-4 shadow-card"
    >
      <h2 id="board-heading" className="text-sm font-semibold text-fg-muted">
        {b.heading}
      </h2>
      <p className="tabular text-sm">
        {b.allocated(formatCAD(board.allocatedCents), formatCAD(board.totalCents))} ·{" "}
        <span className={cn(left < 0 && "font-semibold text-danger")}>
          {left >= 0 ? b.left(formatCAD(left)) : b.over(formatCAD(-left))}
        </span>
      </p>
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn("h-full rounded-full", left < 0 ? "bg-danger" : "bg-accent")}
          style={{ width: `${used * 100}%` }}
        />
      </div>
      {board.reference && <p className="text-xs text-fg-muted">{b.reference(board.reference)}</p>}
    </section>
  );
}

/** The warning before an approval would take the year past the board total (4.2). */
export function boardWarning(
  board: { totalCents: number; allocatedCents: number } | null | undefined,
  approvedTotalCents: number | null | undefined,
): string | null {
  if (!board || approvedTotalCents == null) return null;
  const after = board.allocatedCents + approvedTotalCents;
  if (after <= board.totalCents) return null;
  return b.warning(
    formatCAD(after),
    formatCAD(after - board.totalCents),
    formatCAD(board.totalCents),
  );
}
