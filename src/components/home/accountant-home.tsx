import Link from "next/link";
import { interactiveCardClass } from "@/components/ui/styles";
import { homeCopy } from "@/copy/home";
import type {
  AccountantInbox,
  AccountantToday,
  Season,
  YearSpending,
} from "@/domain/home/dashboards";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import { formatShortDate } from "@/lib/time-zone";

const a = homeCopy.accountantHome;

const percent = (tenths: number | null) => (tenths === null ? "—" : `${Math.round(tenths / 10)}%`);

/**
 * The accountant's four tiles (Idea 6, decided by the church 2026-11-07): what waits for a
 * decision, who hasn't started next year's budget, and how this year's spending is going.
 */
export function AccountantTiles({
  today,
  inbox,
  season,
  year,
  zone,
  now,
}: {
  today: AccountantToday;
  inbox: AccountantInbox;
  season: Season | null;
  year: YearSpending | null;
  zone: string;
  now: Date;
}) {
  const daysLeft = season
    ? Math.max(0, Math.ceil((season.deadline.getTime() - now.getTime()) / 86_400_000))
    : null;
  const deadline = season ? formatShortDate(season.deadline, zone) : null;
  const watch = year?.watch[0];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Tile
        href="/expenses/review"
        label={a.tiles.expenses}
        value={String(today.expenses.count)}
        note={a.tiles.expensesNote(
          formatCAD(today.expenses.cents),
          today.expenses.oldestDays === null ? "—" : a.inbox.waiting(today.expenses.oldestDays),
        )}
      />
      <Tile
        href="/annual/review"
        label={a.tiles.budgets}
        value={String(inbox.budgets.length)}
        note={a.tiles.budgetsNote}
      />
      {season && (
        <Tile
          href="/annual/review"
          label={a.tiles.notStarted}
          value={String(season.buckets.not_started)}
          note={a.tiles.notStartedNote(`${deadline} · ${daysLeft} days left`)}
        />
      )}
      {year && (
        <Tile
          href="/spending"
          label={a.tiles.spent(year.cycleName)}
          value={percent(year.usedTenths)}
          note={
            watch
              ? a.tiles.spentWatch(watch.department, percent(watch.usedTenths))
              : a.tiles.spentFine
          }
          warn={Boolean(watch)}
        />
      )}
    </div>
  );
}

function Tile({
  href,
  label,
  value,
  note,
  warn = false,
}: {
  href: string;
  label: string;
  value: string;
  note: string;
  warn?: boolean;
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
      <span className={cn("text-xs", warn ? "font-semibold text-warning" : "text-fg-muted")}>
        {note}
      </span>
    </Link>
  );
}

/** Each department's spending as a ring, most used first, in one row that scrolls sideways. */
export function SpendingRail({ year }: { year: YearSpending }) {
  if (year.departments.length === 0) return null;
  return (
    <section aria-labelledby="spending-rail-heading" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="spending-rail-heading"
          className="text-[17px] leading-tight font-semibold tracking-tight"
        >
          {a.spending.heading(year.cycleName)}
        </h2>
        <Link
          href="/spending"
          className="text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          {a.spending.link}
        </Link>
      </div>
      <ul
        className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2"
        tabIndex={0}
        aria-label={a.spending.heading(year.cycleName)}
      >
        {year.departments.map((d) => {
          const used = Math.min(100, Math.max(0, Math.round((d.usedTenths ?? 0) / 10)));
          return (
            <li
              key={d.departmentId}
              className="flex w-48 shrink-0 snap-start flex-col gap-2.5 rounded-card border border-border bg-surface p-4 shadow-card"
            >
              <div
                role="img"
                aria-label={a.spending.used(d.department, percent(d.usedTenths))}
                className="grid size-16 place-items-center rounded-full"
                style={{
                  background: `conic-gradient(var(${d.watch ? "--warning" : "--accent"}) 0% ${used}%, var(--surface-2) ${used}% 100%)`,
                }}
              >
                <span className="tabular grid size-12 place-items-center rounded-full bg-surface text-[13px] font-bold">
                  {percent(d.usedTenths)}
                </span>
              </div>
              <p className="text-[15px] leading-tight font-semibold">{d.department}</p>
              <p className="text-xs text-fg-muted">
                {a.spending.of(formatCAD(d.used), formatCAD(d.available))}
              </p>
              {d.watch && (
                <span className="self-start rounded-full bg-area-spending-soft px-2 py-0.5 text-[11px] font-bold text-area-spending">
                  {a.spending.watch}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
