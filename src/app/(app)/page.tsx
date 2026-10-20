import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  BadgeCheck,
  Building2,
  CircleCheck,
  HandCoins,
  Inbox,
  LayoutGrid,
  PiggyBank,
} from "lucide-react";
import { StatCard } from "@/components/ui/display";
import { buttonClass } from "@/components/ui/styles";
import {
  ApprovalsCard,
  HomeCard,
  PaymentsCard,
  PipelineCard,
  SeasonCard,
  SpendingCard,
  TodayTiles,
  WatchCard,
  YearsCard,
} from "@/components/home/sections";
import { homeCopy as hc } from "@/copy/home";
import {
  accountantDashboard,
  availability,
  boardApprovals,
  budgetYears,
  paymentsToday,
  spendingSummary,
  type Availability,
} from "@/domain/home/dashboards";
import { hasRole } from "@/lib/roles";
import { AreaIcon } from "@/components/app-shell/area-icon";
import { copy } from "@/copy/en-CA";
import { daysWaiting, getMyTasks, type Task } from "@/domain/tasks";
import { formatCAD } from "@/lib/money";
import { activityCopy, activityLabel } from "@/copy/activity";
import { annualCopy } from "@/copy/annual";
import { getDb } from "@/db";
import { listActivity } from "@/domain/analytics/activity";
import { atAGlance, type GlanceCard } from "@/domain/home/glance";
import { getChurchTimeZone } from "@/domain/settings";
import { authorize } from "@/lib/authz";
import { cn } from "@/lib/cn";
import type { Viewer } from "@/lib/roles";
import { formatDateTime } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";

const h = copy.home;

export const metadata: Metadata = { title: h.title };

/** Home: a greeting, what needs the person, their roles' dashboards and recent activity (FR-37). */
export default function HomePage() {
  return (
    <div className="space-y-8">
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent />
      </Suspense>
    </div>
  );
}

/** "morning" before noon, "afternoon" before 6 p.m., else "evening", in the church's zone. */
function partOfDay(now: Date, zone: string): "morning" | "afternoon" | "evening" {
  const hour = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: zone, hour: "numeric", hourCycle: "h23" }).format(
      now,
    ),
  );
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

async function HomeContent() {
  const viewer = await getViewer();
  const db = getDb();
  const now = new Date();
  const seesSpending = authorize(viewer, "spending.view").allowed;
  const [tasks, zone, presence, accountant, approvals, payments, spending, years] =
    await Promise.all([
      getMyTasks(viewer),
      getChurchTimeZone(db),
      availability(db, viewer, now),
      accountantDashboard(db, viewer, now),
      boardApprovals(db, viewer, now),
      paymentsToday(db, viewer, now),
      seesSpending ? spendingSummary(db, viewer, now) : Promise.resolve(null),
      hasRole(viewer, "board_chair", "vice_chair") ? budgetYears(db) : Promise.resolve([]),
    ]);
  const firstName = viewer.name.split(" ")[0] ?? viewer.name;
  // Recent activity is for the System Administrator; others have the full log in Reports.
  const admin = hasRole(viewer, "system_admin");
  const oldest =
    tasks.length > 0 ? Math.max(...tasks.map((t) => daysWaiting(t.waitingSince, now))) : null;
  const board = approvals !== null;
  // Cards the dashboards above already cover leave At a glance.
  const covered = new Set<GlanceCard["kind"]>([
    ...(accountant ? (["review"] as const) : []),
    ...(board ? (["board"] as const) : []),
    ...(payments ? (["pay"] as const) : []),
  ]);
  const dashboards = accountant !== null || board || payments !== null;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-fg-muted">
            {new Intl.DateTimeFormat("en-CA", {
              timeZone: zone,
              weekday: "long",
              month: "long",
              day: "numeric",
            }).format(now)}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {hc.greeting(partOfDay(now, zone), firstName)}
          </h1>
          <p className="mt-1.5 text-fg-muted">{hc.summary(tasks.length, oldest)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {presence && <Presence presence={presence} zone={zone} />}
          {accountant && authorize(viewer, "spending.record").allowed && (
            <Link href="/spending/record" className={buttonClass("secondary")}>
              {hc.actions.recordSpending}
            </Link>
          )}
          {accountant && (
            <Link href="/expenses/review" className={buttonClass("primary")}>
              {hc.actions.reviewQueue}
            </Link>
          )}
          {!accountant && board && (
            <Link href="/expenses/awaiting-approval" className={buttonClass("primary")}>
              {hc.actions.approvals}
            </Link>
          )}
          {!accountant && !board && payments && (
            <Link href="/expenses/ready" className={buttonClass("primary")}>
              {hc.actions.pay}
            </Link>
          )}
        </div>
      </header>

      {accountant && <TodayTiles today={accountant.today} zone={zone} />}
      {approvals && <ApprovalsCard approvals={approvals} />}

      <div
        className={cn(
          "grid items-start gap-6",
          (dashboards || admin) && "lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]",
        )}
      >
        <div className="min-w-0 space-y-6">
          {accountant?.season && <SeasonCard season={accountant.season} zone={zone} now={now} />}
          {payments && <PaymentsCard payments={payments} />}
          {accountant && spending && (
            <PipelineCard pipeline={spending.pipeline} cycleName={spending.year.cycleName} />
          )}
          <MyTasks tasks={tasks} now={now} />
          {board && <RecentDecisions viewer={viewer} zone={zone} />}
        </div>
        <div className="min-w-0 space-y-6">
          {spending && (
            <SpendingCard year={spending.year} variant={board && !accountant ? "board" : "staff"} />
          )}
          {board && <YearsCard years={years} zone={zone} now={now} />}
          {spending && (accountant || board) && <WatchCard year={spending.year} />}
          <AtAGlance viewer={viewer} hide={covered} hideWhenEmpty={dashboards} />
          {admin && <RecentActivity viewer={viewer} />}
        </div>
      </div>
    </>
  );
}

/** Available or Away, with the role it's about (FR-33). */
function Presence({ presence, zone }: { presence: Availability; zone: string }) {
  const a = hc.availability;
  return (
    <Link
      href="/account#away"
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors duration-fast hover:bg-surface-2",
        presence.away ? "border-warning text-warning" : "border-success text-success",
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-2 rounded-full", presence.away ? "bg-warning" : "bg-success")}
      />
      {`${a[presence.role]} · ${
        presence.away
          ? presence.until
            ? a.awayUntil(formatDateTime(presence.until, zone))
            : a.away
          : a.available
      }`}
    </Link>
  );
}

function MyTasks({ tasks, now }: { tasks: Task[]; now: Date }) {
  return (
    <section
      aria-labelledby="my-tasks-heading"
      className="overflow-hidden rounded-card border border-border bg-surface shadow-card"
    >
      <div className="flex items-center gap-3 p-5 pb-3 sm:px-6">
        <h2 id="my-tasks-heading" className="text-[17px] font-semibold tracking-tight">
          {h.myTasks}
        </h2>
        {tasks.length > 0 && (
          <span
            className="tabular rounded-full bg-accent px-2.5 py-0.5 text-sm font-medium text-on-accent"
            aria-label={h.taskBadgeLabel(tasks.length)}
          >
            {tasks.length}
          </span>
        )}
      </div>
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 border-t border-border px-6 py-10 text-center">
          <CircleCheck className="size-8 text-success" aria-hidden="true" />
          <p className="text-lg font-medium">{h.allCaughtUp}</p>
          <p className="text-sm text-fg-muted">{h.allCaughtUpDetail}</p>
        </div>
      ) : (
        <ul>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** The board member's own latest expense decisions, from the activity log. */
async function RecentDecisions({ viewer, zone }: { viewer: Viewer; zone: string }) {
  const { items } = await listActivity(
    getDb(),
    viewer,
    { personId: viewer.id, area: "expenses", recent: true },
    { pageSize: 4 },
  );
  const d = hc.decisions;
  return (
    <HomeCard
      id="decisions"
      title={d.heading}
      link={{ href: "/reports/analytics", label: d.seeAll }}
      flush
    >
      {items.length === 0 ? (
        <p className="border-t border-border px-5 py-4 text-sm text-fg-muted sm:px-6">{d.empty}</p>
      ) : (
        <ul className="text-sm">
          {items.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-t border-border px-5 py-3 sm:px-6"
            >
              <span className="min-w-0">
                {e.expense ? (
                  <Link
                    href={`/expenses/awaiting-approval/${e.expense.id}`}
                    className="font-medium text-accent underline-offset-4 hover:underline"
                  >
                    {e.expense.reference ?? e.expense.title}
                  </Link>
                ) : null}
                {e.department ? ` · ${e.department.name}` : ""}
                <span className="block text-fg-muted">{activityLabel(e.eventType)}</span>
              </span>
              <span className="text-xs text-fg-muted">{formatDateTime(e.at, zone)}</span>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  );
}

/** One card per role the person holds (FR-37, DRD 6.0), each linking to its work. */
async function AtAGlance({
  viewer,
  hide,
  hideWhenEmpty,
}: {
  viewer: Viewer;
  hide: ReadonlySet<GlanceCard["kind"]>;
  hideWhenEmpty: boolean;
}) {
  const cards = await atAGlance(getDb(), viewer, new Date(), hide);
  if (cards.length === 0 && hideWhenEmpty) return null;
  if (cards.length === 0) {
    return (
      <EmptySection
        id="at-a-glance-heading"
        title={h.atAGlance}
        body={h.atAGlanceEmpty}
        icon={<LayoutGrid className="size-5 text-fg-muted" aria-hidden="true" />}
      />
    );
  }
  const g = h.glance;
  return (
    <section aria-labelledby="at-a-glance-heading" className="space-y-4">
      <h2 id="at-a-glance-heading" className="text-xl font-semibold">
        {h.atAGlance}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {cards.map((card) => {
          switch (card.kind) {
            case "department": {
              const over = card.figures.remaining < 0;
              return (
                <StatCard
                  key={`${card.kind}-${card.department}`}
                  label={g.department(card.department, card.cycle)}
                  value={g.available(formatCAD(card.figures.available))}
                  icon={PiggyBank}
                  tone={over ? "red" : "amber"}
                  href={card.href}
                >
                  <p className={cn("text-sm", over ? "text-danger" : "text-fg-muted")}>
                    {over
                      ? g.overBy(formatCAD(-card.figures.remaining))
                      : g.remaining(formatCAD(card.figures.remaining))}
                  </p>
                </StatCard>
              );
            }
            case "review":
              return (
                <StatCard
                  key={card.kind}
                  label={g.review}
                  value={card.annual + card.expenses}
                  icon={Inbox}
                  tone="teal"
                  emphasis={card.annual + card.expenses > 0}
                  href={card.href}
                >
                  <p className="text-sm text-fg-muted">
                    {g.reviewDetail(card.annual, card.expenses)}
                  </p>
                </StatCard>
              );
            case "board":
              return (
                <StatCard
                  key={card.kind}
                  label={g.board}
                  value={card.waiting}
                  icon={BadgeCheck}
                  tone="violet"
                  emphasis={card.waiting > 0}
                  href={card.href}
                >
                  <p className="text-sm text-fg-muted">{g.boardDetail(card.waiting)}</p>
                </StatCard>
              );
            case "pay":
              return (
                <StatCard
                  key={card.kind}
                  label={g.pay}
                  value={formatCAD(card.owedCents)}
                  icon={HandCoins}
                  tone="blue"
                  href={card.href}
                >
                  <p className="text-sm text-fg-muted">{g.payDetail(card.waiting)}</p>
                </StatCard>
              );
            case "proposed":
              return (
                <StatCard
                  key={card.kind}
                  label={g.proposed}
                  value={card.count}
                  icon={Building2}
                  tone="slate"
                  emphasis={card.count > 0}
                  href={card.href}
                >
                  <p className="text-sm text-fg-muted">{g.proposedDetail(card.count)}</p>
                </StatCard>
              );
          }
        })}
      </div>
    </section>
  );
}

function TaskRow({ task, now }: { task: Task; now: Date }) {
  return (
    <li className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:px-6">
      <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-soft text-accent">
        <AreaIcon area={task.area} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{task.action}</p>
        <p className="text-sm text-fg-muted">
          {task.item}
          {task.amountCents !== undefined && (
            <>
              {" · "}
              <span className="tabular">{formatCAD(task.amountCents)}</span>
            </>
          )}
          {" · "}
          {h.waiting(daysWaiting(task.waitingSince, now))}
          {task.note && <span className="ml-2 font-medium text-warning">· {task.note}</span>}
        </p>
      </div>
      <Link
        href={task.href}
        className="inline-flex min-h-11 items-center justify-center rounded-control bg-accent px-4 text-sm font-medium text-on-accent transition-colors duration-fast hover:bg-accent-hover lg:min-h-10"
      >
        {task.buttonLabel}
      </Link>
    </li>
  );
}

function EmptySection({
  id,
  title,
  body,
  icon,
}: {
  id: string;
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      <div className="flex items-start gap-3 rounded-card border border-border bg-surface p-5 text-sm text-fg-muted shadow-card">
        {icon}
        <p>{body}</p>
      </div>
    </section>
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy="true" className="space-y-4">
      <span className="sr-only" role="status">
        {copy.app.loading}
      </span>
      <div className="h-5 w-48 animate-pulse rounded-control bg-surface-2" />
      <div className="h-40 animate-pulse rounded-card bg-surface-2" />
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="h-28 animate-pulse rounded-card bg-surface-2" />
        <div className="h-28 animate-pulse rounded-card bg-surface-2" />
      </div>
    </div>
  );
}

/** Recent activity on what the person is involved in (FR-37), from the activity log. */
async function RecentActivity({ viewer }: { viewer: Viewer }) {
  const db = getDb();
  const [{ items }, zone] = await Promise.all([
    listActivity(db, viewer, { recent: true }, { pageSize: 6 }),
    getChurchTimeZone(db),
  ]);
  const reviews = authorize(viewer, "annual.review").allowed;
  return (
    <section
      aria-labelledby="recent-activity-heading"
      className="space-y-3 rounded-card border border-border bg-surface p-5 shadow-card"
    >
      <div className="flex items-center gap-2">
        <Activity className="size-5 text-fg-muted" aria-hidden="true" />
        <h2 id="recent-activity-heading" className="text-lg font-semibold">
          {h.recentActivity}
        </h2>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-fg-muted">{activityCopy.recentEmpty}</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {items.map((e) => (
            <li key={e.id} className="py-2">
              <p>
                <span className="font-medium">{e.actor?.name ?? activityCopy.system}</span>{" "}
                <span className="text-fg-muted">·</span> {activityLabel(e.eventType)}
                {e.request && (
                  <>
                    {" "}
                    <Link
                      href={reviews ? `/annual/review/${e.request.id}` : `/annual/${e.request.id}`}
                      className="font-medium text-accent underline-offset-4 hover:underline"
                    >
                      {e.request.reference || e.request.title || annualCopy.dashboard.untitled}
                    </Link>
                  </>
                )}
              </p>
              <p className="text-xs text-fg-muted">
                {formatDateTime(e.at, zone)}
                {e.department ? ` · ${e.department.name}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Link
        href="/reports/analytics"
        className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline-offset-4 hover:underline lg:min-h-9"
      >
        {activityCopy.recentAll}
      </Link>
    </section>
  );
}
