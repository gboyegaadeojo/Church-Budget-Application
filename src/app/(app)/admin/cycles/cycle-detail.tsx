import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ActionForm,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge, PageHeader } from "@/components/ui/display";
import { SettingsDisclosure, SettingsGroup, SettingsRow } from "@/components/ui/grouped-list";
import { buttonClass } from "@/components/ui/styles";
import { adminCopy } from "@/copy/admin";
import { getDb } from "@/db";
import { centsToInput } from "@/domain/annual/schema";
import { getCycleDetail } from "@/domain/cycles/queries";
import { deadlineEditable } from "@/domain/cycles/status";
import { getChurchTimeZone } from "@/domain/settings";
import { authorize } from "@/lib/authz";
import { formatCAD, formatTaxRate, taxRateToPercent } from "@/lib/money";
import { getViewer } from "@/lib/viewer";
import { formatDate, formatDateTime, utcToZonedLocal } from "@/lib/time-zone";
import {
  changeDeadlineAction,
  cycleStatusAction,
  extendAction,
  updateCycleDetailsAction,
} from "./actions";
import { CYCLE_TONE } from "./tones";

const c = adminCopy.cycles;

/**
 * One budget cycle (Requirements 4, DRD 6.11): its details and the form to edit them,
 * open it, change its deadline, and give extensions; closing the budget year links to
 * Spending → Close budget year (docs/decisions.md 2026-10-18). Shared by Admin →
 * Budget Cycles and Annual Budget → Budget cycles; the caller checks permission
 * (`admin.cycles` or `cycles.manage`) and the services check `cycles.manage` again.
 */
export async function CycleDetail({
  id,
  back,
}: {
  id: string;
  back: { href: string; label: string };
}) {
  const db = getDb();
  const detail = await getCycleDetail(db, id);
  if (!detail) notFound();
  const { cycle, extensions, activeDepartments, deadlineChanges } = detail;
  const zone = await getChurchTimeZone(db);
  const statusFormId = `cycle-status-${cycle.id}`;
  const canClose = authorize(await getViewer(), "cycles.close").allowed;
  const deadlineLocal = utcToZonedLocal(cycle.submissionDeadline, zone);

  return (
    <>
      <PageHeader title={cycle.name} back={back}>
        <Badge tone={CYCLE_TONE[cycle.status]}>{c.statusLabels[cycle.status]}</Badge>
      </PageHeader>

      <SettingsGroup title={c.detailsHeading} id="details" footer={c.editIntro}>
        <SettingsRow label={c.budgetYear}>
          <span className="tabular">{cycle.budgetYear}</span>
        </SettingsRow>
        <SettingsRow label={c.startDate}>{formatDate(cycle.startDate)}</SettingsRow>
        <SettingsRow label={c.spendingPeriodEnd}>
          {formatDate(cycle.spendingPeriodEnd ?? `${cycle.budgetYear}-12-31`)}
        </SettingsRow>
        <SettingsRow label={c.taxRate}>{formatTaxRate(cycle.defaultTaxRate)}</SettingsRow>
        <SettingsRow label={c.boardTotal}>
          <span className="tabular">
            {cycle.boardTotalCents === null
              ? adminCopy.common.none
              : formatCAD(cycle.boardTotalCents)}
            {cycle.boardReference && <span> · {cycle.boardReference}</span>}
          </span>
        </SettingsRow>
        <SettingsDisclosure accent label={c.editHeading}>
          <ActionForm action={updateCycleDetailsAction} aria-label={c.editHeading}>
            <input type="hidden" name="id" value={cycle.id} />
            <input type="hidden" name="version" value={cycle.version} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="name" label={c.name} defaultValue={cycle.name} required />
              <TextField
                name="budgetYear"
                type="number"
                inputMode="numeric"
                label={c.budgetYear}
                defaultValue={String(cycle.budgetYear)}
                required
              />
              <TextField
                name="startDate"
                type="date"
                label={c.startDate}
                defaultValue={cycle.startDate}
                required
              />
              <TextField
                name="taxRatePercent"
                inputMode="decimal"
                label={c.taxRate}
                hint={c.taxRateEditHint}
                defaultValue={taxRateToPercent(cycle.defaultTaxRate)}
                required
              />
              <TextField
                name="boardTotal"
                inputMode="decimal"
                label={c.boardTotal}
                defaultValue={
                  cycle.boardTotalCents === null ? "" : centsToInput(cycle.boardTotalCents)
                }
              />
              <TextField
                name="boardReference"
                label={c.boardReference}
                defaultValue={cycle.boardReference ?? ""}
              />
              <TextField
                name="spendingPeriodEnd"
                type="date"
                label={c.spendingPeriodEnd}
                hint={c.spendingPeriodEndHint}
                defaultValue={cycle.spendingPeriodEnd ?? ""}
              />
            </div>
            <SubmitButton tone="secondary">{c.save}</SubmitButton>
          </ActionForm>
        </SettingsDisclosure>
      </SettingsGroup>

      <section aria-label={c.statusLabels[cycle.status]} className="space-y-2 px-1">
        {cycle.status === "draft" && (
          <ActionForm action={cycleStatusAction} id={statusFormId} aria-label={c.open}>
            <input type="hidden" name="id" value={cycle.id} />
            <input type="hidden" name="version" value={cycle.version} />
            <input type="hidden" name="event" value="open" />
            <ConfirmDialog
              formId={statusFormId}
              trigger={c.open}
              triggerTone="primary"
              title={c.openTitle(cycle.name)}
              body={c.openBody}
              confirmLabel={c.open}
            />
          </ActionForm>
        )}
        {cycle.status === "open" && (
          <div className="space-y-2">
            <p className="text-sm text-fg-muted">{c.closeHint}</p>
            {canClose && (
              <Link
                href={`/spending/year-end?cycle=${cycle.id}`}
                className={buttonClass("secondary")}
              >
                {c.close}
              </Link>
            )}
          </div>
        )}
        {cycle.status === "closed" && (
          <div className="space-y-2">
            <p className="text-sm text-fg-muted">{c.closedNote}</p>
            {canClose && (
              <Link
                href={`/spending/year-end?cycle=${cycle.id}`}
                className={buttonClass("secondary")}
              >
                {c.reopen}
              </Link>
            )}
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <SettingsGroup title={c.deadlineGroup} id="deadline" footer={c.deadlineFooter}>
          <SettingsRow label={c.currentDeadline}>
            <span className="text-right font-medium text-fg">
              {formatDateTime(cycle.submissionDeadline, zone)}
            </span>
          </SettingsRow>
          {deadlineChanges.map((d) => (
            <SettingsRow
              key={d.id}
              label={
                <span className="font-normal">
                  {d.to ? c.changedTo(formatDateTime(d.to, zone)) : c.deadlineChanged}
                </span>
              }
              description={[
                d.from ? c.changedFrom(formatDateTime(d.from, zone)) : null,
                d.reason,
                d.changedBy,
                formatDateTime(d.changedAt, zone),
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          ))}
          {deadlineEditable(cycle.status) && (
            <SettingsDisclosure accent label={c.deadlineHeading}>
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
            </SettingsDisclosure>
          )}
        </SettingsGroup>

        <SettingsGroup
          title={c.extensionsHeading}
          id="extensions"
          footer={c.extensionsFooter}
          actions={extensions.length > 0 ? String(extensions.length) : undefined}
        >
          {extensions.length === 0 && (
            <SettingsRow
              label={<span className="font-normal text-fg-muted">{c.noExtensions}</span>}
            />
          )}
          {extensions.map((x) => (
            <SettingsRow
              key={x.id}
              label={x.department}
              description={[
                x.reason,
                x.grantedBy,
                c.givenOn(formatDateTime(x.createdAt, zone)),
              ].join(" · ")}
            >
              <Badge tone={x.supersededAt ? "neutral" : "info"}>
                {x.supersededAt ? c.superseded : c.extendedTo(formatDateTime(x.deadline, zone))}
              </Badge>
            </SettingsRow>
          ))}
          {cycle.status === "open" && (
            <SettingsDisclosure accent label={c.giveExtension}>
              <ActionForm action={extendAction} aria-label={c.grant} resetOnSuccess>
                <input type="hidden" name="cycleId" value={cycle.id} />
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
                <TextAreaField name="reason" label={adminCopy.common.reason} rows={2} required />
                <SubmitButton tone="secondary">{c.grant}</SubmitButton>
              </ActionForm>
            </SettingsDisclosure>
          )}
        </SettingsGroup>
      </div>
    </>
  );
}
