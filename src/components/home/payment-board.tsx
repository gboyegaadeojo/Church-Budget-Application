import Link from "next/link";
import { StartProcessing } from "@/app/(app)/expenses/ready/start-processing";
import { buttonClass, compactButtonClass, interactiveCardClass } from "@/components/ui/styles";
import { expensesCopy } from "@/copy/expenses";
import { homeCopy } from "@/copy/home";
import type { BoardCard, PaymentBoard as Board } from "@/domain/home/dashboards";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import { formatDate } from "@/lib/time-zone";

const c = homeCopy.board;

/**
 * The Church Administrator's Home (decided by the church 2026-11-07): four tiles, then
 * every expense on a board from Waiting on approvers to Paid this week. Each expense shows
 * once, in the column it's in, with only the actions that column needs.
 */
export function PaymentBoard({ board }: { board: Board }) {
  const columns = [
    { id: "waiting", ...c.columns.waiting, cards: board.columns.waiting, tone: "slate" },
    { id: "ready", ...c.columns.ready, cards: board.columns.ready, tone: "violet" },
    { id: "processing", ...c.columns.processing, cards: board.columns.processing, tone: "blue" },
    { id: "paidWeek", ...c.columns.paidWeek, cards: board.columns.paidWeek, tone: "teal" },
  ] as const;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          href="/expenses/ready"
          label={c.tiles.toPay}
          value={formatCAD(board.toPay.cents)}
          note={c.tiles.toPayNote(board.toPay.count)}
        />
        <Tile
          href="/expenses/ready"
          label={c.tiles.owed}
          value={formatCAD(board.owed.cents)}
          note={c.tiles.owedNote(board.owed.cheques)}
        />
        <Tile
          href="#board-waiting"
          label={c.tiles.waiting}
          value={String(board.waitingCount)}
          note={c.tiles.waitingNote}
        />
        <Tile
          href="/expenses/ready#recent"
          label={c.tiles.paid}
          value={formatCAD(board.paid30.cents)}
          note={c.tiles.paidNote(board.paid30.count)}
        />
      </div>

      <section aria-labelledby="board-heading" className="space-y-3">
        <div>
          <h2 id="board-heading" className="text-[17px] leading-tight font-semibold tracking-tight">
            {c.heading}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">{c.intro}</p>
          <p className="mt-1 text-xs text-fg-muted lg:hidden">{c.scrollHint}</p>
        </div>
        <div className="-mx-1 overflow-x-auto px-1 pb-2" tabIndex={0} aria-label={c.heading}>
          <div className="grid min-w-[60rem] grid-cols-4 gap-3">
            {columns.map((col) => (
              <section
                key={col.id}
                id={`board-${col.id}`}
                aria-labelledby={`board-${col.id}-title`}
                className={cn(
                  "flex min-h-72 flex-col gap-2.5 rounded-card p-3",
                  col.tone === "slate" && "bg-area-admin-soft",
                  col.tone === "violet" && "bg-area-home-soft",
                  col.tone === "blue" && "bg-area-annual-soft",
                  col.tone === "teal" && "bg-area-expenses-soft",
                )}
              >
                <div className="flex items-center justify-between gap-2 px-1">
                  <h3
                    id={`board-${col.id}-title`}
                    className={cn(
                      "text-[13px] font-bold",
                      col.tone === "slate" && "text-area-admin",
                      col.tone === "violet" && "text-area-home",
                      col.tone === "blue" && "text-area-annual",
                      col.tone === "teal" && "text-area-expenses",
                    )}
                  >
                    {col.title}
                  </h3>
                  <span className="tabular rounded-full bg-surface px-2 text-xs font-bold">
                    {col.cards.length}
                  </span>
                </div>
                <p className="px-1 text-xs text-fg-muted">{col.hint}</p>
                {col.cards.length === 0 ? (
                  <p className="px-1 py-3 text-xs text-fg-muted">{c.empty}</p>
                ) : (
                  <ul className="space-y-2.5">
                    {col.cards.map((card) => (
                      <li key={card.id}>
                        <Card card={card} column={col.id} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Tile({
  href,
  label,
  value,
  note,
}: {
  href: string;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col gap-1 rounded-card border border-border bg-surface p-4 shadow-card",
        interactiveCardClass,
      )}
    >
      <span className="text-xs font-semibold text-fg-muted">{label}</span>
      <span className="tabular text-2xl font-bold tracking-tight">{value}</span>
      <span className="text-xs text-fg-muted">{note}</span>
    </Link>
  );
}

/** Who is paid or how it's bought, for a card in Ready or Processing. */
function readyDetail(card: BoardCard): string {
  const r = card.ready!;
  if (r.type === "expense_claim") {
    return r.payeeKind === "church_card" ? c.churchCard : c.chequeTo(r.payee ?? "");
  }
  return r.howBought
    ? expensesCopy.howBought[r.howBought as keyof typeof expensesCopy.howBought]
    : "";
}

function Card({
  card,
  column,
}: {
  card: BoardCard;
  column: "waiting" | "ready" | "processing" | "paidWeek";
}) {
  const detail =
    column === "waiting"
      ? c.stillNeeds((card.needs ?? []).map((l) => expensesCopy.verbal.levels[l]).join(" and "))
      : column === "paidWeek"
        ? c.paidOn(
            expensesCopy.payment.methods[
              card.method as keyof typeof expensesCopy.payment.methods
            ] ??
              card.method ??
              "",
            card.paidOn ? formatDate(card.paidOn) : "",
          )
        : readyDetail(card);
  const canPay = card.ready?.canPay ?? false;
  return (
    <article className="space-y-1.5 rounded-[12px] border border-border bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <Link href={`/expenses/${card.id}`} className="text-xs font-semibold text-accent">
          {card.referenceNumber}
        </Link>
        <span className="tabular text-sm font-bold">{formatCAD(card.amountCents)}</span>
      </div>
      <p className="text-[13px] font-semibold">{card.title}</p>
      <p className="text-xs text-fg-muted">
        {card.department} · {detail}
      </p>
      {column === "waiting" && card.canRecordVerbal && (
        <Link
          href={`/expenses/${card.id}`}
          className={buttonClass("secondary", cn(compactButtonClass, "mt-1"))}
        >
          {c.verbal}
        </Link>
      )}
      {(column === "ready" || column === "processing") && canPay && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {column === "ready" && card.ready && (
            <StartProcessing
              id={card.id}
              version={card.ready.version}
              reference={card.referenceNumber}
            />
          )}
          <Link
            href={`/expenses/ready/${card.id}`}
            className={buttonClass("primary", compactButtonClass)}
            aria-label={`${expensesCopy.payment.record}: ${card.referenceNumber}`}
          >
            {expensesCopy.payment.record}
          </Link>
        </div>
      )}
    </article>
  );
}
