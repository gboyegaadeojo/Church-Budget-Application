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
import { AreaIcon } from "@/components/app-shell/area-icon";
import { copy } from "@/copy/en-CA";
import { daysWaiting, getMyTasks, type Task } from "@/domain/tasks";
import { formatCAD } from "@/lib/money";
import { activityCopy, activityLabel } from "@/copy/activity";
import { annualCopy } from "@/copy/annual";
import { getDb } from "@/db";
import { listActivity } from "@/domain/analytics/activity";
import { atAGlance } from "@/domain/home/glance";
import { getChurchTimeZone } from "@/domain/settings";
import { authorize } from "@/lib/authz";
import { cn } from "@/lib/cn";
import type { Viewer } from "@/lib/roles";
import { formatDateTime } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";

const h = copy.home;

export const metadata: Metadata = { title: h.title };

/** Home: My tasks, At a glance, Recent activity (DRD 6.0, FR-37). */
export default function HomePage() {
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight">{h.title}</h1>
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent />
      </Suspense>
    </div>
  );
}

async function HomeContent() {
  const viewer = await getViewer();
  const tasks = await getMyTasks(viewer);
  const firstName = viewer.name.split(" ")[0] ?? viewer.name;
  const now = new Date();
  const staff = authorize(viewer, "analytics.view").allowed;

  return (
    <>
      <p className="-mt-6 text-fg-muted">{h.greeting(firstName)}</p>

      <section aria-labelledby="my-tasks-heading" className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 id="my-tasks-heading" className="text-xl font-semibold">
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
          <div className="flex flex-col items-center gap-2 rounded-card border border-border bg-surface px-6 py-10 text-center shadow-card">
            <CircleCheck className="size-8 text-success" aria-hidden="true" />
            <p className="text-lg font-medium">{h.allCaughtUp}</p>
            <p className="text-sm text-fg-muted">{h.allCaughtUpDetail}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border bg-surface shadow-card">
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} now={now} />
            ))}
          </ul>
        )}
      </section>

      {/* Recent activity is part of Analytics & Audit, which is for staff only. */}
      <div className={cn("grid gap-8", staff && "lg:grid-cols-2")}>
        <AtAGlance viewer={viewer} />
        {staff && <RecentActivity viewer={viewer} />}
      </div>
    </>
  );
}

/** One card per role the person holds (FR-37, DRD 6.0), each linking to its work. */
async function AtAGlance({ viewer }: { viewer: Viewer }) {
  const cards = await atAGlance(getDb(), viewer);
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
      <div className="grid gap-4 sm:grid-cols-2">
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
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
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
