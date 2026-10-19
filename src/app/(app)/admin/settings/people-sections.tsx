import Link from "next/link";
import { AlertTriangle, Calculator, ChevronDown, PenLine, Plus } from "lucide-react";
import {
  ActionForm,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge, EmptyState, Section } from "@/components/ui/display";
import { adminCopy } from "@/copy/admin";
import type { Signer } from "@/domain/signers/service";
import type { AccountantMember } from "@/domain/users/admin-queries";
import { formatDate } from "@/lib/time-zone";
import {
  addSignerAction,
  editSignerAction,
  primaryAccountantAction,
  removeSignerAction,
} from "./actions";

const a = adminCopy.settings.accountants;
const g = adminCopy.settings.signers;

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-control border border-warning p-3 text-sm text-warning">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** FR-33: one Primary accountant; everyone else with an accountant role is a backup. */
export function AccountantsSection({
  team,
  primaryId,
  versions,
}: {
  team: AccountantMember[];
  primaryId: string;
  versions: Record<string, number>;
}) {
  const primary = team.find((m) => m.id === primaryId);
  const candidates = team.filter((m) => m.accountant);
  return (
    <Section title={a.heading} description={a.intro} id="accountants" icon={Calculator} tone="blue">
      {team.length === 0 ? (
        <EmptyState>
          {a.empty}{" "}
          <Link href="/admin/users" className="font-medium underline">
            {a.usersLink}
          </Link>
        </EmptyState>
      ) : (
        <>
          {!primary && <Warning>{a.noPrimary}</Warning>}
          <ul className="divide-y divide-border overflow-hidden rounded-[12px] border border-border text-sm">
            {team.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-fg-muted"
                >
                  {initials(m.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.name}</span>
                  <span className="block truncate text-xs text-fg-muted">{m.email}</span>
                </span>
                <Badge tone={m.id === primaryId ? "info" : "neutral"}>
                  {m.id === primaryId ? a.primaryBadge : a.backupBadge}
                </Badge>
              </li>
            ))}
          </ul>
          {candidates.length > 0 && (
            <ActionForm
              action={primaryAccountantAction}
              aria-label={a.primary}
              className="border-t border-border pt-4"
            >
              <input type="hidden" name="versions" value={JSON.stringify(versions)} />
              <div className="max-w-md">
                <SelectField
                  name="userId"
                  label={a.primary}
                  placeholder={a.choose}
                  defaultValue={primary ? primary.id : ""}
                  options={candidates.map((m) => ({ value: m.id, label: m.name }))}
                  required
                />
              </div>
              <SubmitButton tone="secondary">{a.save}</SubmitButton>
            </ActionForm>
          )}
        </>
      )}
    </Section>
  );
}

/**
 * FR-53: who can sign cheques, as one slim row each so a long list stays tidy: active
 * signers first, removed ones muted below (they stay on past payments). A row opens to
 * edit or remove that signer; adding one is folded away until needed.
 */
export function SignersSection({ signers, today }: { signers: Signer[]; today: string }) {
  const isActive = (x: Signer) =>
    x.activeFrom <= today && (x.activeUntil === null || today < x.activeUntil);
  const byName = (a: Signer, b: Signer) => a.name.localeCompare(b.name, "en-CA");
  const current = signers.filter((x) => x.activeUntil === null).sort(byName);
  const removed = signers.filter((x) => x.activeUntil !== null).sort(byName);
  const activeCount = signers.filter(isActive).length;
  return (
    <Section
      title={g.heading}
      description={g.intro}
      id="signers"
      icon={PenLine}
      tone="green"
      actions={
        signers.length > 0 ? (
          <span className="text-sm text-fg-muted">{g.count(activeCount, removed.length)}</span>
        ) : undefined
      }
    >
      {activeCount < 2 && <Warning>{g.fewerThanTwo(activeCount)}</Warning>}
      {signers.length === 0 ? (
        <EmptyState>{g.empty}</EmptyState>
      ) : (
        <ul
          className="divide-y divide-border overflow-hidden rounded-[12px] border border-border text-sm"
          aria-label={g.heading}
        >
          {current.map((x) => (
            <SignerRow key={x.id} signer={x} active={isActive(x)} />
          ))}
          {removed.map((x) => (
            <SignerRow key={x.id} signer={x} active={false} />
          ))}
        </ul>
      )}

      <details className="group rounded-[12px] border border-dashed border-border">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium text-accent [&::-webkit-details-marker]:hidden">
          <Plus className="size-4" aria-hidden="true" />
          {g.addHeading}
        </summary>
        <ActionForm
          action={addSignerAction}
          aria-label={g.addHeading}
          className="border-t border-border p-4"
          resetOnSuccess
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField name="name" label={g.name} autoComplete="off" required />
            <TextField name="email" type="email" label={g.email} autoComplete="off" />
            <TextField
              name="activeFrom"
              type="date"
              label={g.activeFromLabel}
              hint={g.activeFromHint}
            />
          </div>
          <SubmitButton tone="secondary">{g.add}</SubmitButton>
        </ActionForm>
      </details>
    </Section>
  );
}

/** "Pat Treasurer" → "PT". */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

function SignerSummary({ signer, active }: { signer: Signer; active: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-fg-muted"
      >
        {initials(signer.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{signer.name}</span>
        <span className="block truncate text-xs text-fg-muted">
          {[signer.email, g.since(formatDate(signer.activeFrom))].filter(Boolean).join(" · ")}
        </span>
      </span>
      <Badge tone={active ? "success" : "neutral"}>
        {signer.activeUntil ? g.inactiveFrom(formatDate(signer.activeUntil)) : g.active}
      </Badge>
    </>
  );
}

function SignerRow({ signer, active }: { signer: Signer; active: boolean }) {
  const removeId = `remove-signer-${signer.id}`;
  if (signer.activeUntil !== null) {
    return (
      <li className="flex items-center gap-3 bg-surface-2 px-4 py-3">
        <SignerSummary signer={signer} active={active} />
      </li>
    );
  }
  return (
    <li>
      <details className="group">
        <summary
          aria-label={g.editLabel(signer.name)}
          className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-2 motion-reduce:transition-none [&::-webkit-details-marker]:hidden"
        >
          <SignerSummary signer={signer} active={active} />
          <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-accent">
            {g.editShort}
            <ChevronDown
              className="size-4 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </span>
        </summary>
        <div className="grid gap-6 border-t border-border bg-surface-2/40 p-4 lg:grid-cols-2">
          <ActionForm action={editSignerAction} aria-label={g.editLabel(signer.name)}>
            <input type="hidden" name="id" value={signer.id} />
            <input type="hidden" name="version" value={signer.version} />
            <TextField name="name" label={g.name} defaultValue={signer.name} required />
            <TextField
              name="email"
              type="email"
              label={g.email}
              defaultValue={signer.email ?? ""}
            />
            <SubmitButton tone="secondary">{g.edit}</SubmitButton>
          </ActionForm>
          <ActionForm action={removeSignerAction} id={removeId} aria-label={g.remove}>
            <input type="hidden" name="id" value={signer.id} />
            <input type="hidden" name="version" value={signer.version} />
            <TextField name="removeFrom" type="date" label={g.removeFrom} hint={g.removeFromHint} />
            <TextAreaField name="reason" label={g.removeReason} rows={2} />
            <ConfirmDialog
              formId={removeId}
              trigger={g.remove}
              triggerTone="danger"
              title={g.removeTitle(signer.name)}
              body={g.removeBody}
              confirmLabel={g.remove}
              confirmTone="danger"
            />
          </ActionForm>
        </div>
      </details>
    </li>
  );
}
