import { Suspense } from "react";
import { UnreadMessages } from "@/components/request-messages";
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CheckCircle2, MessageCircleQuestion, Plane, CalendarX } from "lucide-react";
import { AdminSkeleton, PageHeader, PermissionDenied, IconChip } from "@/components/ui/display";
import { buttonClass } from "@/components/ui/styles";
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
import { myDepartmentSpending, type MyDepartmentBudget } from "@/domain/spending/my-department";
import { adminCopy } from "@/copy/admin";
import { spendingCopy } from "@/copy/spending";
import { MyDepartmentPanel } from "../spending/my-department-panel";
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

/** A department with an approved budget, or spending recorded against none (FR-24). */
const hasBudget = (b: MyDepartmentBudget) => b.status !== "no_budget" || b.entries.length > 0;

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
  const [cycle, requests, zone, { adminContactEmail }, budgets] = await Promise.all([
    getOpenCycle(db),
    listMyRequests(db, viewer),
    getChurchTimeZone(db),
    getSignInSettings(db),
    myDepartmentSpending(db, viewer),
  ]);
  const budgetCycle = budgets?.cycle;
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
  // Departments with nothing approved or spent yet share one small card.
  const pending = (budgets?.departments ?? []).filter((b) => !hasBudget(b));

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
        <section
          aria-labelledby="cycle-heading"
          className="overflow-hidden rounded-card border border-border bg-surface shadow-card"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 p-5 sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <IconChip icon={CalendarClock} tone="blue" />
              <div className="min-w-0">
                <h2
                  id="cycle-heading"
                  className="text-[17px] leading-tight font-semibold tracking-tight"
                >
                  {d.cycleOpen(cycle.name)}
                </h2>
                <p className="mt-1 text-sm text-fg-muted">
                  {d.deadline(formatDateTime(deadline, zone))}
                </p>
              </div>
            </div>
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-full border bg-surface px-2.5 py-0.5 text-xs font-semibold",
                daysLeft <= 7 ? "border-warning text-warning" : "border-info text-info",
              )}
            >
              {d.daysLeft(daysLeft)}
            </span>
          </div>
          {thisYear.length > 0 && (
            <ul className="divide-y divide-border border-t border-border">
              {thisYear.map((r) => {
                const action = openAction(r);
                return (
                  <li
                    key={r.id}
                    className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                  >
                    <div className="min-w-0 space-y-1.5">
                      <p className="font-medium">
                        {r.departmentName}
                        {r.title && <span className="font-normal text-fg-muted"> · {r.title}</span>}
                      </p>
                      <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                        <AnnualStatusBadge status={r.status} />
                        <UnreadMessages count={r.unreadMessages} />
                        {r.totalCents !== null && (
                          <span className="tabular font-semibold text-fg">
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
            <div
              className={cn(
                "px-5 pb-5 sm:px-6",
                thisYear.length > 0 && "border-t border-border pt-4",
              )}
            >
              <Link
                href="/annual/new"
                className={buttonClass(
                  thisYear.length === 0 ? "primary" : "ghost",
                  "w-full sm:w-auto",
                )}
              >
                {thisYear.length === 0 ? d.start : d.startAnother}
              </Link>
            </div>
          )}
        </section>
      ) : (
        <section
          aria-labelledby="cycle-heading"
          className="flex items-start gap-3 rounded-card border border-border bg-surface p-5 shadow-card sm:px-6"
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
        <RequestList requests={returned} title={d.needsAction} id="needs-action" warning />
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

      {/* DRD 6.2a: each department's budget and what's been spent against it. */}
      {budgets &&
        budgetCycle &&
        budgets.departments
          .filter(hasBudget)
          .map((b) => (
            <MyDepartmentPanel
              key={b.departmentId}
              budget={b}
              cycleId={budgetCycle.id}
              cycleName={budgetCycle.name}
              limit={5}
            />
          ))}

      {budgetCycle && pending.length > 0 && (
        <section
          aria-labelledby="not-approved-heading"
          className="rounded-card border border-border bg-surface p-5 shadow-card sm:px-6"
        >
          <h2
            id="not-approved-heading"
            className="text-[17px] leading-tight font-semibold tracking-tight"
          >
            {spendingCopy.mine.notApprovedHeading(budgetCycle.name)}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">{spendingCopy.mine.notApprovedList}</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {pending.map((b) => (
              <li
                key={b.departmentId}
                className="rounded-full border border-border bg-surface-2 px-3 py-1 text-sm"
              >
                {b.department}
              </li>
            ))}
          </ul>
        </section>
      )}

      {others.length === 0 && returned.length === 0 ? (
        <section
          aria-labelledby="my-requests-heading"
          className="rounded-card border border-border bg-surface p-5 shadow-card sm:px-6"
        >
          <h2
            id="my-requests-heading"
            className="text-[17px] leading-tight font-semibold tracking-tight"
          >
            {d.myRequests}
          </h2>
          <p className="mt-2 text-sm text-fg-muted">{d.empty}</p>
        </section>
      ) : others.length > 0 ? (
        <RequestList requests={others} title={d.myRequests} id="my-requests" />
      ) : null}

      {leaderPanels.length > 0 && (
        <section
          aria-labelledby="leaders-heading"
          className="overflow-hidden rounded-card border border-border bg-surface shadow-card"
        >
          <div className="space-y-1 p-5 sm:px-6">
            <h2
              id="leaders-heading"
              className="text-[17px] leading-tight font-semibold tracking-tight"
            >
              {adminCopy.departments.nominate.groupHeading}
            </h2>
            <p className="text-sm text-fg-muted">{adminCopy.departments.nominate.intro}</p>
          </div>
          <div className="divide-y divide-border border-t border-border">
            {leaderPanels.map((panel) => (
              <LeadersPanel
                key={panel.department.id}
                defaultOpen={leaderPanels.length === 1}
                department={panel.department}
                leaders={panel.leaders.map((l) => ({
                  userId: l.userId,
                  name: l.name,
                  slot: l.slot,
                }))}
                candidates={panel.candidates.map((c) => ({ id: c.id, name: c.name }))}
                away={panel.away}
                today={zonedDate(new Date(), zone)}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** Budget requests as slim rows: title and where it belongs, status, total and edits left. */
function RequestList({
  requests,
  title,
  id,
  warning = false,
}: {
  requests: MyRequest[];
  title: string;
  id: string;
  warning?: boolean;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className={cn(
        "overflow-hidden rounded-card border bg-surface shadow-card",
        warning ? "border-warning" : "border-border",
      )}
    >
      <div className="flex items-center gap-3 p-5 pb-3 sm:px-6">
        {warning && <IconChip icon={MessageCircleQuestion} tone="amber" size="sm" />}
        <h2 id={`${id}-heading`} className="text-[17px] leading-tight font-semibold tracking-tight">
          {title}
        </h2>
      </div>
      <ul aria-label={title}>
        {requests.map((r) => (
          <li
            key={r.id}
            className="relative flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-5 py-3 transition-colors duration-150 hover:bg-surface-2 sm:px-6"
          >
            <div className="min-w-0 flex-1">
              <Link
                href={r.status === "draft" ? `/annual/${r.id}/edit` : `/annual/${r.id}`}
                className="block truncate font-medium text-accent after:absolute after:inset-0"
              >
                {r.title || d.untitled}
              </Link>
              <p className="truncate text-xs text-fg-muted">
                {[r.departmentName, r.cycleName, r.referenceNumber].filter(Boolean).join(" · ")}
              </p>
            </div>
            <span className="flex flex-wrap items-center gap-2">
              <AnnualStatusBadge status={r.status} />
              <UnreadMessages count={r.unreadMessages} />
            </span>
            <span className="w-full text-sm sm:w-auto sm:text-right">
              <span className="tabular block font-semibold">
                {r.totalCents === null ? d.notSubmitted : formatCAD(r.totalCents)}
              </span>
              <span className="block text-xs text-fg-muted">
                {r.status === "draft" ? null : d.editsLeft(r.editsRemaining)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
