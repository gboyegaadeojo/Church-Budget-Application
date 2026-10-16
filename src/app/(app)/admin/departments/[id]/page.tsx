import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ActionForm,
  CheckboxField,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/ui/action-form";
import {
  isTeamSource,
  pendingSuggestions,
  sourceOptions,
  TEAM_SOURCE_TYPES,
} from "@/domain/departments/pco-mapping";
import { getPlanningCenterDirectory } from "@/lib/pco-directory";
import type { PcoTeamSourceType } from "@/lib/pco";
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
  addSuggestionAction,
  departmentMappingAction,
  ignoreSuggestionAction,
  syncNowAction,
  mergeProposedAction,
  planningCenterValueAction,
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

      {department.status === "active" && <PcoMappingSection department={department} zone={zone} />}

      {editable && !isTeamSource(department.pcoSourceType) && (
        <Section title={d.pcoHeading} description={d.pcoNote} id="planning-center">
          <ActionForm action={planningCenterValueAction} aria-label={d.pcoHeading}>
            <input type="hidden" name="id" value={department.id} />
            <input type="hidden" name="version" value={department.version} />
            <TextField
              name="value"
              label={d.pcoValue}
              hint={d.pcoValueHint(department.name)}
              defaultValue={
                department.pcoSourceType === "people_field_value"
                  ? (department.pcoSourceId ?? "")
                  : ""
              }
              autoComplete="off"
            />
            <SubmitButton tone="secondary">{d.pcoSave}</SubmitButton>
          </ActionForm>
        </Section>
      )}

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
                teamMapped={isTeamSource(department.pcoSourceType)}
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

/**
 * Planning Center mapping (FR-39, DRD 6.11): the linked team, group or tag, the mode,
 * "Team leaders count as Group Leaders", the last sync and **Sync now**, and the leaders
 * Planning Center suggests, each to Add or Ignore.
 */
async function PcoMappingSection({
  department,
  zone,
}: {
  department: NonNullable<Awaited<ReturnType<typeof getDepartmentDetail>>>["department"];
  zone: string;
}) {
  const p = d.pco;
  const db = getDb();
  const mapped = isTeamSource(department.pcoSourceType);
  const [options, suggestions] = await Promise.all([
    sourceOptions(getPlanningCenterDirectory()),
    pendingSuggestions(db, department.id),
  ]);
  const current = mapped ? `${department.pcoSourceType}:${department.pcoSourceId}` : "";
  const choices = options
    ? TEAM_SOURCE_TYPES.flatMap((type) =>
        options[type].map((o) => ({
          value: `${type}:${o.id}`,
          label: p.sourceOption(p.sourceTypes[type], o.name),
        })),
      )
    : [];

  return (
    <Section title={p.heading} description={p.intro} id="pco-mapping">
      <div className="space-y-1 text-sm">
        <p>
          {mapped
            ? p.current(
                p.sourceTypes[department.pcoSourceType as PcoTeamSourceType],
                department.pcoSourceName ?? "",
              )
            : p.notLinked}
        </p>
        {mapped && (
          <p className="text-fg-muted">
            {department.pcoLastSyncedAt
              ? p.lastSynced(formatDateTime(department.pcoLastSyncedAt, zone))
              : p.neverSynced}
          </p>
        )}
      </div>

      {options ? (
        <ActionForm action={departmentMappingAction} aria-label={p.heading}>
          <input type="hidden" name="id" value={department.id} />
          <input type="hidden" name="version" value={department.version} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              name="source"
              label={p.source}
              defaultValue={current}
              options={[{ value: "", label: p.noSource }, ...choices]}
            />
            <SelectField
              name="mode"
              label={p.mode}
              defaultValue={department.pcoMappingMode}
              options={[
                { value: "suggest", label: p.modes.suggest },
                { value: "automatic", label: p.modes.automatic },
              ]}
            />
          </div>
          <CheckboxField
            name="countsAsLeaders"
            label={p.countsAsLeaders}
            hint={p.countsAsLeadersHint}
            defaultChecked={department.pcoLeadersCountAsGroupLeaders}
          />
          <SubmitButton tone="secondary">{p.save}</SubmitButton>
        </ActionForm>
      ) : (
        <p className="text-sm text-warning" role="status">
          {p.unavailable}
        </p>
      )}

      {mapped && (
        <ActionForm action={syncNowAction} aria-label={p.syncNow}>
          <input type="hidden" name="id" value={department.id} />
          <SubmitButton tone="secondary">{p.syncNow}</SubmitButton>
        </ActionForm>
      )}

      {mapped && (
        <div className="space-y-3 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">{p.suggestionsHeading}</h3>
          <p className="text-sm text-fg-muted">{p.suggestionsHint}</p>
          {suggestions.length === 0 ? (
            <p className="text-sm text-fg-muted">{p.noSuggestions}</p>
          ) : (
            <ul className="divide-y divide-border" aria-label={p.suggestionsHeading}>
              {suggestions.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-col gap-3 py-3 lg:flex-row lg:items-end lg:justify-between"
                >
                  <div className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      <Badge tone="info">{p.suggestionsHeading}</Badge>
                    </span>
                    <span className="block text-xs break-all text-fg-muted">{s.email}</span>
                    <span className="block text-xs text-fg-muted">
                      {p.suggestedSince(formatDateTime(s.firstSeenAt, zone))}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <ActionForm
                      action={addSuggestionAction}
                      className="flex flex-wrap items-end gap-2 space-y-0"
                      aria-label={`${p.add} ${s.name}`}
                    >
                      <input type="hidden" name="departmentId" value={department.id} />
                      <input type="hidden" name="suggestionId" value={s.id} />
                      <input type="hidden" name="version" value={s.version} />
                      <SelectField
                        name="slot"
                        label={`${p.addAs} (${s.name})`}
                        defaultValue="representative"
                        options={LEADER_SLOTS.map((slot) => ({
                          value: slot,
                          label: d.slotLabels[slot],
                        }))}
                      />
                      <SubmitButton tone="secondary">{p.add}</SubmitButton>
                    </ActionForm>
                    <ActionForm
                      action={ignoreSuggestionAction}
                      className="space-y-0"
                      aria-label={`${p.ignore} ${s.name}`}
                    >
                      <input type="hidden" name="departmentId" value={department.id} />
                      <input type="hidden" name="suggestionId" value={s.id} />
                      <input type="hidden" name="version" value={s.version} />
                      <SubmitButton tone="ghost">{p.ignore}</SubmitButton>
                    </ActionForm>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Section>
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
  teamMapped,
}: {
  departmentId: string;
  leader: Leader;
  editable: boolean;
  /** Linked to a team, group or tag rather than the Ministry Department field (FR-39). */
  teamMapped: boolean;
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
          {leader.source === "pco_mapping" &&
            (leader.pcoStatus === "no_longer_leader" ? (
              <Badge tone="warning">{teamMapped ? d.pco.noLongerLeader : d.noLongerListed}</Badge>
            ) : (
              <Badge>{d.fromPlanningCenter}</Badge>
            ))}
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
