import { Suspense } from "react";
import type { Metadata } from "next";
import { Building2, UserPlus, UsersRound } from "lucide-react";
import { cn } from "@/lib/cn";
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
import type { PcoPerson, PcoTeamSourceType } from "@/lib/pco";
import { buttonClass, inputClass } from "@/components/ui/styles";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  AdminSkeleton,
  Badge,
  type BadgeTone,
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
  addFromPlanningCenterAction,
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

export default function DepartmentPage({
  params,
  searchParams,
}: PageProps<"/admin/departments/[id]">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <DepartmentContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function DepartmentContent({
  params,
  searchParams,
}: Pick<PageProps<"/admin/departments/[id]">, "params" | "searchParams">) {
  const viewer = await viewerAllowedTo("admin.departments", "/admin/departments");
  if (!viewer) return <PermissionDenied />;
  const { id } = await params;
  const { pco } = await searchParams;
  const pcoQuery = typeof pco === "string" ? pco.slice(0, 100) : "";
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
  const hasPrimary = leaders.some((l) => l.slot === "primary");
  const statusFormId = `status-${department.id}`;

  return (
    <>
      <PageHeader
        title={department.name}
        intro={d.intro}
        back={{ href: "/admin/departments", label: d.title }}
      >
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

      <Section
        title={d.leadersHeading}
        description={d.leadersHint}
        id="leaders"
        icon={UsersRound}
        tone="blue"
      >
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
        {editable && (
          <div className="space-y-4 rounded-[12px] bg-surface-2 p-4 sm:p-5">
            <PcoLeaderSearch
              departmentId={department.id}
              query={pcoQuery}
              hasPrimary={hasPrimary}
            />
            {candidates.length > 0 && (
              <details className="group border-t border-border pt-4">
                <summary className="cursor-pointer text-sm font-medium text-fg-muted hover:text-fg">
                  {d.orSignedIn}
                </summary>
                <ActionForm action={setLeaderAction} aria-label={d.orSignedIn} className="pt-3">
                  <input type="hidden" name="departmentId" value={department.id} />
                  <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
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
                      defaultValue={hasPrimary ? "representative" : "primary"}
                      options={LEADER_SLOTS.map((slot) => ({
                        value: slot,
                        label: d.slotLabels[slot],
                      }))}
                    />
                  </div>
                  <SubmitButton tone="secondary">{d.addPerson}</SubmitButton>
                </ActionForm>
              </details>
            )}
          </div>
        )}
      </Section>

      <Section
        title={d.detailsHeading}
        description={d.detailsNote}
        id="details"
        icon={Building2}
        tone="slate"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <ActionForm action={renameAction} aria-label={d.renameHeading}>
            <input type="hidden" name="id" value={department.id} />
            <input type="hidden" name="version" value={department.version} />
            <TextField
              name="name"
              label={d.renameHeading}
              hint={d.renameNote}
              defaultValue={department.name}
              required
            />
            <SubmitButton tone="secondary">{d.rename}</SubmitButton>
          </ActionForm>
          {editable && !isTeamSource(department.pcoSourceType) && (
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
          )}
        </div>

        {department.status !== "proposed" && department.status !== "rejected" && (
          <ActionForm
            action={setDepartmentActiveAction}
            id={statusFormId}
            aria-label={d.statusHeading}
            className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <input type="hidden" name="id" value={department.id} />
            <input type="hidden" name="version" value={department.version} />
            <input
              type="hidden"
              name="active"
              value={department.status === "active" ? "false" : "true"}
            />
            <p className="text-sm text-fg-muted">
              {department.status === "active" ? d.deactivateNote : STATUS_LABEL.inactive}
            </p>
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
        )}
      </Section>

      {/* Team mapping is off (docs/decisions.md 2026-10-19); a department linked before can still be unlinked. */}
      {department.status === "active" && isTeamSource(department.pcoSourceType) && (
        <PcoMappingSection department={department} zone={zone} />
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

/**
 * Add a leader who hasn't signed in yet: search Planning Center by name or email, then
 * add a match as Primary, Backup or Representative (FR-38). The service checks they're a
 * Group Leader and makes their account.
 */
async function PcoLeaderSearch({
  departmentId,
  query,
  hasPrimary,
}: {
  departmentId: string;
  query: string;
  hasPrimary: boolean;
}) {
  const f = d.fromPco;
  const directory = getPlanningCenterDirectory();
  if (!directory) return null;
  let people: PcoPerson[] | null = [];
  if (query.trim().length >= 2) {
    try {
      people = await directory.searchPeople(query);
    } catch {
      people = null;
    }
  }
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold">
          <UserPlus className="size-4 text-fg-muted" aria-hidden="true" />
          {f.heading}
        </h3>
        <p className="text-sm text-fg-muted">{f.hint}</p>
      </div>
      <form
        method="get"
        action={`/admin/departments/${departmentId}#leaders`}
        role="search"
        aria-label={f.heading}
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <div className="flex-1 space-y-1.5">
          <label htmlFor="pco-search" className="block text-sm font-medium">
            {f.search}
          </label>
          <input
            id="pco-search"
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
            className="divide-y divide-border rounded-[12px] border border-border bg-surface px-4"
            aria-label={f.heading}
          >
            {people.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-3 py-3 lg:flex-row lg:items-end lg:justify-between"
              >
                <div className="min-w-0">
                  <span className="block font-medium">{p.name}</span>
                  <span className="block text-xs break-all text-fg-muted">{p.emails[0] ?? ""}</span>
                </div>
                <ActionForm
                  action={addFromPlanningCenterAction}
                  className="flex flex-wrap items-end gap-2 space-y-0"
                  aria-label={f.addAs(p.name)}
                >
                  <input type="hidden" name="departmentId" value={departmentId} />
                  <input type="hidden" name="pcoPersonId" value={p.id} />
                  <SelectField
                    name="type"
                    label={f.addAs(p.name)}
                    defaultValue={hasPrimary ? "representative" : "primary"}
                    options={LEADER_SLOTS.map((slot) => ({
                      value: slot,
                      label: d.slotLabels[slot],
                    }))}
                  />
                  <SubmitButton tone="secondary">{f.add}</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

const SLOT_TONE: Record<LeaderSlot, BadgeTone> = {
  primary: "info",
  backup_1: "success",
  backup_2: "success",
  representative: "neutral",
};

/** "Sam Lee" → "SL", for the round marker beside each leader. */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

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
  const roleId = `role-${departmentId}-${leader.userId}`;
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold text-fg-muted"
        >
          {initials(leader.name)}
        </span>
        <div className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{leader.name}</span>
            <Badge tone={SLOT_TONE[leader.slot]}>{d.slotLabels[leader.slot]}</Badge>
            {leader.source === "pco_mapping" &&
              (leader.pcoStatus === "no_longer_leader" ? (
                <Badge tone="warning">{teamMapped ? d.pco.noLongerLeader : d.noLongerListed}</Badge>
              ) : (
                <Badge>{d.fromPlanningCenter}</Badge>
              ))}
          </span>
          <span className="block text-xs break-all text-fg-muted">{leader.email}</span>
        </div>
      </div>
      {editable && (
        <div className="flex flex-wrap items-start gap-2 md:justify-end">
          <ActionForm
            action={setLeaderAction}
            className="flex flex-wrap items-center gap-2 space-y-0"
            aria-label={d.roleFor(leader.name)}
          >
            <input type="hidden" name="departmentId" value={departmentId} />
            <input type="hidden" name="userId" value={leader.userId} />
            <label htmlFor={roleId} className="sr-only">
              {d.roleFor(leader.name)}
            </label>
            <select
              id={roleId}
              name="type"
              defaultValue={leader.slot}
              className={cn(inputClass, "w-auto min-w-40")}
            >
              {LEADER_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {d.slotLabels[slot]}
                </option>
              ))}
            </select>
            <SubmitButton tone="secondary">{d.changeRole}</SubmitButton>
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
