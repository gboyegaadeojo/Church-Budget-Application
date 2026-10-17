import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Plane } from "lucide-react";
import {
  AdminSkeleton,
  Badge,
  EmptyState,
  PageHeader,
  PermissionDenied,
  Section,
} from "@/components/ui/display";
import { buttonClass, inputClass, linkClass } from "@/components/ui/styles";
import { annualCopy } from "@/copy/annual";
import { getDb } from "@/db";
import {
  departmentsOverview,
  type DepartmentOverviewRow,
} from "@/domain/annual/departments-overview";
import { getChurchTimeZone } from "@/domain/settings";
import { viewerAllowedTo } from "@/lib/admin-server";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import { formatDate, formatDateTime, zonedDate } from "@/lib/time-zone";
import { RemainingText } from "../../expenses/budget-strip";
import { progressLabel } from "../review/dashboard";

const p = annualCopy.departmentsPage;

export const metadata: Metadata = { title: p.title };

/**
 * Annual Budget → Departments (DRD 6.0, accountant): who leads each department, how to
 * reach them, and where its budget stands. Read-only; the administrator changes leaders.
 */
export default function DepartmentsPage({ searchParams }: PageProps<"/annual/departments">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <DepartmentsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function DepartmentsContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await viewerAllowedTo("annual.review", "/annual/departments");
  if (!viewer) return <PermissionDenied />;
  const query = await searchParams;
  const db = getDb();
  const cycleId = typeof query.cycle === "string" ? query.cycle : undefined;
  const [view, zone] = await Promise.all([
    departmentsOverview(db, viewer, cycleId),
    getChurchTimeZone(db),
  ]);
  if (!view) return <PermissionDenied />;
  const { cycle } = view;

  return (
    <>
      <PageHeader title={p.title} intro={p.intro} />
      {view.cycles.length > 1 && (
        <form method="get" action="/annual/departments" className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label htmlFor="departments-cycle" className="block text-sm font-medium">
              {p.cycle}
            </label>
            <select
              id="departments-cycle"
              name="cycle"
              defaultValue={cycle?.id ?? ""}
              className={cn(inputClass, "w-48")}
            >
              {view.cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={buttonClass("secondary")}>
            {p.show}
          </button>
        </form>
      )}
      {!cycle ? (
        <EmptyState>{p.noCycle}</EmptyState>
      ) : (
        <Section
          title={`${p.title} · ${cycle.name}`}
          id="departments"
          icon={Building2}
          tone="blue"
          description={`${p.usual}: ${formatDateTime(cycle.deadline, zone)}`}
        >
          {view.rows.length === 0 ? (
            <EmptyState>{p.empty}</EmptyState>
          ) : (
            <div
              className="-mx-1 overflow-x-auto px-1"
              tabIndex={0}
              role="region"
              aria-label={p.caption}
            >
              <table className="w-full min-w-[60rem] text-left text-sm">
                <caption className="sr-only">{p.caption}</caption>
                <thead className="border-b border-border text-[11px] tracking-wide text-fg-muted uppercase">
                  <tr>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {p.columns.department}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {p.columns.leaders}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {p.columns.status}
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">
                      {p.columns.requested}
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">
                      {p.columns.approved}
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">
                      {p.columns.remaining}
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      {p.columns.deadline}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {view.rows.map((row) => (
                    <DepartmentRow key={row.id} row={row} zone={zone} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}
    </>
  );
}

function DepartmentRow({ row, zone }: { row: DepartmentOverviewRow; zone: string }) {
  const money = (cents: number | null) => (cents === null ? "—" : formatCAD(cents));
  return (
    <tr className="align-top hover:bg-surface-hover">
      <th scope="row" className="py-3 pr-4 text-left font-medium">
        {row.requestId ? (
          <Link
            href={`/annual/review/${row.requestId}`}
            className={linkClass}
            aria-label={p.open(row.name)}
          >
            {row.name}
          </Link>
        ) : (
          row.name
        )}
        {row.reference && <span className="block text-xs text-fg-muted">{row.reference}</span>}
      </th>
      <td className="space-y-1 py-3 pr-4">
        {row.primary ? (
          <Person label={p.primary} name={row.primary.name} email={row.primary.email} />
        ) : (
          <Badge tone="warning">{p.noLeader}</Badge>
        )}
        {row.backups.map((b, i) => (
          <Person key={b.email} label={p.backup(i + 1)} name={b.name} email={b.email} />
        ))}
        {row.primary && row.backups.length === 0 && <Badge tone="warning">{p.noBackup}</Badge>}
        {row.representatives > 0 && (
          <p className="text-xs text-fg-muted">{p.others(row.representatives)}</p>
        )}
        {row.away && (
          <p className="flex items-start gap-1.5 text-xs text-fg-muted">
            <Plane className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {row.away.covering.length > 0
              ? p.away(
                  row.away.covering.join(" and "),
                  row.away.until ? formatDate(zonedDate(row.away.until, zone)) : null,
                )
              : p.awayNoCover}
          </p>
        )}
      </td>
      <td className="py-3 pr-4">{progressLabel(row.progress)}</td>
      <td className="tabular py-3 pr-4 text-right">{money(row.requestedCents)}</td>
      <td className="tabular py-3 pr-4 text-right">{money(row.approvedCents)}</td>
      <td className="tabular py-3 pr-4 text-right">
        {row.remainingCents === null ? "—" : <RemainingText cents={row.remainingCents} />}
      </td>
      <td className="py-3 text-xs">
        {row.extendedTo ? (
          <Badge tone="info">{p.extended(formatDateTime(row.extendedTo, zone))}</Badge>
        ) : (
          <span className="text-fg-muted">{p.usual}</span>
        )}
      </td>
    </tr>
  );
}

function Person({ label, name, email }: { label: string; name: string; email: string }) {
  return (
    <p className="text-sm">
      <span className="text-xs text-fg-muted">{label}: </span>
      <a href={`mailto:${email}`} className={linkClass} aria-label={`${p.email(name)} (${label})`}>
        {name}
      </a>
    </p>
  );
}
