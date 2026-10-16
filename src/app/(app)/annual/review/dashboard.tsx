import Link from "next/link";
import { UnreadMessages } from "@/components/request-messages";
import {
  BadgeCheck,
  Building2,
  CalendarClock,
  ClipboardCheck,
  Eye,
  FileText,
  Gavel,
  Hourglass,
  Inbox,
  Plane,
  Send,
} from "lucide-react";
import { BoardAllocationBar } from "@/components/board-allocation";
import { DownloadButton } from "@/components/download-button";
import {
  Badge,
  EmptyState,
  IconChip,
  PageHeader,
  PermissionDenied,
  Section,
  StatCard,
} from "@/components/ui/display";
import { buttonClass, cardClass, inputClass, linkClass } from "@/components/ui/styles";
import { accountCopy } from "@/copy/account";
import { annualCopy } from "@/copy/annual";
import { exportsCopy } from "@/copy/exports";
import { getDb } from "@/db";
import {
  AWAITING,
  getReviewDashboard,
  QUEUE_FILTERS,
  type DashboardDepartment,
  type Progress,
  type QueueRow,
} from "@/domain/annual/review-queries";
import { accountantCover } from "@/domain/notifications/recipients";
import { getChurchTimeZone } from "@/domain/settings";
import { viewerAllowedTo } from "@/lib/admin-server";
import { authorize } from "@/lib/authz";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import { formatDate, formatDateTime, zonedDate } from "@/lib/time-zone";
import { AnnualStatusBadge } from "../status-badge";

const r = annualCopy.review;

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * The accountant dashboard (FR-13, FR-14, DRD 6.6): summary cards, department completion
 * and the review queue. Filters live in the address (DRD 6.0), so Back and shared links
 * return to the same view. The administrator sees the same page read-only.
 */
export async function ReviewDashboardView({
  searchParams,
  path,
  title,
  intro,
}: {
  searchParams: Promise<Search>;
  path: "/annual/review" | "/annual/all";
  title: string;
  intro: string;
}) {
  const viewer = await viewerAllowedTo("annual.review", path);
  if (!viewer) return <PermissionDenied />;
  const query = await searchParams;
  const filters = {
    cycleId: one(query.cycle) || undefined,
    status: one(query.status) || undefined,
    departmentId: one(query.department) || undefined,
    q: one(query.q) || undefined,
  };
  const db = getDb();
  const [dashboard, zone, cover] = await Promise.all([
    getReviewDashboard(db, viewer, filters),
    getChurchTimeZone(db),
    accountantCover(db),
  ]);
  if (!dashboard) return <PermissionDenied />;
  const { cycle, counts, departments, queue, readOnly } = dashboard;
  const filtered = Boolean(filters.status || filters.departmentId || filters.q);
  // FR-20: accountants, backup approvers and the administrator export (AC-4, AC-110).
  const canExport = authorize(viewer, "annual.export_all").allowed;
  const exportHref = (extra: Record<string, string | undefined>) =>
    `/api/exports/annual?${new URLSearchParams(
      Object.entries(extra).filter((e): e is [string, string] => Boolean(e[1])),
    )}`;

  return (
    <>
      <PageHeader title={title} intro={intro}>
        {readOnly && (
          <Badge>
            <Eye className="mr-1 size-3.5" aria-hidden="true" />
            {r.viewOnly}
          </Badge>
        )}
      </PageHeader>

      {!cycle ? (
        <EmptyState>{r.noCycles}</EmptyState>
      ) : (
        <>
          <form method="get" action={path} className={cn(cardClass, "space-y-4")}>
            <h2 className="sr-only">{r.filters}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Select
                name="cycle"
                label={r.cycle}
                value={cycle.id}
                options={dashboard.cycles.map((c) => ({
                  value: c.id,
                  label: `${c.name} (${r.cycleStatus[c.status] ?? c.status})`,
                }))}
              />
              <Select
                name="status"
                label={r.status}
                value={filters.status ?? "all"}
                options={QUEUE_FILTERS.map((f) => ({ value: f, label: r.queueFilters[f] }))}
              />
              <Select
                name="department"
                label={r.department}
                value={filters.departmentId ?? ""}
                options={[
                  { value: "", label: r.allDepartments },
                  ...departments.map((d) => ({ value: d.departmentId, label: d.departmentName })),
                ]}
              />
              <div className="space-y-1.5">
                <label htmlFor="review-q" className="block text-sm font-medium">
                  {r.search}
                </label>
                <input
                  id="review-q"
                  name="q"
                  type="search"
                  defaultValue={filters.q ?? ""}
                  aria-describedby="review-q-hint"
                  className={inputClass}
                />
                <p id="review-q-hint" className="text-xs text-fg-muted">
                  {r.searchHint}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className={buttonClass("secondary")}>
                {r.apply}
              </button>
              {filtered && (
                <Link href={`${path}?cycle=${cycle.id}`} className={linkClass}>
                  {r.clear}
                </Link>
              )}
              {canExport && counts.submitted > 0 && (
                <DownloadButton
                  href={exportHref({
                    cycle: cycle.id,
                    status: filters.status,
                    department: filters.departmentId,
                  })}
                  label={exportsCopy.download.view}
                  className="sm:ml-auto"
                />
              )}
            </div>
          </form>

          <section
            aria-label={r.cards.expected}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <StatCard
              label={r.cards.awaiting}
              value={counts.awaitingReview}
              icon={ClipboardCheck}
              tone="violet"
              emphasis={counts.awaitingReview > 0}
            />
            <StatCard label={r.cards.submitted} value={counts.submitted} icon={Send} tone="blue">
              {r.cards.expected} {counts.expected}
            </StatCard>
            <StatCard
              label={r.cards.outstanding}
              value={counts.outstanding}
              icon={Hourglass}
              tone="amber"
            />
            <StatCard
              label={r.cards.totalRequested}
              value={formatCAD(counts.totalRequestedCents)}
              icon={FileText}
              tone="teal"
            />
            <StatCard
              label={r.cards.totalApproved}
              value={formatCAD(counts.totalApprovedCents)}
              icon={BadgeCheck}
              tone="green"
            />
            <StatCard
              label={r.cards.decided}
              value={counts.approved + counts.declined}
              icon={Gavel}
              tone="pink"
            >
              {r.cards.approved} {counts.approved} · {r.cards.declined} {counts.declined} ·{" "}
              {r.cards.returned} {counts.returned}
            </StatCard>
          </section>

          {cover.primaryAway && cover.primary && (
            // FR-33: the dashboards say who is covering while the Primary accountant is away.
            <p
              role="note"
              className="flex items-start gap-2 rounded-control border border-warning bg-warning/10 p-3 text-sm"
            >
              <Plane aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
              {accountCopy.coverage.accountant(
                cover.primary.name,
                cover.primaryUntil ? formatDate(zonedDate(cover.primaryUntil, zone)) : null,
                cover.recipients.map((r) => r.name).join(", "),
              )}
            </p>
          )}

          {dashboard.board && <BoardAllocationBar board={dashboard.board} />}

          {dashboard.release && (
            // DRD 6.7b: the Decision emails card, with the full plan on Decision release.
            <section
              aria-labelledby="decision-emails-heading"
              className={cn(
                cardClass,
                "flex flex-wrap items-center gap-3 p-4 sm:p-4",
                dashboard.release.holding && "border-warning",
              )}
            >
              <IconChip
                icon={CalendarClock}
                tone={dashboard.release.holding ? "amber" : "blue"}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <h2 id="decision-emails-heading" className="text-sm font-semibold">
                  {annualCopy.release.cardHeading}
                </h2>
                <p className="text-sm text-fg-muted">
                  {dashboard.release.holding && dashboard.release.releaseAt
                    ? annualCopy.release.current.holding(
                        formatDateTime(dashboard.release.releaseAt, zone),
                      )
                    : annualCopy.release.current.immediate}
                </p>
              </div>
              <Link href={`/annual/release?cycle=${dashboard.cycle!.id}`} className={linkClass}>
                {annualCopy.release.manage}
              </Link>
            </section>
          )}

          <Section title={r.queueHeading} id="queue" icon={Inbox} tone="violet">
            {queue.length === 0 ? (
              <EmptyState>{counts.submitted === 0 ? r.queueNone : r.queueEmpty}</EmptyState>
            ) : (
              <QueueTable rows={queue} zone={zone} readOnly={readOnly} />
            )}
          </Section>

          <Section title={r.departmentsHeading} id="departments" icon={Building2} tone="blue">
            <DepartmentTable
              rows={departments}
              zone={zone}
              downloadHref={
                canExport ? (requestId) => exportHref({ request: requestId }) : undefined
              }
            />
          </Section>
        </>
      )}
    </>
  );
}

function Select({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
}) {
  const id = `review-${name}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <select id={id} name={name} defaultValue={value} className={inputClass}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// relative: keeps visually hidden header text inside the scrolling region.
const tableWrap = "relative -mx-1 overflow-x-auto px-1";
const th = "py-2.5 pr-4 text-xs font-semibold tracking-wide text-fg-muted uppercase";

function QueueTable({
  rows,
  zone,
  readOnly,
}: {
  rows: QueueRow[];
  zone: string;
  readOnly: boolean;
}) {
  return (
    <div className={tableWrap} tabIndex={0} role="region" aria-label={r.queueCaption}>
      <table className="w-full min-w-[44rem] text-left text-sm">
        <caption className="sr-only">{r.queueCaption}</caption>
        <thead className="border-b border-border">
          <tr>
            <th scope="col" className={th}>
              {r.columns.reference}
            </th>
            <th scope="col" className={th}>
              {r.columns.department}
            </th>
            <th scope="col" className={th}>
              {r.columns.requester}
            </th>
            <th scope="col" className={th}>
              {r.columns.submitted}
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              {r.columns.requested}
            </th>
            <th scope="col" className={th}>
              {r.columns.status}
            </th>
            <th scope="col" className={cn(th, "pr-0")}>
              <span className="sr-only">{r.open}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const awaiting = AWAITING.includes(row.status);
            return (
              <tr key={row.requestId} className="transition-colors hover:bg-surface-hover/60">
                <td className="py-3 pr-4 font-medium whitespace-nowrap">{row.referenceNumber}</td>
                <td className="py-3 pr-4">
                  {row.departmentName}
                  {row.title && <span className="block text-xs text-fg-muted">{row.title}</span>}
                  {row.unreadMessages > 0 && (
                    <span className="mt-1 block">
                      <UnreadMessages count={row.unreadMessages} />
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4">{row.requesterName}</td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  {formatDate(zonedDate(row.submittedAt, zone))}
                </td>
                <td className="tabular py-3 pr-4 text-right">
                  {formatCAD(row.requestedTotalCents)}
                </td>
                <td className="py-3 pr-4">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <AnnualStatusBadge status={row.status} />
                  </span>
                </td>
                <td className="py-3 text-right">
                  <Link
                    href={`/annual/review/${row.requestId}`}
                    className={buttonClass(awaiting && !readOnly ? "primary" : "secondary")}
                    aria-label={`${awaiting && !readOnly ? r.review : r.open} ${row.referenceNumber}`}
                  >
                    {awaiting && !readOnly ? r.review : r.open}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function progressLabel(progress: Progress) {
  if (progress === "not_submitted" || progress === "draft_exists") {
    return <Badge>{r.progress[progress]}</Badge>;
  }
  return <AnnualStatusBadge status={progress} />;
}

function nextStep(progress: Progress): string {
  if (progress === "not_submitted" || progress === "draft_exists") return r.nextStep[progress];
  if (AWAITING.includes(progress)) return r.nextStep.awaiting;
  if (progress === "returned") return r.nextStep.returned;
  return r.nextStep.decided;
}

function DepartmentTable({
  rows,
  zone,
  downloadHref,
}: {
  rows: DashboardDepartment[];
  zone: string;
  /** Set when the person may export: the one-request download per row (DRD 6.6, AC-92). */
  downloadHref?: (requestId: string) => string;
}) {
  return (
    <div className={tableWrap} tabIndex={0} role="region" aria-label={r.departmentsCaption}>
      <table className="w-full min-w-[48rem] text-left text-sm">
        <caption className="sr-only">{r.departmentsCaption}</caption>
        <thead className="border-b border-border">
          <tr>
            <th scope="col" className={th}>
              {r.columns.department}
            </th>
            <th scope="col" className={th}>
              {r.columns.representative}
            </th>
            <th scope="col" className={th}>
              {r.columns.status}
            </th>
            <th scope="col" className={th}>
              {r.columns.submitted}
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              {r.columns.requested}
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              {r.columns.approved}
            </th>
            <th scope="col" className={cn(th, downloadHref ? undefined : "pr-0")}>
              {r.columns.action}
            </th>
            {downloadHref && (
              <th scope="col" className={cn(th, "pr-0")}>
                {r.columns.download}
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.departmentId} className="transition-colors hover:bg-surface-hover/60">
              <td className="py-3 pr-4 font-medium">
                {row.requestId ? (
                  <Link href={`/annual/review/${row.requestId}`} className={linkClass}>
                    {row.departmentName}
                  </Link>
                ) : (
                  row.departmentName
                )}
              </td>
              <td className="py-3 pr-4">
                {row.representative ?? <span className="text-fg-muted">{r.noRepresentative}</span>}
              </td>
              <td className="py-3 pr-4">{progressLabel(row.progress)}</td>
              <td className="py-3 pr-4 whitespace-nowrap">
                {row.submittedAt ? formatDate(zonedDate(row.submittedAt, zone)) : "—"}
              </td>
              <td className="tabular py-3 pr-4 text-right">
                {row.requestedTotalCents === null ? "—" : formatCAD(row.requestedTotalCents)}
              </td>
              <td className="tabular py-3 pr-4 text-right">
                {row.approvedTotalCents === null ? "—" : formatCAD(row.approvedTotalCents)}
              </td>
              <td className={cn("py-3 text-fg-muted", downloadHref && "pr-4")}>
                {nextStep(row.progress)}
              </td>
              {downloadHref && (
                <td className="py-3">
                  {row.requestId ? (
                    <DownloadButton
                      href={downloadHref(row.requestId)}
                      label={r.columns.download}
                      ariaLabel={exportsCopy.download.rowLabel(row.departmentName)}
                    />
                  ) : (
                    "—"
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
