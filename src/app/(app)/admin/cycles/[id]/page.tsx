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
import { getCycleDetail } from "@/domain/cycles/queries";
import { deadlineEditable } from "@/domain/cycles/status";
import { getChurchTimeZone } from "@/domain/settings";
import { viewerAllowedTo } from "@/lib/admin-server";
import { formatCAD, formatTaxRate } from "@/lib/money";
import { formatDateTime, utcToZonedLocal } from "@/lib/time-zone";
import { changeDeadlineAction, cycleStatusAction, extendAction } from "../actions";
import { CYCLE_TONE } from "../tones";

const c = adminCopy.cycles;

export const metadata: Metadata = { title: c.title };

export default function CyclePage({ params }: PageProps<"/admin/cycles/[id]">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <CycleContent params={params} />
      </Suspense>
    </div>
  );
}

async function CycleContent({ params }: Pick<PageProps<"/admin/cycles/[id]">, "params">) {
  const viewer = await viewerAllowedTo("admin.cycles", "/admin/cycles");
  if (!viewer) return <PermissionDenied />;
  const { id } = await params;
  const db = getDb();
  const detail = await getCycleDetail(db, id);
  if (!detail) notFound();
  const { cycle, extensions, activeDepartments } = detail;
  const zone = await getChurchTimeZone(db);
  const statusFormId = `cycle-status-${cycle.id}`;
  const deadlineLocal = utcToZonedLocal(cycle.submissionDeadline, zone);

  return (
    <>
      <PageHeader title={cycle.name} back={{ href: "/admin/cycles", label: c.title }}>
        <Badge tone={CYCLE_TONE[cycle.status]}>{c.statusLabels[cycle.status]}</Badge>
      </PageHeader>

      <Section title={c.detailsHeading} id="details">
        <dl className="grid gap-3 text-sm sm:grid-cols-[16rem_1fr]">
          <dt className="text-fg-muted">{c.budgetYear}</dt>
          <dd>{cycle.budgetYear}</dd>
          <dt className="text-fg-muted">{c.startDate}</dt>
          <dd>{cycle.startDate}</dd>
          <dt className="text-fg-muted">{c.deadline}</dt>
          <dd>{formatDateTime(cycle.submissionDeadline, zone)}</dd>
          <dt className="text-fg-muted">{c.taxRate}</dt>
          <dd>{formatTaxRate(cycle.defaultTaxRate)}</dd>
          <dt className="text-fg-muted">{c.boardTotal}</dt>
          <dd className="tabular">
            {cycle.boardTotalCents === null
              ? adminCopy.common.none
              : formatCAD(cycle.boardTotalCents)}
            {cycle.boardReference && (
              <span className="text-fg-muted"> · {cycle.boardReference}</span>
            )}
          </dd>
        </dl>

        {cycle.status !== "closed" && (
          <ActionForm
            action={cycleStatusAction}
            id={statusFormId}
            aria-label={c.statusLabels[cycle.status]}
          >
            <input type="hidden" name="id" value={cycle.id} />
            <input type="hidden" name="version" value={cycle.version} />
            <input type="hidden" name="event" value={cycle.status === "draft" ? "open" : "close"} />
            {cycle.status === "draft" ? (
              <ConfirmDialog
                formId={statusFormId}
                trigger={c.open}
                triggerTone="primary"
                title={c.openTitle(cycle.name)}
                body={c.openBody}
                confirmLabel={c.open}
              />
            ) : (
              <ConfirmDialog
                formId={statusFormId}
                trigger={c.close}
                triggerTone="danger"
                title={c.closeTitle(cycle.name)}
                body={c.closeBody}
                confirmLabel={c.close}
                confirmTone="danger"
              />
            )}
          </ActionForm>
        )}
      </Section>

      {cycle.status === "closed" && (
        <Section title={c.reopenHeading} id="reopen">
          <ActionForm action={cycleStatusAction} aria-label={c.reopenHeading}>
            <input type="hidden" name="id" value={cycle.id} />
            <input type="hidden" name="version" value={cycle.version} />
            <input type="hidden" name="event" value="reopen" />
            <TextField
              name="newDeadline"
              type="datetime-local"
              label={c.newDeadline}
              hint={c.deadlineHint(zone)}
              required
            />
            <TextAreaField name="reason" label={adminCopy.common.reason} rows={2} required />
            <SubmitButton>{c.reopen}</SubmitButton>
          </ActionForm>
        </Section>
      )}

      {deadlineEditable(cycle.status) && (
        <Section title={c.deadlineHeading} id="deadline">
          <ActionForm action={changeDeadlineAction} aria-label={c.deadlineHeading}>
            <input type="hidden" name="id" value={cycle.id} />
            <input type="hidden" name="version" value={cycle.version} />
            <TextField
              name="newDeadline"
              type="datetime-local"
              label={c.newDeadline}
              hint={c.deadlineHint(zone)}
              defaultValue={deadlineLocal}
              required
            />
            <TextAreaField name="reason" label={adminCopy.common.reason} rows={2} required />
            <SubmitButton tone="secondary">{c.changeDeadline}</SubmitButton>
          </ActionForm>
        </Section>
      )}

      <Section title={c.extensionsHeading} description={c.extensionsHint} id="extensions">
        {extensions.length === 0 ? (
          <EmptyState>{c.noExtensions}</EmptyState>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {extensions.map((x) => (
              <li
                key={x.id}
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <span>
                  <span className="font-medium">{x.department}</span>
                  <span className="block text-fg-muted">{`${x.reason} · ${x.grantedBy}`}</span>
                </span>
                <Badge tone={x.supersededAt ? "neutral" : "info"}>
                  {x.supersededAt ? c.superseded : c.extendedTo(formatDateTime(x.deadline, zone))}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {cycle.status === "open" && (
          <ActionForm
            action={extendAction}
            aria-label={c.grant}
            className="border-t border-border pt-4"
            resetOnSuccess
          >
            <input type="hidden" name="cycleId" value={cycle.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                name="departmentId"
                label={c.department}
                placeholder={c.chooseDepartment}
                options={activeDepartments.map((dep) => ({ value: dep.id, label: dep.name }))}
              />
              <TextField
                name="newDeadline"
                type="datetime-local"
                label={c.extendTo}
                hint={c.deadlineHint(zone)}
                required
              />
            </div>
            <TextAreaField name="reason" label={adminCopy.common.reason} rows={2} required />
            <SubmitButton tone="secondary">{c.grant}</SubmitButton>
          </ActionForm>
        )}
      </Section>
    </>
  );
}
