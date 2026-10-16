import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AdminSkeleton,
  EmptyState,
  PageHeader,
  PermissionDenied,
  Section,
} from "@/components/ui/display";
import { linkClass } from "@/components/ui/styles";
import { activityCopy } from "@/copy/activity";
import { getDb } from "@/db";
import { accessOverview, type AccessEvent } from "@/domain/analytics/access";
import { getChurchTimeZone } from "@/domain/settings";
import { viewerAllowedTo } from "@/lib/admin-server";
import { formatDate, formatDateTime } from "@/lib/time-zone";
import { AnalyticsTabs } from "../tabs";

const a = activityCopy;
const t = a.access;

export const metadata: Metadata = { title: `${a.tabs.access} · ${a.title}` };

/**
 * Reports → Analytics & Audit → Access (FR-52, DRD 6.13): the System Administrator's view
 * of sign-ins and access problems, each item linked to where it's fixed. Read-only.
 */
export default function AccessPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <AccessContent />
      </Suspense>
    </div>
  );
}

const th = "py-2 pr-4 text-left text-xs font-semibold tracking-wide text-fg-muted uppercase";
const td = "py-2 pr-4 align-top";

function EventTable({
  caption,
  events,
  zone,
  showPage,
}: {
  caption: string;
  events: AccessEvent[];
  zone: string;
  showPage?: boolean;
}) {
  if (events.length === 0) return <EmptyState>{t.noEvents}</EmptyState>;
  return (
    // Focusable, so a table that scrolls sideways on a phone can be scrolled by keyboard.
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={caption}>
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={th}>
              {t.columns.when}
            </th>
            <th scope="col" className={th}>
              {t.columns.who}
            </th>
            <th scope="col" className={th}>
              {showPage ? t.columns.page : t.columns.what}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {events.map((e) => (
            <tr key={e.id}>
              <td className={`${td} whitespace-nowrap tabular`}>{formatDateTime(e.at, zone)}</td>
              <td className={td}>
                {e.person ? (
                  <Link href={`/admin/users/${e.person.id}`} className={linkClass}>
                    {e.person.name}
                  </Link>
                ) : (
                  <span className="break-all">{e.email ?? t.unknownPerson}</span>
                )}
              </td>
              <td className={`${td} break-words text-fg-muted`}>{showPage ? e.path : e.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function AccessContent() {
  const viewer = await viewerAllowedTo("analytics.admin_audit", "/reports/analytics/access");
  if (!viewer) return <PermissionDenied body={t.denied} />;
  const db = getDb();
  const [data, zone] = await Promise.all([accessOverview(db, viewer), getChurchTimeZone(db)]);

  return (
    <>
      <PageHeader title={a.title} intro={t.intro} />
      <AnalyticsTabs current="access" showAccess />

      <Section title={t.signIns} id="sign-ins">
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t.signInsCaption}>
          <table className="w-full text-sm">
            <caption className="sr-only">{t.signInsCaption}</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className={th}>
                  {t.columns.day}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {t.columns.planningCenter}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {t.columns.email}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {t.columns.failed}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.signInsByDay.map((d) => (
                <tr key={d.day}>
                  <th scope="row" className={`${td} text-left font-normal whitespace-nowrap`}>
                    {formatDate(d.day)}
                  </th>
                  <td className={`${td} text-right tabular`}>{d.planningCenter}</td>
                  <td className={`${td} text-right tabular`}>{d.email}</td>
                  <td className={`${td} text-right tabular ${d.failed ? "font-semibold" : ""}`}>
                    {d.failed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title={t.failed}
        description={t.failedCounts(data.failed.last24h, data.failed.last7d)}
        id="failed"
      >
        <EventTable caption={t.recentFailed} events={data.failed.recent} zone={zone} />
        <Link href="/reports/analytics?quick=access" className={`${linkClass} text-sm`}>
          {t.seeAll}
        </Link>
      </Section>

      <Section title={t.deniedHeading} description={t.deniedCount(data.denied.last7d)} id="denied">
        <EventTable caption={t.recentDenied} events={data.denied.recent} zone={zone} showPage />
      </Section>

      <Section title={t.suspended} description={t.suspendedHint} id="suspended">
        {data.suspended.length === 0 ? (
          <EmptyState>{t.none}</EmptyState>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {data.suspended.map((u) => (
              <li key={u.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <Link href={`/admin/users/${u.id}`} className={linkClass}>
                  {u.name}
                </Link>
                <span className="break-all text-fg-muted">{u.email}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t.noBackup} description={t.noBackupHint} id="no-backup">
        {data.noBackup.length === 0 ? (
          <EmptyState>{t.none}</EmptyState>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {data.noBackup.map((dept) => (
              <li
                key={dept.id}
                className="flex flex-wrap items-baseline justify-between gap-2 py-2"
              >
                <Link href={`/admin/departments/${dept.id}#leaders`} className={linkClass}>
                  {dept.name}
                </Link>
                <span className="text-fg-muted">{t.primary(dept.primary)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t.syncProblems} description={t.syncProblemsHint} id="sync-problems">
        {data.syncProblems.length === 0 ? (
          <EmptyState>{t.none}</EmptyState>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {data.syncProblems.map((p) => (
              <li key={p.departmentId} className="space-y-1 py-2">
                <Link
                  href={`/admin/departments/${p.departmentId}#pco-mapping`}
                  className={linkClass}
                >
                  {p.name}
                </Link>
                <p className="text-fg-muted">
                  {formatDateTime(p.at, zone)} · {p.reason}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
