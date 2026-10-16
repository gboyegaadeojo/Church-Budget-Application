import { Suspense } from "react";
import { UnreadMessages } from "@/components/request-messages";
import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  MessageCircleQuestion,
  Plane,
  FileText,
  CalendarX,
} from "lucide-react";
import {
  AdminSkeleton,
  EmptyState,
  PageHeader,
  PermissionDenied,
  Section,
  IconChip,
} from "@/components/ui/display";
import { buttonClass, cardClass, linkClass } from "@/components/ui/styles";
import { annualCopy } from "@/copy/annual";
import { getDb } from "@/db";
import { daysUntil, getOpenCycle, listMyRequests, type MyRequest } from "@/domain/annual/queries";
import { canTransition } from "@/domain/annual/status";
import { effectiveDeadline } from "@/domain/cycles/service";
import { getChurchTimeZone, getSignInSettings } from "@/domain/settings";
import { viewerAllowedTo } from "@/lib/admin-server";
import { getDepartmentDetail } from "@/domain/departments/queries";
import { readSettings } from "@/domain/settings";
import { leaderCandidates } from "@/domain/users/admin-queries";
import { LeadersPanel } from "./leaders-panel";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import { formatDate, formatDateTime, zonedDate } from "@/lib/time-zone";
import { accountCopy } from "@/copy/account";
import { departmentCover } from "@/domain/users/away";
import { AnnualStatusBadge } from "./status-badge";

const d = annualCopy.dashboard;

export const metadata: Metadata = { title: d.title };

/** Requester dashboard (DRD 6.2): the open cycle, what's next, and every request. */
export default function AnnualDashboardPage({ searchParams }: PageProps<"/annual">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <DashboardContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** The one action that fits a request's state (a department has one budget a year). */
function openAction(r: MyRequest): { href: string; label: string; primary: boolean } {
  const o = d.openBudget;
  if (r.status === "draft") return { href: `/annual/${r.id}/edit`, label: o.draft, primary: true };
  if (r.status === "returned") {
    return { href: `/annual/${r.id}/edit`, label: o.respond, primary: true };
  }
  if (canTransition(r.status, "revise") && r.editsRemaining > 0) {
    return { href: `/annual/${r.id}/edit`, label: o.edit, primary: false };
  }
  return { href: `/annual/${r.id}`, label: o.view, primary: false };
}

async function DashboardContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { saved } = await searchParams;
  const viewer = await viewerAllowedTo("annual.start", "/annual");
  if (!viewer) return <PermissionDenied body={annualCopy.deniedBody} />;
  const db = getDb();
  const [cycle, requests, zone, { adminContactEmail }] = await Promise.all([
    getOpenCycle(db),
    listMyRequests(db, viewer),
    getChurchTimeZone(db),
    getSignInSettings(db),
  ]);
  const firstName = viewer.name.split(" ")[0] ?? viewer.name;
  // This year's budgets, one per department; Submit only where a department has none.
  const thisYear = cycle ? requests.filter((r) => r.cycleId === cycle.id) : [];
  const withoutBudget = viewer.departments.filter(
    (dep) => !thisYear.some((r) => r.departmentId === dep.id),
  );
  const canStart = viewer.departments.length === 0 || withoutBudget.length > 0;
  // With one department, its extension (if any) is the deadline that matters (4.3).
  const deadline =
    cycle && viewer.departments.length === 1
      ? await effectiveDeadline(db, cycle.id, viewer.departments[0].id)
      : cycle?.submissionDeadline;
  const daysLeft = deadline ? daysUntil(deadline) : 0;
  const returned = requests.filter((r) => r.status === "returned");
  // FR-38: the Primary names the department's Backups here.
  const primaryOf = viewer.departments.filter((dep) => dep.representativeType === "primary");
  const leaderPanels = await Promise.all(
    primaryOf.map(async (dep) => {
      const detail = await getDepartmentDetail(db, dep.id);
      const leaders = detail?.leaders ?? [];
      const { pco_require_for_requesters } = await readSettings(db, ["pco_require_for_requesters"]);
      const candidates = (await leaderCandidates(db, pco_require_for_requesters === "true")).filter(
        (c) =>
          c.id !== viewer.id && !leaders.some((l) => l.userId === c.id && l.slot === "primary"),
      );
      const cover = await departmentCover(db, dep.id);
      return {
        department: { id: dep.id, name: dep.name },
        leaders,
        candidates,
        away: {
          active: cover.away,
          set: cover.window.from !== null,
          from: cover.window.from ? zonedDate(cover.window.from, zone) : "",
          until: cover.window.until ? zonedDate(cover.window.until, zone) : "",
          hasBackup: cover.backups.length > 0,
        },
      };
    }),
  );
  // FR-38, AC-119: every leader sees who is covering while their Primary is away.
  const covered = (
    await Promise.all(
      viewer.departments.map(async (dep) => ({
        name: dep.name,
        cover: await departmentCover(db, dep.id),
      })),
    )
  ).filter((c) => c.cover.away && c.cover.backups.length > 0);
  const others = requests.filter((r) => r.status !== "returned");

  return (
    <>
      <PageHeader title={d.title} intro={d.greeting(firstName)} />

      {saved === "draft" && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-control border border-success p-3 text-sm text-success"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {d.draftSaved}
        </div>
      )}

      {cycle && deadline ? (
        <section aria-labelledby="cycle-heading" className={cn(cardClass, "space-y-4")}>
          <div className="flex items-start gap-3">
            <IconChip icon={CalendarClock} tone="blue" />
            <div className="space-y-1">
              <h2
                id="cycle-heading"
                className="text-[17px] leading-tight font-semibold tracking-tight"
              >
                {d.cycleOpen(cycle.name)}
              </h2>
              <p className="text-sm text-fg-muted">
                {d.deadline(formatDateTime(deadline, zone))}
                {" · "}
                <span className="font-medium text-fg">{d.daysLeft(daysLeft)}</span>
              </p>
            </div>
          </div>
          {thisYear.length > 0 && (
            <ul className="divide-y divide-border overflow-hidden rounded-[14px] bg-surface-2/60">
              {thisYear.map((r) => {
                const action = openAction(r);
                return (
                  <li
                    key={r.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium">
                        {r.departmentName}
                        {r.title && <span className="font-normal text-fg-muted"> · {r.title}</span>}
                      </p>
                      <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                        <AnnualStatusBadge status={r.status} />
                        <UnreadMessages count={r.unreadMessages} />
                        {r.totalCents !== null && (
                          <span className="tabular font-medium text-fg">
                            {formatCAD(r.totalCents)}
                          </span>
                        )}
                        {r.status !== "draft" && <span>{d.editsLeft(r.editsRemaining)}</span>}
                      </p>
                    </div>
                    <Link
                      href={action.href}
                      className={buttonClass(
                        action.primary ? "primary" : "secondary",
                        "w-full shrink-0 sm:w-auto",
                      )}
                    >
                      {action.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {canStart && (
            <Link
              href="/annual/new"
              className={buttonClass(
                thisYear.length === 0 ? "primary" : "ghost",
                "w-full sm:w-auto",
              )}
            >
              {thisYear.length === 0 ? d.start : d.startAnother}
            </Link>
          )}
        </section>
      ) : (
        <section
          aria-labelledby="cycle-heading"
          className={cn(cardClass, "flex items-start gap-3")}
        >
          <IconChip icon={CalendarX} tone="slate" />
          <div className="space-y-1">
            <h2
              id="cycle-heading"
              className="text-[17px] leading-tight font-semibold tracking-tight"
            >
              {d.closedTitle}
            </h2>
            <p className="text-sm text-fg-muted">{d.closedBody(adminContactEmail)}</p>
          </div>
        </section>
      )}

      {returned.length > 0 && (
        <section
          aria-labelledby="needs-action-heading"
          className={cn(cardClass, "space-y-3 border-warning")}
        >
          <div className="flex items-center gap-3">
            <IconChip icon={MessageCircleQuestion} tone="amber" />
            <h2
              id="needs-action-heading"
              className="text-[17px] leading-tight font-semibold tracking-tight"
            >
              {d.needsAction}
            </h2>
          </div>
          <RequestTable requests={returned} caption={d.needsAction} />
        </section>
      )}

      {covered.map(({ name, cover }) => (
        <p
          key={name}
          role="note"
          className="flex items-start gap-2 rounded-control border border-border bg-surface-2 p-3 text-sm"
        >
          <Plane aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-muted" />
          <span>
            <span className="font-medium">{name}: </span>
            {accountCopy.department.covered(
              cover.backups.map((b) => b.name).join(" and "),
              cover.window.until ? formatDate(zonedDate(cover.window.until, zone)) : null,
            )}
          </span>
        </p>
      ))}

      {leaderPanels.map((panel) => (
        <LeadersPanel
          key={panel.department.id}
          department={panel.department}
          leaders={panel.leaders.map((l) => ({ userId: l.userId, name: l.name, slot: l.slot }))}
          candidates={panel.candidates.map((c) => ({ id: c.id, name: c.name }))}
          away={panel.away}
          today={zonedDate(new Date(), zone)}
        />
      ))}

      <Section title={d.myRequests} id="my-requests" icon={FileText} tone="violet">
        {others.length === 0 && returned.length === 0 ? (
          <EmptyState>{d.empty}</EmptyState>
        ) : others.length > 0 ? (
          <RequestTable requests={others} caption={d.myRequests} />
        ) : null}
      </Section>
    </>
  );
}

function RequestTable({ requests, caption }: { requests: MyRequest[]; caption: string }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1" tabIndex={0} role="region" aria-label={caption}>
      <table className="w-full min-w-[36rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-border text-xs text-fg-muted">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">
              {d.columns.request}
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              {d.columns.status}
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              {d.columns.total}
            </th>
            <th scope="col" className="py-2 font-medium">
              {d.columns.edits}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {requests.map((r) => (
            <tr key={r.id}>
              <td className="py-3 pr-4">
                <Link
                  href={r.status === "draft" ? `/annual/${r.id}/edit` : `/annual/${r.id}`}
                  className={linkClass}
                >
                  {r.title || d.untitled}
                </Link>
                <p className="text-xs text-fg-muted">
                  {[r.departmentName, r.cycleName, r.referenceNumber].filter(Boolean).join(" · ")}
                </p>
              </td>
              <td className="py-3 pr-4">
                <span className="flex flex-wrap gap-2">
                  <AnnualStatusBadge status={r.status} />
                  <UnreadMessages count={r.unreadMessages} />
                </span>
              </td>
              <td className="tabular py-3 pr-4 text-right">
                {r.totalCents === null ? d.notSubmitted : formatCAD(r.totalCents)}
              </td>
              <td className="py-3 text-fg-muted">
                {r.status === "draft" ? "—" : d.editsLeft(r.editsRemaining)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
