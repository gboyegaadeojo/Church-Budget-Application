import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ActionForm,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  AdminSkeleton,
  Badge,
  EmptyState,
  PageHeader,
  PermissionDenied,
  Section,
} from "@/components/ui/display";
import { adminCopy } from "@/copy/admin";
import { getDb } from "@/db";
import { getDepartmentDetail, type Leader } from "@/domain/departments/queries";
import { getChurchTimeZone, readSettings } from "@/domain/settings";
import { leaderCandidates } from "@/domain/users/admin-queries";
import { viewerAllowedTo } from "@/lib/admin-server";
import { LEADER_SLOTS, type LeaderSlot } from "@/domain/departments/slots";
import { formatDateTime } from "@/lib/time-zone";
import {
  acceptProposedAction,
  mergeProposedAction,
  rejectProposedAction,
  removeLeaderAction,
  renameAction,
  setDepartmentActiveAction,
  setLeaderAction,
} from "../actions";

const d = adminCopy.departments;

export const metadata: Metadata = { title: d.title };

const STATUS_TONE = {
  active: "success",
  inactive: "neutral",
  proposed: "warning",
  rejected: "neutral",
} as const;
const STATUS_LABEL = {
  active: d.tabs.active,
  inactive: d.tabs.inactive,
  proposed: d.tabs.proposed,
  rejected: d.reject,
};

export default function DepartmentPage({ params }: PageProps<"/admin/departments/[id]">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <DepartmentContent params={params} />
      </Suspense>
    </div>
  );
}

async function DepartmentContent({ params }: Pick<PageProps<"/admin/departments/[id]">, "params">) {
  const viewer = await viewerAllowedTo("admin.departments", "/admin/departments");
  if (!viewer) return <PermissionDenied />;
  const { id } = await params;
  const db = getDb();
  const detail = await getDepartmentDetail(db, id);
  if (!detail) notFound();
  const { department, leaders, proposedBy, requests, matches, mergeTargets } = detail;
  const { pco_require_for_requesters } = await readSettings(db, ["pco_require_for_requesters"]);
  const candidates = (await leaderCandidates(db, pco_require_for_requesters === "true")).filter(
    (c) => !leaders.some((l) => l.userId === c.id),
  );
  const zone = await getChurchTimeZone(db);
  const editable = department.status === "active" || department.status === "proposed";
  const statusFormId = `status-${department.id}`;

  return (
    <>
      <PageHeader title={department.name} back={{ href: "/admin/departments", label: d.title }}>
        <Badge tone={STATUS_TONE[department.status]}>{STATUS_LABEL[department.status]}</Badge>
      </PageHeader>

      {department.status === "proposed" && (
        <Section title={d.proposedHeading} id="proposed">
          {proposedBy && (
            <p className="text-sm">
              {d.proposedBy(proposedBy, formatDateTime(department.createdAt, zone))}
            </p>
          )}
          <div className="space-y-1 text-sm">
            <h3 className="font-medium">{d.closeMatches}</h3>
            {matches.length ? (
              <ul className="list-inside list-disc text-fg-muted">
                {matches.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : (
              <p className="text-fg-muted">{d.noCloseMatches}</p>
            )}
          </div>
          <div className="space-y-1 text-sm">
            <h3 className="font-medium">{d.linkedRequests}</h3>
            {requests.length ? (
              <ul className="text-fg-muted">
                {requests.map((r) => (
                  <li
                    key={r.id}
                  >{`${r.cycle}: ${r.title}${r.reference ? ` (${r.reference})` : ""}`}</li>
                ))}
              </ul>
            ) : (
              <p className="text-fg-muted">{d.noLinkedRequests}</p>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <ActionForm action={acceptProposedAction} aria-label={d.accept}>
              <input type="hidden" name="id" value={department.id} />
              <input type="hidden" name="version" value={department.version} />
              <SubmitButton>{d.accept}</SubmitButton>
            </ActionForm>

            <ActionForm
              action={mergeProposedAction}
              id={`merge-${department.id}`}
              aria-label={d.mergeInto}
            >
              <input type="hidden" name="id" value={department.id} />
              <input type="hidden" name="version" value={department.version} />
              <SelectField
                name="intoId"
                label={d.mergeTarget}
                placeholder={d.mergeInto}
                options={mergeTargets.map((t) => ({ value: t.id, label: t.name }))}
              />
              <ConfirmDialog
                formId={`merge-${department.id}`}
                trigger={d.merge}
                title={d.mergeTitle}
                body={d.mergeBody}
                confirmLabel={d.merge}
              />
            </ActionForm>

            <ActionForm action={rejectProposedAction} aria-label={d.reject}>
              <input type="hidden" name="id" value={department.id} />
              <input type="hidden" name="version" value={department.version} />
              <TextAreaField name="reason" label={d.rejectReason} rows={3} required />
              <SubmitButton tone="danger">{d.reject}</SubmitButton>
            </ActionForm>
          </div>
        </Section>
      )}

      <Section title={d.renameHeading} description={d.renameNote} id="rename">
        <ActionForm action={renameAction} aria-label={d.renameHeading}>
          <input type="hidden" name="id" value={department.id} />
          <input type="hidden" name="version" value={department.version} />
          <TextField name="name" label={d.columns.name} defaultValue={department.name} required />
          <SubmitButton tone="secondary">{d.rename}</SubmitButton>
        </ActionForm>
      </Section>

      <Section title={d.leadersHeading} description={d.leadersHint} id="leaders">
        {leaders.length === 0 ? (
          <EmptyState>{d.noLeaders}</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {leaders.map((leader) => (
              <LeaderRow
                key={leader.userId}
                departmentId={department.id}
                leader={leader}
                editable={editable}
              />
            ))}
          </ul>
        )}
        {editable &&
          (candidates.length === 0 ? (
            <p className="text-sm text-fg-muted">{d.noCandidates}</p>
          ) : (
            <ActionForm
              action={setLeaderAction}
              aria-label={d.addLeader}
              className="border-t border-border pt-4"
            >
              <h3 className="text-sm font-semibold">{d.addLeader}</h3>
              <input type="hidden" name="departmentId" value={department.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  name="userId"
                  label={d.person}
                  placeholder={d.choosePerson}
                  options={candidates.map((c) => ({
                    value: c.id,
                    label: `${c.name} (${c.email})`,
                  }))}
                />
                <SelectField
                  name="type"
                  label={d.as}
                  defaultValue={
                    leaders.some((l) => l.slot === "primary") ? "representative" : "primary"
                  }
                  options={LEADER_SLOTS.map((slot) => ({ value: slot, label: d.slotLabels[slot] }))}
                />
              </div>
              <SubmitButton tone="secondary">{d.addPerson}</SubmitButton>
            </ActionForm>
          ))}
      </Section>

      {department.status !== "proposed" && department.status !== "rejected" && (
        <Section title={d.statusHeading} id="status">
          <ActionForm
            action={setDepartmentActiveAction}
            id={statusFormId}
            aria-label={d.statusHeading}
          >
            <input type="hidden" name="id" value={department.id} />
            <input type="hidden" name="version" value={department.version} />
            <input
              type="hidden"
              name="active"
              value={department.status === "active" ? "false" : "true"}
            />
            {department.status === "active" ? (
              <ConfirmDialog
                formId={statusFormId}
                trigger={d.deactivate}
                triggerTone="danger"
                title={d.deactivateTitle(department.name)}
                body={d.deactivateBody}
                confirmLabel={d.deactivate}
                confirmTone="danger"
              />
            ) : (
              <SubmitButton tone="secondary">{d.reactivate}</SubmitButton>
            )}
          </ActionForm>
        </Section>
      )}
    </>
  );
}

const MAKE: Record<LeaderSlot, string> = {
  primary: d.makePrimary,
  backup_1: d.makeBackup1,
  backup_2: d.makeBackup2,
  representative: d.makeRepresentative,
};

/** The other slots a leader can move to. */
const otherSlots = (slot: LeaderSlot) => LEADER_SLOTS.filter((s) => s !== slot);

function LeaderRow({
  departmentId,
  leader,
  editable,
}: {
  departmentId: string;
  leader: Leader;
  editable: boolean;
}) {
  const removeId = `remove-${departmentId}-${leader.userId}`;
  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{leader.name}</span>
          <Badge tone={leader.slot === "primary" ? "info" : "neutral"}>
            {d.slotLabels[leader.slot]}
          </Badge>
        </span>
        <span className="block text-xs break-all text-fg-muted">{leader.email}</span>
      </div>
      {editable && (
        <div className="flex flex-wrap gap-2">
          <ActionForm
            action={setLeaderAction}
            className="flex flex-wrap gap-2 space-y-0"
            aria-label={leader.name}
          >
            <input type="hidden" name="departmentId" value={departmentId} />
            <input type="hidden" name="userId" value={leader.userId} />
            {otherSlots(leader.slot).map((slot) => (
              <SubmitButton key={slot} tone="secondary" name="type" value={slot}>
                {MAKE[slot]}
              </SubmitButton>
            ))}
          </ActionForm>
          <ActionForm
            action={removeLeaderAction}
            id={removeId}
            className="space-y-0"
            aria-label={d.remove}
          >
            <input type="hidden" name="departmentId" value={departmentId} />
            <input type="hidden" name="userId" value={leader.userId} />
            <ConfirmDialog
              formId={removeId}
              trigger={d.remove}
              triggerTone="danger"
              title={d.removeTitle(leader.name)}
              body={d.removeBody}
              confirmLabel={d.remove}
              confirmTone="danger"
            />
          </ActionForm>
        </div>
      )}
    </li>
  );
}
