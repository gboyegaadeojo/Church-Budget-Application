import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SelectField, SubmitButton } from "@/components/ui/action-form";
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
import { listDepartments } from "@/domain/departments/queries";
import { getChurchTimeZone } from "@/domain/settings";
import { suggestPlanningCenterPeople, type PcoCandidate } from "@/domain/users/admin";
import { getUserDetail } from "@/domain/users/admin-queries";
import { submitterDepartmentsOf } from "@/domain/users/expense-submitters";
import { viewerAllowedTo } from "@/lib/admin-server";
import { PlanningCenterUnavailableError } from "@/lib/pco";
import { getPlanningCenterDirectory } from "@/lib/pco-directory";
import type { Viewer } from "@/lib/roles";
import { formatDate, formatDateTime, zonedDate } from "@/lib/time-zone";
import { alertsFor, listPushDevices } from "@/domain/notifications/push";
import {
  addSubmitterAction,
  removePushDeviceAction,
  removeSubmitterAction,
  setActiveAction,
  setPushAlertsAction,
} from "../actions";
import { PcoLink } from "./pco-link";
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
  const [zone, submitterOf, active, devices, alerts] = await Promise.all([
    getChurchTimeZone(db),
    submitterDepartmentsOf(db, viewer, user.id),
    listDepartments(db, "active"),
    listPushDevices(db, user.id),
    alertsFor(db, user.id),
  ]);
  const a = u.alerts;
  const canAddSubmitter = active.filter(
    (d) =>
      !departments.some((mine) => mine.id === d.id) &&
      !(submitterOf ?? []).some((s) => s.id === d.id),
  );
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

      <Section title={a.heading} id="phone-alerts">
        <p className="text-sm text-fg-muted">{a.intro}</p>
        {alerts === "church_off" && <p className="text-sm text-warning">{a.churchOff}</p>}
        <ActionForm
          action={setPushAlertsAction}
          className="flex flex-wrap items-center gap-3"
          aria-label={a.heading}
        >
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="version" value={user.version} />
          <input type="hidden" name="on" value={user.pushAlerts ? "false" : "true"} />
          <Badge tone={user.pushAlerts ? "success" : "neutral"}>
            {user.pushAlerts ? a.on : a.off}
          </Badge>
          <SubmitButton tone="secondary">{user.pushAlerts ? a.turnOff : a.turnOn}</SubmitButton>
        </ActionForm>
        {devices.length === 0 ? (
          <EmptyState>{a.noDevices}</EmptyState>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {devices.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{d.device}</span>
                  <span className="ml-2 text-fg-muted">
                    {a.added(formatDate(zonedDate(d.createdAt, zone)))}
                  </span>
                </span>
                <ActionForm action={removePushDeviceAction} aria-label={a.removeLabel(d.device)}>
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="deviceId" value={d.id} />
                  <SubmitButton tone="secondary">{a.remove}</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={u.pco.heading} id="planning-center">
        <PcoLink
          userId={user.id}
          name={user.displayName}
          version={user.version}
          {...await planningCenterLink(viewer, user)}
        />
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

      <Section title={u.submitter.heading} id="expense-submitter">
        <p className="text-sm text-fg-muted">{u.submitter.intro}</p>
        {(submitterOf ?? []).length === 0 ? (
          <EmptyState>{u.submitter.none}</EmptyState>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {(submitterOf ?? []).map((d) => {
              const formId = `submitter-${d.id}`;
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <Link href={`/admin/departments/${d.id}`} className={linkClass}>
                      {d.name}
                    </Link>
                    <span className="ml-2 text-fg-muted">
                      {u.submitter.since(formatDateTime(d.since, zone))}
                    </span>
                  </span>
                  <ActionForm action={removeSubmitterAction} id={formId}>
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="departmentId" value={d.id} />
                    <ConfirmDialog
                      formId={formId}
                      trigger={u.submitter.remove}
                      title={u.submitter.removeTitle(d.name)}
                      body={u.submitter.removeBody}
                      confirmLabel={u.submitter.remove}
                    />
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        )}
        {canAddSubmitter.length > 0 && (
          <ActionForm
            action={addSubmitterAction}
            className="flex flex-wrap items-end gap-3"
            aria-label={u.submitter.heading}
          >
            <input type="hidden" name="userId" value={user.id} />
            <SelectField
              name="departmentId"
              label={u.submitter.department}
              placeholder={u.submitter.choose}
              options={canAddSubmitter.map((d) => ({ value: d.id, label: d.name }))}
              required
            />
            <SubmitButton tone="secondary">{u.submitter.add}</SubmitButton>
          </ActionForm>
        )}
      </Section>
    </>
  );
}

/**
 * The linked Planning Center person's name, or people with this account's email to
 * suggest. Planning Center being down or not set up shows a message, not an error page.
 */
async function planningCenterLink(
  viewer: Viewer,
  user: { id: string; pcoPersonId: string | null },
): Promise<{
  linked: { id: string; name: string | null } | null;
  suggestions: PcoCandidate[] | null;
  problem?: string;
}> {
  const linked = user.pcoPersonId ? { id: user.pcoPersonId, name: null as string | null } : null;
  const directory = getPlanningCenterDirectory();
  if (!directory) return { linked, suggestions: null, problem: u.pco.notConfigured };
  try {
    if (linked) {
      linked.name = (await directory.getPerson(linked.id))?.name ?? null;
      return { linked, suggestions: null };
    }
    return {
      linked,
      suggestions: await suggestPlanningCenterPeople(getDb(), viewer, directory, user.id),
    };
  } catch (error) {
    if (!(error instanceof PlanningCenterUnavailableError)) throw error;
    return { linked, suggestions: null, problem: u.pco.unavailable };
  }
}
