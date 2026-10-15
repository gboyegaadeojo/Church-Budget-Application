import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, MessageCircleQuestion } from "lucide-react";
import {
  AdminSkeleton,
  EmptyState,
  PageHeader,
  PermissionDenied,
  Section,
} from "@/components/ui/display";
import { buttonClass, cardClass, linkClass } from "@/components/ui/styles";
import { annualCopy } from "@/copy/annual";
import { getDb } from "@/db";
import { daysUntil, getOpenCycle, listMyRequests, type MyRequest } from "@/domain/annual/queries";
import { effectiveDeadline } from "@/domain/cycles/service";
import { getChurchTimeZone, getSignInSettings } from "@/domain/settings";
import { viewerAllowedTo } from "@/lib/admin-server";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import { formatDateTime } from "@/lib/time-zone";
import { AnnualStatusBadge } from "./status-badge";

const d = annualCopy.dashboard;

export const metadata: Metadata = { title: d.title };

/** Requester dashboard (DRD 6.2): the open cycle, what's next, and every request. */
export default function AnnualDashboardPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

async function DashboardContent() {
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
  const draft = cycle && requests.find((r) => r.cycleId === cycle.id && r.status === "draft");
  // With one department, its extension (if any) is the deadline that matters (4.3).
  const deadline =
    cycle && viewer.departments.length === 1
      ? await effectiveDeadline(db, cycle.id, viewer.departments[0].id)
      : cycle?.submissionDeadline;
  const daysLeft = deadline ? daysUntil(deadline) : 0;
  const returned = requests.filter((r) => r.status === "returned");
  const others = requests.filter((r) => r.status !== "returned");

  return (
    <>
      <PageHeader title={d.title} intro={d.greeting(firstName)} />

      {cycle && deadline ? (
        <section aria-labelledby="cycle-heading" className={cn(cardClass, "space-y-4")}>
          <div className="flex items-start gap-3">
            <CalendarClock className="mt-0.5 size-6 shrink-0 text-accent" aria-hidden="true" />
            <div className="space-y-1">
              <h2 id="cycle-heading" className="text-lg font-semibold">
                {d.cycleOpen(cycle.name)}
              </h2>
              <p className="text-sm text-fg-muted">
                {d.deadline(formatDateTime(deadline, zone))}
                {" · "}
                <span className="font-medium text-fg">{d.daysLeft(daysLeft)}</span>
              </p>
            </div>
          </div>
          <Link
            href={draft ? `/annual/${draft.id}/edit` : "/annual/new"}
            className={buttonClass("primary", "w-full sm:w-auto")}
          >
            {draft ? d.continueDraft : d.start}
          </Link>
        </section>
      ) : (
        <section aria-labelledby="cycle-heading" className={cn(cardClass, "space-y-1")}>
          <h2 id="cycle-heading" className="text-lg font-semibold">
            {d.closedTitle}
          </h2>
          <p className="text-sm text-fg-muted">{d.closedBody(adminContactEmail)}</p>
        </section>
      )}

      {returned.length > 0 && (
        <section
          aria-labelledby="needs-action-heading"
          className={cn(cardClass, "space-y-3 border-warning")}
        >
          <h2 id="needs-action-heading" className="flex items-center gap-2 text-lg font-semibold">
            <MessageCircleQuestion className="size-5 text-warning" aria-hidden="true" />
            {d.needsAction}
          </h2>
          <RequestTable requests={returned} caption={d.needsAction} />
        </section>
      )}

      <Section title={d.myRequests} id="my-requests">
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
                <AnnualStatusBadge status={r.status} />
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
