import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { DownloadButton } from "@/components/download-button";
import { AdminSkeleton, EmptyState, PageHeader, PermissionDenied } from "@/components/ui/display";
import { buttonClass, cardClass, inputClass, linkClass } from "@/components/ui/styles";
import { activityCopy } from "@/copy/activity";
import { getDb } from "@/db";
import {
  getOverview,
  STAGE_FILTER,
  type Overview,
  type OverviewDepartment,
} from "@/domain/analytics/overview";
import { seesAdminAudit } from "@/domain/analytics/activity";
import { viewerAllowedTo } from "@/lib/admin-server";
import { authorize } from "@/lib/authz";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import { AnalyticsTabs } from "../tabs";

const a = activityCopy;
const o = a.overview;

export const metadata: Metadata = { title: `${a.tabs.overview} · ${a.title}` };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/**
 * Reports → Analytics & Audit → Overview (FR-52, DRD 6.13) for the annual budget:
 * headline figures, where each department is, requested against approved, and what has
 * waited longest. Every chart has its table. Read-only; figures come from the review
 * dashboard, so they match it and the exports to the cent.
 */
export default function OverviewPage({ searchParams }: PageProps<"/reports/analytics/overview">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <OverviewContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function OverviewContent({ searchParams }: { searchParams: Promise<Search> }) {
  const viewer = await viewerAllowedTo("analytics.view", "/reports/analytics/overview");
  if (!viewer) return <PermissionDenied body={a.denied} />;
  const tabs = <AnalyticsTabs current="overview" showAccess={seesAdminAudit(viewer)} />;
  if (!authorize(viewer, "annual.review").allowed) {
    return (
      <>
        <PageHeader title={a.title} intro={o.intro} />
        {tabs}
        <p className={cn(cardClass, "text-sm text-fg-muted")}>{o.notForYou}</p>
      </>
    );
  }
  const query = await searchParams;
  const data = await getOverview(getDb(), viewer, { cycleId: one(query.cycle) });
  if (!data) return <PermissionDenied body={a.denied} />;

  return (
    <>
      <PageHeader title={a.title} intro={o.intro} />
      {tabs}
      {data.cycle ? (
        <>
          <Filters data={data} />
          <Headlines data={data} />
          <div className="grid gap-6 xl:grid-cols-2">
            <StagesChart data={data} />
            <AmountsChart data={data} />
          </div>
          <Waiting data={data} />
        </>
      ) : (
        <EmptyState>{o.noCycle}</EmptyState>
      )}
    </>
  );
}

function Filters({ data }: { data: Overview }) {
  return (
    <form
      method="get"
      action="/reports/analytics/overview"
      className={cn(cardClass, "flex flex-wrap items-end gap-3 p-4")}
    >
      <div className="space-y-1.5">
        <label htmlFor="overview-cycle" className="block text-sm font-medium">
          {o.cycle}
        </label>
        <select
          id="overview-cycle"
          name="cycle"
          defaultValue={data.cycle!.id}
          className={inputClass}
        >
          {data.cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className={buttonClass("secondary")}>
        {o.show}
      </button>
      <DownloadButton
        href={`/api/exports/overview?cycle=${data.cycle!.id}`}
        label={o.export}
        className="sm:ml-auto"
      />
    </form>
  );
}

function Tile({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn(cardClass, "space-y-2")}>
      <p className="text-sm text-fg-muted">{label}</p>
      <p className="text-2xl font-semibold tabular">{value}</p>
      {children}
    </div>
  );
}

function Headlines({ data }: { data: Overview }) {
  const { counts, board, turnaround } = data;
  const percent =
    board && board.totalCents > 0 ? Math.round((board.allocatedCents / board.totalCents) * 100) : 0;
  const over = board ? board.allocatedCents - board.totalCents : 0;
  return (
    <section aria-label={o.intro} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Tile label={o.board} value={board ? formatCAD(board.totalCents) : "—"}>
        {board ? (
          <>
            <div
              role="meter"
              aria-label={o.boardMeter}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(percent, 100)}
              className="h-2 overflow-hidden rounded-full bg-surface-2"
            >
              <div
                className={cn("h-full rounded-full", over > 0 ? "bg-danger" : "bg-chart-1")}
                style={{ width: `${Math.min(percent, 100)}%` }}
              />
            </div>
            <p className="text-sm text-fg-muted">
              {o.boardAllocated(formatCAD(board.allocatedCents), percent)}
            </p>
            {over > 0 && (
              <p className="text-sm font-medium text-danger">{o.over(formatCAD(over))}</p>
            )}
          </>
        ) : (
          <p className="text-sm text-fg-muted">{o.boardNone}</p>
        )}
      </Tile>
      <Tile label={o.requested} value={formatCAD(counts.totalRequestedCents)}>
        <p className="text-sm text-fg-muted">{o.requestedFrom(counts.submitted)}</p>
      </Tile>
      <Tile label={o.approved} value={formatCAD(counts.totalApprovedCents)}>
        <p className="text-sm text-fg-muted">{o.approvedFrom(counts.approved)}</p>
      </Tile>
      <Tile
        label={o.turnaround}
        value={turnaround.averageDays === null ? "—" : o.days(turnaround.averageDays)}
      >
        <p className="text-sm text-fg-muted">
          {turnaround.decided ? o.turnaroundFrom(turnaround.decided) : o.noDecisions}
        </p>
      </Tile>
    </section>
  );
}

const th = "py-2 pr-4 text-left text-xs font-semibold tracking-wide text-fg-muted uppercase";
const td = "py-2 pr-4 align-top";

/** A chart card: the takeaway as its title, the chart, then the same figures as a table. */
function ChartCard({
  id,
  title,
  children,
  table,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  table: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className={cn(cardClass, "space-y-4")}>
      <h2 id={`${id}-heading`} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
      <details className="rounded-control border border-border">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium lg:min-h-9">
          {o.asTable}
        </summary>
        <div className="overflow-x-auto border-t border-border p-3">{table}</div>
      </details>
    </section>
  );
}

/** Departments by stage: one series of horizontal bars, each linked to its list. */
function StagesChart({ data }: { data: Overview }) {
  const max = Math.max(1, ...data.stages.map((s) => s.count));
  const cycle = data.cycle!.id;
  return (
    <ChartCard
      id="stages"
      title={o.stagesTitle(data.counts.approved, data.counts.expected)}
      table={
        <table className="w-full text-sm">
          <caption className="sr-only">{o.stagesCaption}</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className={th}>
                {o.columns.stage}
              </th>
              <th scope="col" className={`${th} text-right`}>
                {o.columns.departments}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.stages.map((s) => (
              <tr key={s.stage}>
                <th scope="row" className={`${td} text-left font-normal`}>
                  {o.stages[s.stage]}
                </th>
                <td className={`${td} text-right tabular`}>{s.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ul aria-label={o.stagesCaption} className="space-y-2">
        {data.stages.map((s) => {
          const filter = STAGE_FILTER[s.stage];
          const label = `${o.stages[s.stage]}: ${o.stageCount(s.count)}`;
          const row = (
            <span className="grid grid-cols-[9rem_1fr_2rem] items-center gap-3 text-sm sm:grid-cols-[12rem_1fr_2.5rem]">
              <span className="truncate">{o.stages[s.stage]}</span>
              <span className="h-5 rounded-r-[4px] bg-surface-2" aria-hidden="true">
                <span
                  className="block h-full rounded-r-[4px] bg-chart-1"
                  style={{ width: `${(s.count / max) * 100}%` }}
                />
              </span>
              <span className="text-right tabular">{s.count}</span>
            </span>
          );
          return (
            <li key={s.stage} title={label}>
              {filter && s.count > 0 ? (
                <Link
                  href={`/annual/review?cycle=${cycle}&status=${filter}`}
                  aria-label={label}
                  className="block rounded-control py-1 hover:bg-surface-hover"
                >
                  {row}
                </Link>
              ) : (
                <span className="block py-1" aria-label={label} role="img">
                  {row}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </ChartCard>
  );
}

/**
 * Requested against approved for each department that submitted: a dumbbell, one hue,
 * told apart by shape (a ring for requested, a filled dot for approved) and the legend.
 */
function AmountsChart({ data }: { data: Overview }) {
  const rows = data.departments.filter((d): d is OverviewDepartment & { requestId: string } =>
    Boolean(d.requestId),
  );
  const max = Math.max(1, ...rows.flatMap((d) => [d.requestedCents ?? 0, d.approvedCents ?? 0]));
  const at = (cents: number) => `${(cents / max) * 100}%`;
  return (
    <ChartCard
      id="amounts"
      title={o.amountsTitle(
        formatCAD(data.counts.totalApprovedCents),
        formatCAD(data.counts.totalRequestedCents),
      )}
      table={
        <table className="w-full text-sm">
          <caption className="sr-only">{o.amountsCaption}</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className={th}>
                {o.columns.department}
              </th>
              <th scope="col" className={th}>
                {o.columns.reference}
              </th>
              <th scope="col" className={`${th} text-right`}>
                {o.columns.requested}
              </th>
              <th scope="col" className={`${th} text-right`}>
                {o.columns.approved}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((d) => (
              <tr key={d.id}>
                <th scope="row" className={`${td} text-left font-normal`}>
                  {d.name}
                </th>
                <td className={td}>{d.reference}</td>
                <td className={`${td} text-right tabular`}>{formatCAD(d.requestedCents ?? 0)}</td>
                <td className={`${td} text-right tabular`}>
                  {d.approvedCents === null ? o.notDecided : formatCAD(d.approvedCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      {rows.length === 0 ? (
        <EmptyState>{o.noAmounts}</EmptyState>
      ) : (
        <>
          <p className="flex flex-wrap gap-4 text-sm text-fg-muted" aria-hidden="true">
            <span className="flex items-center gap-2">
              <span className="size-3 rounded-full border-2 border-chart-1 bg-surface" />
              {o.legendRequested}
            </span>
            <span className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-chart-1" />
              {o.legendApproved}
            </span>
          </p>
          <ul aria-label={o.amountsCaption} className="space-y-1">
            {rows.map((d) => {
              const requested = d.requestedCents ?? 0;
              const approved = d.approvedCents;
              const label = `${d.name}: ${o.legendRequested} ${formatCAD(requested)}, ${o.legendApproved} ${
                approved === null ? o.notDecided : formatCAD(approved)
              }`;
              const lo = Math.min(requested, approved ?? requested);
              const hi = Math.max(requested, approved ?? requested);
              return (
                <li key={d.id} title={label}>
                  <Link
                    href={`/annual/review/${d.requestId}`}
                    aria-label={label}
                    className="grid grid-cols-[9rem_1fr] items-center gap-3 rounded-control py-1.5 text-sm hover:bg-surface-hover sm:grid-cols-[12rem_1fr]"
                  >
                    <span className="truncate">{d.name}</span>
                    <span className="relative mx-2 block h-4" aria-hidden="true">
                      <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
                      {approved !== null && (
                        <span
                          className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-chart-1"
                          style={{ left: at(lo), width: `calc(${at(hi)} - ${at(lo)})` }}
                        />
                      )}
                      <span
                        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-chart-1 bg-surface ring-2 ring-surface"
                        style={{ left: at(requested) }}
                      />
                      {approved !== null && (
                        <span
                          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-1 ring-2 ring-surface"
                          style={{ left: at(approved) }}
                        />
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </ChartCard>
  );
}

function Waiting({ data }: { data: Overview }) {
  const rows = data.turnaround.waiting;
  return (
    <section aria-labelledby="waiting-heading" className={cn(cardClass, "space-y-4")}>
      <h2 id="waiting-heading" className="text-lg font-semibold">
        {o.waitingTitle}
      </h2>
      {rows.length === 0 ? (
        <EmptyState>{o.waitingNone}</EmptyState>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {rows.map((r) => (
            <li
              key={r.requestId}
              className="flex flex-wrap items-baseline justify-between gap-2 py-2"
            >
              <span>
                <Link href={`/annual/review/${r.requestId}`} className={linkClass}>
                  {r.reference}
                </Link>{" "}
                · {r.department}
              </span>
              <span className="tabular text-fg-muted">{o.days(r.days)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
