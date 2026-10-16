import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { DownloadButton } from "@/components/download-button";
import { ActivityTable } from "@/components/activity-table";
import { AdminSkeleton, PageHeader, PermissionDenied } from "@/components/ui/display";
import { buttonClass, cardClass, inputClass, linkClass } from "@/components/ui/styles";
import { ACTIVITY_GROUPS, activityCopy as a } from "@/copy/activity";
import { copy } from "@/copy/en-CA";
import { getDb } from "@/db";
import { budgetCycles, departments } from "@/db/schema";
import {
  activityFiltersFrom,
  activityPeople,
  activityQuery,
  AUDIT_AREAS,
  listActivity,
  QUICK_VIEWS,
  type ActivityFilters,
} from "@/domain/analytics/activity";
import { getChurchTimeZone } from "@/domain/settings";
import { viewerAllowedTo } from "@/lib/admin-server";
import { cn } from "@/lib/cn";
import { ROLES } from "@/lib/roles";

export const metadata: Metadata = { title: a.title };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/**
 * Reports → Analytics & Audit (FR-52, DRD 6.13). Stage 1 has the Activity tab: the audit
 * log, filtered on the server by the person's roles. Filters live in the address.
 */
export default function AnalyticsPage({ searchParams }: PageProps<"/reports/analytics">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <Activity searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Activity({ searchParams }: { searchParams: Promise<Search> }) {
  const viewer = await viewerAllowedTo("analytics.view", "/reports/analytics");
  if (!viewer) return <PermissionDenied />;
  const query = await searchParams;
  const filters = activityFiltersFrom((k) => one(query[k]));
  const db = getDb();
  const mine = viewer.departments.map((d) => d.id);
  const seesAllDepartments = viewer.roles.some((r) => r !== "requester");
  const [page, zone, people, cycles, departmentRows] = await Promise.all([
    listActivity(db, viewer, filters),
    getChurchTimeZone(db),
    activityPeople(db, viewer),
    db
      .select({ id: budgetCycles.id, name: budgetCycles.name })
      .from(budgetCycles)
      .orderBy(desc(budgetCycles.budgetYear)),
    db
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .orderBy(asc(departments.name)),
  ]);
  const departmentOptions = seesAllDepartments
    ? departmentRows
    : departmentRows.filter((d) => mine.includes(d.id));
  const base = activityQuery(filters);
  const filtered = base !== "";
  const href = (extra: ActivityFilters) => {
    const q = activityQuery(extra);
    return `/reports/analytics${q ? `?${q}` : ""}`;
  };

  return (
    <>
      <PageHeader title={a.title} intro={a.intro} />

      <nav
        aria-label={a.title}
        className="flex flex-wrap items-center gap-2 border-b border-border"
      >
        <span
          aria-current="page"
          className="-mb-px border-b-2 border-accent px-3 py-2 text-sm font-semibold"
        >
          {a.tabs.activity}
        </span>
        <span className="px-3 py-2 text-sm text-fg-muted">{a.laterTabs}</span>
      </nav>

      <section aria-label={a.quick.label} className="flex flex-wrap gap-2">
        {QUICK_VIEWS.map((v) => {
          const active = filters.quick === v;
          return (
            <Link
              key={v}
              href={
                active ? href({ ...filters, quick: undefined }) : href({ ...filters, quick: v })
              }
              aria-current={active ? "true" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border px-4 text-sm lg:min-h-9",
                active
                  ? "border-accent bg-accent text-on-accent"
                  : "border-border-strong bg-surface hover:bg-surface-hover",
              )}
            >
              {a.quick[v]}
            </Link>
          );
        })}
      </section>

      <form method="get" action="/reports/analytics" className={cn(cardClass, "space-y-4")}>
        <h2 className="sr-only">{a.filters.heading}</h2>
        {filters.quick && <input type="hidden" name="quick" value={filters.quick} />}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="activity-q" className="block text-sm font-medium">
              {a.filters.q}
            </label>
            <input
              id="activity-q"
              name="q"
              type="search"
              defaultValue={filters.q ?? ""}
              aria-describedby="activity-q-hint"
              className={inputClass}
            />
            <p id="activity-q-hint" className="text-xs text-fg-muted">
              {a.filters.qHint}
            </p>
          </div>
          <Select
            name="person"
            label={a.filters.person}
            value={filters.personId}
            options={[
              { value: "", label: a.filters.anyone },
              ...people.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          <Select
            name="role"
            label={a.filters.role}
            value={filters.role}
            options={[
              { value: "", label: a.filters.anyRole },
              ...ROLES.map((r) => ({ value: r, label: copy.roles[r] })),
            ]}
          />
          <Select
            name="area"
            label={a.filters.area}
            value={filters.area}
            options={[
              { value: "", label: a.filters.anyArea },
              ...AUDIT_AREAS.map((r) => ({ value: r, label: a.areas[r] })),
            ]}
          />
          <Select
            name="group"
            label={a.filters.group}
            value={filters.group}
            options={[
              { value: "", label: a.filters.anyGroup },
              ...ACTIVITY_GROUPS.map((g) => ({ value: g, label: a.groups[g] })),
            ]}
          />
          <Select
            name="department"
            label={a.filters.department}
            value={filters.departmentId}
            options={[
              { value: "", label: a.filters.anyDepartment },
              ...departmentOptions.map((d) => ({ value: d.id, label: d.name })),
            ]}
          />
          <Select
            name="cycle"
            label={a.filters.cycle}
            value={filters.cycleId}
            options={[
              { value: "", label: a.filters.anyCycle },
              ...cycles.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <DateField name="from" label={a.filters.from} value={filters.from} />
          <DateField name="to" label={a.filters.to} value={filters.to} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={buttonClass("secondary")}>
            {a.filters.apply}
          </button>
          {filtered && (
            <Link href="/reports/analytics" className={linkClass}>
              {a.filters.reset}
            </Link>
          )}
          <span className="text-sm text-fg-muted" role="status">
            {a.count(page.total)}
          </span>
          {page.total > 0 && (
            <DownloadButton
              href={`/api/exports/activity${base ? `?${base}` : ""}`}
              label={a.export}
              className="sm:ml-auto"
            />
          )}
        </div>
      </form>

      {page.items.length === 0 ? (
        <div className={cn(cardClass, "space-y-3 text-center")}>
          <p>{a.empty}</p>
          {filtered && (
            <Link href="/reports/analytics" className={buttonClass("secondary")}>
              {a.filters.reset}
            </Link>
          )}
        </div>
      ) : (
        <ActivityTable items={page.items} viewer={viewer} zone={zone} />
      )}

      {page.pages > 1 && (
        <nav aria-label={a.pagination} className="flex flex-wrap items-center gap-3 text-sm">
          {page.page > 1 && (
            <Link
              href={`${href(filters)}${base ? "&" : "?"}page=${page.page - 1}`}
              className={buttonClass("secondary")}
            >
              {a.previous}
            </Link>
          )}
          <span aria-current="page">{a.page(page.page, page.pages)}</span>
          {page.page < page.pages && (
            <Link
              href={`${href(filters)}${base ? "&" : "?"}page=${page.page + 1}`}
              className={buttonClass("secondary")}
            >
              {a.next}
            </Link>
          )}
        </nav>
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
  value: string | undefined;
  options: { value: string; label: string }[];
}) {
  const id = `activity-${name}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <select id={id} name={name} defaultValue={value ?? ""} className={inputClass}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function DateField({ name, label, value }: { name: string; label: string; value?: string }) {
  const id = `activity-${name}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input id={id} name={name} type="date" defaultValue={value ?? ""} className={inputClass} />
    </div>
  );
}
