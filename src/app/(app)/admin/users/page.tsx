import {
  ChevronLeft,
  ChevronRight,
  ChevronRight as RowChevron,
  UserPlus,
  Users,
} from "lucide-react";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, CheckboxGroup, SubmitButton, TextField } from "@/components/ui/action-form";
import {
  AdminSkeleton,
  Badge,
  EmptyState,
  PageHeader,
  PermissionDenied,
  Section,
} from "@/components/ui/display";
import { buttonClass, cardClass, inputClass } from "@/components/ui/styles";
import { adminCopy } from "@/copy/admin";
import { copy } from "@/copy/en-CA";
import { getDb } from "@/db";
import { listUsers, type UserListItem } from "@/domain/users/admin-queries";
import { users } from "@/db/schema";
import type { PcoPerson } from "@/lib/pco";
import { getPlanningCenterDirectory } from "@/lib/pco-directory";
import { inArray } from "drizzle-orm";
import { viewerAllowedTo } from "@/lib/admin-server";
import { cn } from "@/lib/cn";
import { addStaffAction, addStaffFromPcoAction } from "./actions";
import { ROLE_OPTIONS } from "./role-options";
import { UserStatusBadge } from "./status-badge";

const u = adminCopy.users;

export const metadata: Metadata = { title: u.title };

const PAGE_SIZE = 25;

/** The chips above the list. "Needs attention": deactivated, suspended or not yet placed. */
const FILTERS = {
  all: () => true,
  staff: (p: UserListItem) => p.roles.some((r) => r !== "requester"),
  leaders: (p: UserListItem) => p.departments.length > 0,
  attention: (p: UserListItem) => !p.active || p.accessStatus !== "active",
} as const;
type Filter = keyof typeof FILTERS;
const isFilter = (v: unknown): v is Filter => typeof v === "string" && v in FILTERS;

/** Admin → Users & Roles (DRD 6.11, FR-02): one slim row per person, filters and pages. */
export default function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <UsersContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function href(params: { q: string; filter: Filter; page: number }) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.filter !== "all") search.set("filter", params.filter);
  if (params.page > 1) search.set("page", String(params.page));
  const s = search.toString();
  return s ? `/admin/users?${s}` : "/admin/users";
}

async function UsersContent({ searchParams }: Pick<PageProps<"/admin/users">, "searchParams">) {
  const viewer = await viewerAllowedTo("admin.users", "/admin/users");
  if (!viewer) return <PermissionDenied />;
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const pco = typeof params.pco === "string" ? params.pco.trim() : "";
  const filter: Filter = isFilter(params.filter) ? params.filter : "all";
  const everyone = await listUsers(getDb(), q);
  const counts = Object.fromEntries(
    (Object.keys(FILTERS) as Filter[]).map((f) => [f, everyone.filter(FILTERS[f]).length]),
  ) as Record<Filter, number>;
  const shown = everyone.filter(FILTERS[filter]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const requested = Number.parseInt(typeof params.page === "string" ? params.page : "1", 10);
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(requested) ? requested : 1));
  const from = (page - 1) * PAGE_SIZE;
  const pageItems = shown.slice(from, from + PAGE_SIZE);

  return (
    <>
      <PageHeader title={u.title} intro={u.intro} />

      <details className="group" open={pco.length > 0}>
        <summary
          className={buttonClass(
            "primary",
            "w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden",
          )}
        >
          <UserPlus className="size-4" aria-hidden="true" />
          {u.addHeading}
        </summary>
        <div className={cn(cardClass, "mt-4 space-y-5")}>
          <PcoStaffSearch query={pco} />
          <details className="group/email border-t border-border pt-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-accent [&::-webkit-details-marker]:hidden">
              <ChevronRight
                className="size-4 transition-transform duration-150 group-open/email:rotate-90 motion-reduce:transition-none"
                aria-hidden="true"
              />
              {u.fromPco.byEmail}
            </summary>
            <ActionForm action={addStaffAction} resetOnSuccess aria-label={u.addHeading}>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  name="email"
                  type="email"
                  label={u.email}
                  hint={u.emailHint}
                  autoComplete="off"
                  required
                />
                <TextField name="displayName" label={u.displayName} autoComplete="off" required />
              </div>
              <CheckboxGroup name="roles" legend={u.roles} options={ROLE_OPTIONS} />
              <SubmitButton>{u.add}</SubmitButton>
            </ActionForm>
          </details>
        </div>
      </details>

      <Section
        title={u.peopleHeading}
        id="people"
        icon={Users}
        tone="violet"
        actions={
          shown.length > 0 ? (
            <span className="text-sm text-fg-muted">
              {u.showing(from + 1, from + pageItems.length, shown.length)}
            </span>
          ) : undefined
        }
      >
        <form method="get" role="search" className="flex flex-col gap-2 sm:flex-row sm:items-end">
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
          <div className="flex-1 space-y-1.5">
            <label htmlFor="user-search" className="block text-sm font-medium">
              {u.search}
            </label>
            <input
              id="user-search"
              type="search"
              name="q"
              defaultValue={q}
              className={inputClass}
            />
          </div>
          <button type="submit" className={buttonClass("secondary")}>
            {u.searchButton}
          </button>
          {q && (
            <Link href={href({ q: "", filter, page: 1 })} className={buttonClass("ghost")}>
              {u.clearSearch}
            </Link>
          )}
        </form>

        <nav aria-label={u.filtersLabel}>
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {(Object.keys(FILTERS) as Filter[]).map((f) => (
              <li key={f} className="shrink-0">
                <Link
                  href={href({ q, filter: f, page: 1 })}
                  aria-current={f === filter ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none",
                    f === filter
                      ? "border-accent bg-accent text-on-accent"
                      : "border-border bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  {u.filters[f]}
                  <span className="tabular">{counts[f]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {pageItems.length === 0 ? (
          <EmptyState>{q ? u.empty : u.emptyFilter}</EmptyState>
        ) : (
          <ul
            className="divide-y divide-border overflow-hidden rounded-[12px] border border-border"
            aria-label={u.title}
          >
            {pageItems.map((p) => (
              <PersonRow key={p.id} person={p} />
            ))}
          </ul>
        )}

        {pages > 1 && (
          <nav aria-label={u.pagesLabel} className="flex items-center justify-between gap-2">
            {page > 1 ? (
              <Link href={href({ q, filter, page: page - 1 })} className={buttonClass("secondary")}>
                <ChevronLeft className="size-4" aria-hidden="true" />
                {u.previous}
              </Link>
            ) : (
              <span />
            )}
            <span className="text-sm text-fg-muted tabular">{`${page} / ${pages}`}</span>
            {page < pages ? (
              <Link href={href({ q, filter, page: page + 1 })} className={buttonClass("secondary")}>
                {u.next}
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </Section>
    </>
  );
}

/** "Sam Lee" → "SL". */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/**
 * One person: their name is the link, stretched over the whole row so the row opens them
 * while the link keeps a short accessible name.
 */
function PersonRow({ person: p }: { person: UserListItem }) {
  const [firstRole, ...otherRoles] = p.roles;
  const [firstDept, ...otherDepts] = p.departments;
  return (
    <li className="relative flex flex-col gap-2 px-4 py-3 transition-colors duration-150 focus-within:bg-surface-2 hover:bg-surface-2 motion-reduce:transition-none sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-fg-muted"
        >
          {initials(p.name)}
        </span>
        <span className="min-w-0">
          <Link
            href={`/admin/users/${p.id}`}
            className="block truncate font-medium text-fg after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {p.name}
          </Link>
          <span className="block truncate text-xs text-fg-muted">{p.email}</span>
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 pl-12 text-xs sm:w-56 sm:pl-0">
        {firstRole ? (
          <>
            <Badge>{copy.roles[firstRole]}</Badge>
            {otherRoles.length > 0 && (
              <span
                className="text-fg-muted"
                title={otherRoles.map((r) => copy.roles[r]).join(", ")}
              >
                {u.moreRoles(otherRoles.length)}
              </span>
            )}
          </>
        ) : (
          <span className="text-fg-muted">{adminCopy.common.none}</span>
        )}
      </div>
      <div className="min-w-0 pl-12 text-sm sm:w-52 sm:pl-0">
        {firstDept ? (
          <span className="block truncate">
            {firstDept.name}
            <span className="text-fg-muted">
              {` · ${adminCopy.departments.typeLabels[firstDept.type]}`}
              {otherDepts.length > 0 ? ` ${u.moreDepartments(otherDepts.length)}` : ""}
            </span>
          </span>
        ) : (
          <span className="text-fg-muted">{adminCopy.common.none}</span>
        )}
      </div>
      <div className="flex items-center gap-2 pl-12 sm:pl-0">
        <UserStatusBadge active={p.active} accessStatus={p.accessStatus} />
        <RowChevron className="hidden size-4 text-fg-muted sm:block" aria-hidden="true" />
      </div>
    </li>
  );
}

/**
 * "Find them in Planning Center": the administrator picks the person, so the account is
 * linked to their profile from the start and Planning Center sign-in reaches it at once.
 */
async function PcoStaffSearch({ query }: { query: string }) {
  const f = u.fromPco;
  const directory = getPlanningCenterDirectory();
  if (!directory) return null;
  let people: PcoPerson[] | null = [];
  if (query.length >= 2) {
    try {
      people = (await directory.searchPeople(query)).slice(0, 10);
    } catch {
      people = null;
    }
  }
  const linked =
    people && people.length > 0
      ? new Map(
          (
            await getDb()
              .select({ id: users.id, pcoPersonId: users.pcoPersonId })
              .from(users)
              .where(
                inArray(
                  users.pcoPersonId,
                  people.map((p) => p.id),
                ),
              )
          ).map((r) => [r.pcoPersonId, r.id]),
        )
      : new Map<string | null, string>();
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-[15px] font-semibold">{f.heading}</h2>
        <p className="text-sm text-fg-muted">{f.hint}</p>
      </div>
      <form
        method="get"
        action="/admin/users"
        role="search"
        aria-label={f.heading}
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <div className="flex-1 space-y-1.5">
          <label htmlFor="pco-staff-search" className="block text-sm font-medium">
            {f.search}
          </label>
          <input
            id="pco-staff-search"
            type="search"
            name="pco"
            defaultValue={query}
            autoComplete="off"
            className={inputClass}
          />
        </div>
        <button type="submit" className={buttonClass("secondary")}>
          {f.find}
        </button>
      </form>
      {people === null ? (
        <p role="status" className="text-sm text-warning">
          {f.unavailable}
        </p>
      ) : query && people.length === 0 ? (
        <p className="text-sm text-fg-muted">{f.noResults}</p>
      ) : (
        people.length > 0 && (
          <ul
            aria-label={f.heading}
            className="divide-y divide-border overflow-hidden rounded-[12px] border border-border"
          >
            {people.map((p) => {
              const account = linked.get(p.id);
              return (
                <li key={p.id}>
                  {account ? (
                    <div className="flex items-center gap-3 px-4 py-3 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{p.name}</span>
                        <span className="block truncate text-xs text-fg-muted">{p.emails[0]}</span>
                      </span>
                      <Link
                        href={`/admin/users/${account}`}
                        className="text-sm font-medium text-accent underline-offset-4 hover:underline"
                      >
                        {f.hasAccount}
                      </Link>
                    </div>
                  ) : (
                    <details className="group/person">
                      <summary
                        aria-label={f.add(p.name)}
                        className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm transition-colors duration-150 hover:bg-surface-2 motion-reduce:transition-none [&::-webkit-details-marker]:hidden"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{p.name}</span>
                          <span className="block truncate text-xs text-fg-muted">
                            {p.emails[0] ?? ""}
                          </span>
                        </span>
                        <span className="flex items-center gap-1 font-medium text-accent">
                          <UserPlus className="size-4" aria-hidden="true" />
                          <ChevronRight
                            className="size-4 transition-transform duration-150 group-open/person:rotate-90 motion-reduce:transition-none"
                            aria-hidden="true"
                          />
                        </span>
                      </summary>
                      <div className="border-t border-border bg-surface-2/50 px-4 py-4">
                        <ActionForm action={addStaffFromPcoAction} aria-label={f.add(p.name)}>
                          <input type="hidden" name="pcoPersonId" value={p.id} />
                          <CheckboxGroup name="roles" legend={u.roles} options={ROLE_OPTIONS} />
                          <SubmitButton>{f.submit}</SubmitButton>
                        </ActionForm>
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}
