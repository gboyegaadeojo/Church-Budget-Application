import Link from "next/link";
import { interactiveCardClass } from "@/components/ui/styles";
import { homeCopy as hc } from "@/copy/home";
import type {
  AccountantToday,
  BoardApprovals,
  BudgetYear,
  PaymentsToday,
  Pipeline,
  Season,
  SeasonBucket,
  YearSpending,
} from "@/domain/home/dashboards";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/time-zone";

/*
 * The cards of Home's dashboards (decided by the church 2026-10-20). Plain server
 * components: every figure arrives computed from the read model of the screen it links to.
 */

const percent = (tenths: number | null) => (tenths === null ? "—" : `${Math.round(tenths / 10)}%`);
const width = (part: number, whole: number) =>
  whole <= 0 ? "0%" : `${Math.min(100, Math.max(0, (part / whole) * 100))}%`;

/** A titled white card with an optional link at the right of its title. */
export function HomeCard({
  id,
  title,
  subtitle,
  link,
  badge,
  flush = false,
  children,
}: {
  id: string;
  title: string;
  subtitle?: React.ReactNode;
  link?: { href: string; label: string };
  badge?: React.ReactNode;
  /** Rows run edge to edge (lists). */
  flush?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className={cn(
        "overflow-hidden rounded-card border border-border bg-surface shadow-card",
        !flush && "space-y-4 p-5 sm:p-6",
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-start justify-between gap-x-4 gap-y-1",
          flush && "p-5 pb-3 sm:px-6",
        )}
      >
        <div className="min-w-0">
          <h2
            id={`${id}-heading`}
            className="text-[17px] leading-tight font-semibold tracking-tight"
          >
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
        </div>
        {badge}
        {link && (
          <Link
            href={link.href}
            className="text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            {link.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "warning" | "info" | "success" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border bg-surface px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        tone === "warning" && "border-warning text-warning",
        tone === "info" && "border-info text-info",
        tone === "success" && "border-success text-success",
        tone === "neutral" && "border-border text-fg-muted",
      )}
    >
      {children}
    </span>
  );
}

function Tile({
  href,
  label,
  value,
  detail,
  pill,
  emphasis,
}: {
  href: string;
  label: string;
  value: React.ReactNode;
  detail: string;
  pill?: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-card border border-border bg-surface shadow-card",
        interactiveCardClass,
        "flex flex-col gap-2 p-4 sm:p-5",
        emphasis && "ring-1 ring-accent/40",
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-sm text-fg-muted">{label}</span>
        {pill}
      </span>
      <span className="tabular text-3xl font-semibold tracking-tight">{value}</span>
      <span className="text-sm text-fg-muted">{detail}</span>
    </Link>
  );
}

export function TodayTiles({ today, zone }: { today: AccountantToday; zone: string }) {
  const t = hc.today;
  return (
    <section aria-labelledby="today-heading" className="space-y-3">
      <h2 id="today-heading" className="text-[17px] font-semibold tracking-tight">
        {t.heading}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Tile
          href="/expenses/review"
          label={t.expenses}
          value={today.expenses.count}
          detail={t.expensesDetail(formatCAD(today.expenses.cents), today.expenses.overBudget)}
          emphasis={today.expenses.count > 0}
          pill={
            today.expenses.oldestDays !== null ? (
              <Pill tone={today.expenses.oldestDays >= 5 ? "warning" : "neutral"}>
                {t.oldest(today.expenses.oldestDays)}
              </Pill>
            ) : undefined
          }
        />
        <Tile
          href="/annual/review"
          label={t.annual}
          value={today.annual.awaiting}
          detail={t.annualDetail(today.annual.updated)}
          emphasis={today.annual.awaiting > 0}
        />
        <Tile
          href="/annual/review"
          label={t.messages}
          value={today.unreadMessages}
          detail={t.messagesDetail(today.unreadMessages)}
        />
        <Tile
          href="/annual/release"
          label={t.release}
          value={today.release.held}
          detail={
            today.release.held === 0
              ? t.releaseNone
              : t.releaseDetail(
                  today.release.releaseAt ? formatDateTime(today.release.releaseAt, zone) : null,
                )
          }
        />
      </div>
    </section>
  );
}

const BUCKETS: { key: SeasonBucket; className: string }[] = [
  { key: "approved", className: "bg-success" },
  { key: "review", className: "bg-area-annual" },
  { key: "submitted", className: "bg-area-annual/45" },
  { key: "returned", className: "bg-warning" },
  { key: "declined", className: "bg-danger" },
  { key: "drafting", className: "bg-border-strong" },
  { key: "not_started", className: "bg-surface-2 ring-1 ring-border ring-inset" },
];

export function SeasonCard({ season, zone, now }: { season: Season; zone: string; now: Date }) {
  const s = hc.season;
  const days = Math.ceil((season.deadline.getTime() - now.getTime()) / 86_400_000);
  const shown = BUCKETS.filter((b) => b.key !== "declined" || season.buckets.declined > 0);
  const parts = shown.map((b) => `${season.buckets[b.key]} ${s.buckets[b.key].toLowerCase()}`);
  return (
    <HomeCard
      id="season"
      title={s.heading(season.cycleName)}
      subtitle={s.deadline(formatDateTime(season.deadline, zone))}
      badge={<Pill tone={days <= 7 ? "warning" : "info"}>{s.daysLeft(days)}</Pill>}
    >
      <div
        role="img"
        aria-label={s.barLabel(parts.join(", "))}
        className="flex h-3 overflow-hidden rounded-full bg-surface-2"
      >
        {shown
          .filter((b) => b.key !== "not_started")
          .map((b) => (
            <span
              key={b.key}
              className={b.className}
              style={{ width: width(season.buckets[b.key], season.expected) }}
            />
          ))}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 xl:grid-cols-6">
        {shown.map((b) => (
          <div key={b.key}>
            <dt className="flex items-center gap-1.5 whitespace-nowrap text-fg-muted">
              <span aria-hidden="true" className={cn("size-2 rounded-[3px]", b.className)} />
              {s.buckets[b.key]}
            </dt>
            <dd className="tabular text-lg font-semibold">{season.buckets[b.key]}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-sm">
        <span className="text-fg-muted">
          {s.requested(
            formatCAD(season.requestedCents),
            season.boardTotalCents === null ? null : formatCAD(season.boardTotalCents),
          )}
        </span>
        <Link
          href="/annual/departments"
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          {s.seeAll}
        </Link>
      </div>
    </HomeCard>
  );
}

export function PipelineCard({ pipeline, cycleName }: { pipeline: Pipeline; cycleName: string }) {
  const p = hc.pipeline;
  const stages = [
    { key: "approving", label: p.approving },
    { key: "returned", label: p.returned },
    { key: "toPay", label: p.toPay },
    { key: "paid", label: p.paid },
  ] as const;
  return (
    <HomeCard
      id="pipeline"
      title={p.heading(cycleName)}
      link={{ href: "/expenses/all", label: p.all }}
    >
      <dl className="grid grid-cols-2 overflow-hidden rounded-[12px] border border-border sm:grid-cols-4">
        {stages.map((st, i) => (
          <div
            key={st.key}
            className={cn(
              "p-4",
              i % 2 === 1 && "border-l border-border",
              i >= 2 && "border-t border-border sm:border-t-0",
              i === 2 && "sm:border-l",
            )}
          >
            <dt className="text-xs text-fg-muted">{st.label}</dt>
            <dd className="mt-1">
              <span className="tabular block text-xl font-semibold">
                {pipeline.stages[st.key].count}
              </span>
              <span className="tabular text-xs text-fg-muted">
                {formatCAD(pipeline.stages[st.key].cents)}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-fg-muted">
        {p.turnaround(p.days(pipeline.accountantDays), p.days(pipeline.boardDays))}
      </p>
    </HomeCard>
  );
}

export function SpendingCard({
  year,
  variant,
}: {
  year: YearSpending;
  variant: "staff" | "board";
}) {
  const s = hc.spending;
  const used = year.usedTenths;
  const ahead = used !== null && used > year.elapsedTenths;
  const spentTenths = year.available > 0 ? Math.round((year.spent / year.available) * 1000) : 0;
  return (
    <HomeCard
      id="year-spending"
      title={variant === "board" ? s.boardHeading(year.cycleName) : s.heading(year.cycleName)}
      link={{ href: "/spending/budget-vs-actual", label: s.link }}
    >
      {used === null ? (
        <p className="text-sm text-fg-muted">{s.noBudget}</p>
      ) : (
        <>
          <p>
            <span className="tabular text-3xl font-semibold tracking-tight">{percent(used)}</span>{" "}
            <span className="text-sm text-fg-muted">
              {s.usedWord} · {s.elapsed(percent(year.elapsedTenths))}
            </span>
          </p>
          <div
            role="img"
            aria-label={s.barLabel(percent(used), percent(year.elapsedTenths))}
            className="relative flex h-2.5 overflow-hidden rounded-full bg-surface-2"
          >
            <span
              className="bg-area-spending"
              style={{ width: `${Math.min(100, spentTenths / 10)}%` }}
            />
            <span
              className="bg-area-spending/40"
              style={{
                width: `${Math.max(0, Math.min(100, used / 10) - Math.min(100, spentTenths / 10))}%`,
              }}
            />
          </div>
          <p className={cn("text-sm", ahead ? "text-warning" : "text-success")}>
            {ahead ? s.ahead : s.onTrack}
          </p>
        </>
      )}
      <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
        {variant === "board" && year.boardTotalCents !== null && (
          <>
            <dt className="text-fg-muted">{s.boardApproved}</dt>
            <dd className="tabular text-right font-semibold">{formatCAD(year.boardTotalCents)}</dd>
          </>
        )}
        <dt className="text-fg-muted">{s.available}</dt>
        <dd className="tabular text-right font-semibold">{formatCAD(year.available)}</dd>
        <dt className="text-fg-muted">{s.spent}</dt>
        <dd className="tabular text-right font-semibold">{formatCAD(year.spent)}</dd>
        <dt className="text-fg-muted">{s.committed}</dt>
        <dd className="tabular text-right font-semibold">{formatCAD(year.committed)}</dd>
        <dt className="text-fg-muted">{s.remaining}</dt>
        <dd
          className={cn(
            "tabular text-right font-semibold",
            year.remaining < 0 ? "text-danger" : "text-success",
          )}
        >
          {formatCAD(year.remaining)}
        </dd>
      </dl>
    </HomeCard>
  );
}

export function WatchCard({ year }: { year: YearSpending }) {
  const w = hc.watch;
  return (
    <HomeCard id="watch" title={w.heading}>
      {year.watch.length === 0 ? (
        <p className="text-sm text-fg-muted">{w.empty}</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {year.watch.map((d) => {
            const over = d.overBy > 0;
            return (
              <li key={d.departmentId}>
                <div className="flex justify-between gap-3">
                  <span className="truncate font-medium">{d.department}</span>
                  <span
                    className={cn("shrink-0 font-semibold", over ? "text-danger" : "text-warning")}
                  >
                    {over ? w.overBy(formatCAD(d.overBy)) : w.used(percent(d.usedTenths))}
                  </span>
                </div>
                <div
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"
                >
                  <div
                    className={over ? "h-full bg-danger" : "h-full bg-warning"}
                    style={{ width: `${Math.min(100, (d.usedTenths ?? 1000) / 10)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </HomeCard>
  );
}

export function ApprovalsCard({ approvals }: { approvals: BoardApprovals }) {
  const a = hc.approvals;
  const viceWaiting = approvals.chair && !approvals.chair.away && !approvals.canDecideAny;
  return (
    <HomeCard
      id="approvals"
      title={a.heading}
      subtitle={
        approvals.chair?.away
          ? a.covering(
              approvals.chair.name,
              approvals.chair.until
                ? formatDate(approvals.chair.until.toISOString().slice(0, 10))
                : null,
            )
          : viceWaiting && approvals.count > 0
            ? a.withChair(approvals.chair!.name)
            : a.together
      }
      flush
    >
      <dl className="grid grid-cols-3 gap-4 border-t border-border px-5 py-4 sm:px-6">
        <div>
          <dt className="text-xs text-fg-muted">{a.count}</dt>
          <dd className="tabular text-2xl font-semibold">{approvals.count}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">{a.total}</dt>
          <dd className="tabular text-2xl font-semibold">{formatCAD(approvals.cents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">{a.oldest}</dt>
          <dd
            className={cn(
              "text-2xl font-semibold",
              (approvals.oldestDays ?? 0) >= 5 && "text-warning",
            )}
          >
            {a.days(approvals.oldestDays)}
          </dd>
        </div>
      </dl>
      {approvals.rows.length === 0 ? (
        <p className="border-t border-border px-5 py-4 text-sm text-fg-muted sm:px-6">{a.empty}</p>
      ) : (
        <ul>
          {approvals.rows.map((r) => (
            <li
              key={r.id}
              className="relative flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-5 py-3 transition-colors duration-150 hover:bg-surface-2 sm:px-6"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/expenses/awaiting-approval/${r.id}`}
                  className="block truncate text-sm font-medium after:absolute after:inset-0"
                >
                  {`${r.referenceNumber ?? ""} · ${r.department} · ${r.title}`}
                </Link>
                <span className="block text-xs text-fg-muted">
                  {r.overBy > 0 ? a.overBy(formatCAD(r.overBy)) : a.withinBudget}
                </span>
              </div>
              <span className="tabular text-sm font-semibold">{formatCAD(r.amountCents ?? 0)}</span>
              <Pill tone={r.daysWaiting >= 5 ? "warning" : "neutral"}>{a.days(r.daysWaiting)}</Pill>
            </li>
          ))}
        </ul>
      )}
      {approvals.count > approvals.rows.length && (
        <Link
          href="/expenses/awaiting-approval"
          className="block border-t border-border px-5 py-3 text-sm font-medium text-accent sm:px-6"
        >
          {a.more(approvals.count)}
        </Link>
      )}
    </HomeCard>
  );
}

export function YearsCard({ years, zone, now }: { years: BudgetYear[]; zone: string; now: Date }) {
  const y = hc.years;
  return (
    <HomeCard id="years" title={y.heading} link={{ href: "/annual/cycles", label: y.link }} flush>
      {years.length === 0 ? (
        <p className="border-t border-border px-5 py-4 text-sm text-fg-muted sm:px-6">{y.empty}</p>
      ) : (
        <ul>
          {years.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm sm:px-6"
            >
              <span className="min-w-0">
                <span className="block font-semibold">{c.name}</span>
                <span className="block text-fg-muted">
                  {c.deadline.getTime() > now.getTime()
                    ? y.submitUntil(formatDateTime(c.deadline, zone))
                    : y.spendUntil(formatDate(c.spendingEnds))}
                </span>
              </span>
              <Pill tone={c.status === "open" ? "info" : "neutral"}>
                {y.status[c.status] ?? c.status}
              </Pill>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  );
}

export function PaymentsCard({ payments }: { payments: PaymentsToday }) {
  const p = hc.payments;
  return (
    <HomeCard id="payments" title={p.heading} subtitle={p.intro} flush>
      <dl className="grid grid-cols-3 gap-4 border-t border-border px-5 py-4 sm:px-6">
        <div>
          <dt className="text-xs text-fg-muted">{p.count}</dt>
          <dd className="tabular text-2xl font-semibold">{payments.count}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">{p.total}</dt>
          <dd className="tabular text-2xl font-semibold">{formatCAD(payments.cents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">{p.oldest}</dt>
          <dd className="text-2xl font-semibold">{hc.approvals.days(payments.oldestDays)}</dd>
        </div>
      </dl>
      {payments.rows.length === 0 ? (
        <p className="border-t border-border px-5 py-4 text-sm text-fg-muted sm:px-6">{p.empty}</p>
      ) : (
        <ul>
          {payments.rows.map((r) => (
            <li
              key={r.id}
              className="relative flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-5 py-3 transition-colors duration-150 hover:bg-surface-2 sm:px-6"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/expenses/ready/${r.id}`}
                  className="block truncate text-sm font-medium after:absolute after:inset-0"
                >
                  {`${r.referenceNumber} · ${r.department} · ${r.title}`}
                </Link>
                {r.payee && <span className="block text-xs text-fg-muted">{r.payee}</span>}
              </div>
              <span className="tabular text-sm font-semibold">{formatCAD(r.approvedCents)}</span>
              <Pill tone={r.daysWaiting >= 14 ? "warning" : "neutral"}>
                {hc.approvals.days(r.daysWaiting)}
              </Pill>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 text-sm sm:px-6">
        <span className="text-fg-muted">
          {p.paidRecently(payments.paidRecently.count, formatCAD(payments.paidRecently.cents))}
        </span>
        {payments.count > 0 && (
          <Link href="/expenses/ready" className="font-medium text-accent">
            {p.more(payments.count)}
          </Link>
        )}
      </div>
    </HomeCard>
  );
}
