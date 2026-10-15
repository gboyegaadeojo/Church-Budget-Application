import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  AdminSkeleton,
  Badge,
  EmptyState,
  PageHeader,
  PermissionDenied,
  Section,
} from "@/components/ui/display";
import { linkClass } from "@/components/ui/styles";
import { adminCopy } from "@/copy/admin";
import { getDb } from "@/db";
import { getChurchTimeZone } from "@/domain/settings";
import { getUserDetail } from "@/domain/users/admin-queries";
import { viewerAllowedTo } from "@/lib/admin-server";
import { formatDateTime } from "@/lib/time-zone";
import { setActiveAction } from "../actions";
import { UserStatusBadge } from "../status-badge";
import { RolesForm } from "./roles-form";

const u = adminCopy.users;

export const metadata: Metadata = { title: u.title };

export default function UserPage({ params }: PageProps<"/admin/users/[id]">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <UserContent params={params} />
      </Suspense>
    </div>
  );
}

async function UserContent({ params }: Pick<PageProps<"/admin/users/[id]">, "params">) {
  const viewer = await viewerAllowedTo("admin.users", "/admin/users");
  if (!viewer) return <PermissionDenied />;
  const { id } = await params;
  const db = getDb();
  const detail = await getUserDetail(db, id);
  if (!detail) notFound();
  const { user, roles, departments } = detail;
  const zone = await getChurchTimeZone(db);
  const activeFormId = `active-${user.id}`;

  return (
    <>
      <PageHeader title={user.displayName} back={{ href: "/admin/users", label: u.title }}>
        <UserStatusBadge active={user.active} accessStatus={user.accessStatus} />
      </PageHeader>

      <Section title={u.accountHeading} id="account">
        <dl className="grid gap-3 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="text-fg-muted">{u.email}</dt>
          <dd className="break-all">{user.email}</dd>
          <dt className="text-fg-muted">{u.verification}</dt>
          <dd>
            {user.pcoVerifiedAt
              ? user.pcoLeaderVerified
                ? u.verifiedAt(formatDateTime(user.pcoVerifiedAt, zone))
                : u.notVerified
              : u.neverChecked}
          </dd>
        </dl>
        <ActionForm action={setActiveAction} id={activeFormId} aria-label={u.accountHeading}>
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="version" value={user.version} />
          <input type="hidden" name="active" value={user.active ? "false" : "true"} />
          {user.active ? (
            user.id !== viewer.id && (
              <ConfirmDialog
                formId={activeFormId}
                trigger={u.deactivate}
                triggerTone="danger"
                title={u.deactivateTitle(user.displayName)}
                body={u.deactivateBody}
                confirmLabel={u.deactivate}
                confirmTone="danger"
              />
            )
          ) : (
            <SubmitButton tone="secondary">{u.reactivate}</SubmitButton>
          )}
        </ActionForm>
      </Section>

      <Section title={u.rolesHeading} id="roles">
        <RolesForm
          userId={user.id}
          version={user.version}
          roles={roles}
          isSelf={user.id === viewer.id}
        />
      </Section>

      <Section title={adminCopy.departments.title} id="user-departments">
        {departments.length === 0 ? (
          <EmptyState>{adminCopy.common.none}</EmptyState>
        ) : (
          <ul className="space-y-2 text-sm">
            {departments.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/departments/${d.id}`} className={linkClass}>
                  {d.name}
                </Link>
                <Badge tone={d.type === "primary" ? "info" : "neutral"}>
                  {adminCopy.departments.typeLabels[d.type]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
