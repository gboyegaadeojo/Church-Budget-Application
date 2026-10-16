import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import {
  CalendarClock,
  ChevronDown,
  CircleDollarSign,
  Gavel,
  MailWarning,
  Search,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from "lucide-react";
import { AREA_STYLE } from "@/components/app-shell/area-icon";
import { DownloadButton } from "@/components/download-button";
import { ActivityTable } from "@/components/activity-table";
import { AdminSkeleton, PageHeader, PermissionDenied } from "@/components/ui/display";
import { buttonClass, cardClass, inputClass, linkClass } from "@/components/ui/styles";
import { activityCopy as a, type ActivityGroup } from "@/copy/activity";
import { copy } from "@/copy/en-CA";
import { getDb } from "@/db";
import { budgetCycles, departments } from "@/db/schema";
import {
  activityFiltersFrom,
  activityOptions,
  activityPeople,
  activityQuery,
  listActivity,
  type ActivityFilters,
  type AuditAreaName,
  type QuickView,
} from "@/domain/analytics/activity";
import type { AreaId } from "@/domain/navigation";
import { getChurchTimeZone } from "@/domain/settings";
import { viewerAllowedTo } from "@/lib/admin-server";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/roles";
import { formatDate } from "@/lib/time-zone";

export const metadata: Metadata = { title: a.title };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/**
 * Reports → Analytics & Audit (FR-52, DRD 6.13), for staff only (docs/decisions.md,
 * 2026-10-16). Stage 1 has the Activity tab: the audit log, filtered on the server by the
 * person's roles. Filters live in the address; each applied one shows as a removable chip.
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

/** Each quick view's icon and area colour (its name is always shown too). */
const QUICK_STYLE: Record<QuickView, { area: AreaId; icon: LucideIcon }> = {
  today: { area: "home", icon: CalendarClock },
  decisionsWeek: { area: "annual", icon: Gavel },
  money: { area: "spending", icon: CircleDollarSign },
  access: { area: "admin", icon: ShieldAlert },
  settings: { area: "admin", icon: Settings2 },
  emails: { area: "reports", icon: MailWarning },
};

/** Filters behind "More filters"; the panel opens by itself when one of them is set. */
const MORE: (keyof ActivityFilters)[] = [
  "personId",
  "role",
  "area",
  "group",
  "departmentId",
  "cycleId",
  "from",
  "to",
];

async function Activity({ searchParams }: { searchParams: Promise<Search> }) {
  const viewer = await viewerAllowedTo("analytics.view", "/reports/analytics");
  if (!viewer) return <PermissionDenied body={a.denied} />;
  const query = await searchParams;
  const filters = activityFiltersFrom((k) => one(query[k]));
  const db = getDb();
  const [page, zone, people, cycles, departmentOptions] = await Promise.all([
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
  // Only what this person's roles cover: the administration log is the administrator's.
  const offered = activityOptions(viewer);
  const base = activityQuery(filters);
  const filtered = base !== "";
  const href = (extra: ActivityFilters) => {
    const q = activityQuery(extra);
    return `/reports/analytics${q ? `?${q}` : ""}`;
  };
  const nameOf = (list: { id: string; name: string }[], id: string) =>
    list.find((x) => x.id === id)?.name ?? id;

  // What's applied, each removable on its own (DRD 6.13: active filters as chips).
  const chips: { key: keyof ActivityFilters; label: string }[] = [];
  const add = (key: keyof ActivityFilters, label: string | undefined) => {
    if (label) chips.push({ key, label });
  };
  if (filters.quick) add("quick", a.quick[filters.quick as QuickView]);
  if (filters.q) add("q", a.chips.search(filters.q));
  if (filters.personId) add("personId", nameOf(people, filters.personId));
  if (filters.role) add("role", copy.roles[filters.role as Role] ?? filters.role);
  if (filters.area) add("area", a.areas[filters.area as AuditAreaName] ?? filters.area);
  if (filters.group) add("group", a.groups[filters.group as ActivityGroup] ?? filters.group);
  if (filters.departmentId) add("departmentId", nameOf(departmentOptions, filters.departmentId));
  if (filters.cycleId) add("cycleId", nameOf(cycles, filters.cycleId));
  if (filters.from) add("from", a.chips.from(formatDate(filters.from)));
  if (filters.to) add("to", a.chips.to(formatDate(filters.to)));
  const moreOpen = MORE.some((k) => filters[k]);

  return (
    <>
      <PageHeader title={a.title} intro={a.intro} />

      <nav aria-label={a.title} className="flex gap-1 border-b border-border">
        <span
          aria-current="page"
          className="-mb-px border-b-2 border-area-reports px-3 py-2 text-sm font-semibold text-area-reports"
        >
          {a.tabs.activity}
        </span>
      </nav>

      {/* One row that scrolls sideways on a phone; wraps on wider screens. */}
      <section
        aria-label={a.quick.label}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
      >
        {offered.quickViews.map((v) => {
          const active = filters.quick === v;
          const { area, icon: Icon } = QUICK_STYLE[v];
          const style = AREA_STYLE[area];
          return (
            <Link
              key={v}
              href={
                active ? href({ ...filters, quick: undefined }) : href({ ...filters, quick: v })
              }
              aria-current={active ? "true" : undefined}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border-2 px-3.5 text-sm font-medium whitespace-nowrap transition-colors lg:min-h-9",
                style.soft,
                style.text,
                active ? style.ring : "border-transparent hover:border-border-strong",
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
              {a.quick[v]}
            </Link>
          );
        })}
      </section>

      <form
        method="get"
        action="/reports/analytics"
        className={cn(cardClass, "space-y-4 p-4 sm:p-5")}
      >
        <h2 className="sr-only">{a.filters.heading}</h2>
        {filters.quick && <input type="hidden" name="quick" value={filters.quick} />}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-64 space-y-1.5">
            <label htmlFor="activity-q" className="block text-sm font-medium">
              {a.filters.q}
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
              />
              <input
                id="activity-q"
                name="q"
                type="search"
                defaultValue={filters.q ?? ""}
                placeholder={a.filters.qHint}
                className={cn(inputClass, "pl-9")}
              />
            </div>
          </div>
          <button type="submit" className={buttonClass("primary")}>
            {a.filters.apply}
          </button>
          {page.total > 0 && (
            <DownloadButton
              href={`/api/exports/activity${base ? `?${base}` : ""}`}
              label={a.export}
              className="sm:ml-auto"
            />
          )}
        </div>

        <details open={moreOpen} className="group rounded-control border border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal aria-hidden="true" className="size-4 text-fg-muted" />
            {a.filters.more}
            <ChevronDown
              aria-hidden="true"
              className="ml-auto size-4 text-fg-muted transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="grid gap-4 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
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
                ...offered.roles.map((r) => ({ value: r, label: copy.roles[r] })),
              ]}
            />
            <Select
              name="area"
              label={a.filters.area}
              value={filters.area}
              options={[
                { value: "", label: a.filters.anyArea },
                ...offered.areas.map((r) => ({ value: r, label: a.areas[r] })),
              ]}
            />
            <Select
              name="group"
              label={a.filters.group}
              value={filters.group}
              options={[
                { value: "", label: a.filters.anyGroup },
                ...offered.groups.map((g) => ({ value: g, label: a.groups[g] })),
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
        </details>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium" role="status">
            {a.count(page.total)}
          </span>
          {chips.length > 0 && (
            <>
              <ul aria-label={a.chips.label} className="flex flex-wrap gap-2">
                {chips.map((c) => (
                  <li key={c.key}>
                    <Link
                      href={href({ ...filters, [c.key]: undefined })}
                      aria-label={a.chips.remove(c.label)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border-strong bg-surface-2 px-3 text-xs font-medium hover:bg-surface-hover lg:min-h-7"
                    >
                      {c.label}
                      <X aria-hidden="true" className="size-3.5" />
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/reports/analytics" className={cn(linkClass, "text-xs")}>
                {a.filters.reset}
              </Link>
            </>
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
