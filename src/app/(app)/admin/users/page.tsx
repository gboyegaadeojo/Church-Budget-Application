import { UserPlus, Users } from "lucide-react";
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
import { buttonClass, inputClass, linkClass } from "@/components/ui/styles";
import { adminCopy } from "@/copy/admin";
import { copy } from "@/copy/en-CA";
import { getDb } from "@/db";
import { listUsers, type UserListItem } from "@/domain/users/admin-queries";
import { viewerAllowedTo } from "@/lib/admin-server";
import { addStaffAction } from "./actions";
import { ROLE_OPTIONS } from "./role-options";
import { UserStatusBadge } from "./status-badge";

const u = adminCopy.users;

export const metadata: Metadata = { title: u.title };

/** Admin → Users & Roles (DRD 6.11, FR-02). */
export default function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <UsersContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function UsersContent({ searchParams }: Pick<PageProps<"/admin/users">, "searchParams">) {
  const viewer = await viewerAllowedTo("admin.users", "/admin/users");
  if (!viewer) return <PermissionDenied />;
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const people = await listUsers(getDb(), q);

  return (
    <>
      <PageHeader title={u.title} intro={u.intro} />

      <Section title={u.peopleHeading} id="people" icon={Users} tone="violet">
        <form method="get" role="search" className="flex flex-col gap-2 sm:flex-row sm:items-end">
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
            <Link href="/admin/users" className={buttonClass("ghost")}>
              {u.clearSearch}
            </Link>
          )}
        </form>
        {people.length === 0 ? <EmptyState>{u.empty}</EmptyState> : <UsersTable people={people} />}
      </Section>

      <Section title={u.addHeading} id="add-staff" icon={UserPlus} tone="green">
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
      </Section>
    </>
  );
}

function UsersTable({ people }: { people: UserListItem[] }) {
  return (
    <div
      className="relative -mx-1 overflow-x-auto px-1"
      tabIndex={0}
      role="region"
      aria-label={u.title}
    >
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">{u.title}</caption>
        <thead className="border-b border-border text-xs text-fg-muted">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">
              {u.columns.name}
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              {u.columns.roles}
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              {u.columns.departments}
            </th>
            <th scope="col" className="py-2 font-medium">
              {u.columns.status}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {people.map((p) => (
            <tr key={p.id} className="align-top">
              <td className="py-3 pr-4">
                <Link href={`/admin/users/${p.id}`} className={linkClass}>
                  {p.name}
                </Link>
                <span className="block text-xs text-fg-muted">{p.email}</span>
              </td>
              <td className="py-3 pr-4">
                <span className="flex flex-wrap gap-1">
                  {p.roles.length === 0 ? (
                    <span className="text-fg-muted">{adminCopy.common.none}</span>
                  ) : (
                    p.roles.map((r) => <Badge key={r}>{copy.roles[r]}</Badge>)
                  )}
                </span>
              </td>
              <td className="py-3 pr-4">
                {p.departments.length === 0 ? (
                  <span className="text-fg-muted">{adminCopy.common.none}</span>
                ) : (
                  p.departments.map((d) => (
                    <span key={d.id} className="block">
                      {d.name}
                      <span className="text-fg-muted">
                        {" "}
                        · {adminCopy.departments.typeLabels[d.type]}
                      </span>
                    </span>
                  ))
                )}
              </td>
              <td className="py-3">
                <UserStatusBadge active={p.active} accessStatus={p.accessStatus} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
