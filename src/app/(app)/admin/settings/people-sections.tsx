import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import {
  ActionForm,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge, EmptyState, Section } from "@/components/ui/display";
import { buttonClass } from "@/components/ui/styles";
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
    <Section title={a.heading} description={a.intro} id="accountants">
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
          <ul className="divide-y divide-border text-sm">
            {team.map((m) => (
              <li
                key={m.id}
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <span>
                  <span className="font-medium">{m.name}</span>
                  <span className="block break-all text-fg-muted">{m.email}</span>
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

/** FR-53: who can sign cheques. Removed signers stay listed and on past payments. */
export function SignersSection({ signers, today }: { signers: Signer[]; today: string }) {
  const isActive = (x: Signer) =>
    x.activeFrom <= today && (x.activeUntil === null || today < x.activeUntil);
  const activeCount = signers.filter(isActive).length;
  return (
    <Section title={g.heading} description={g.intro} id="signers">
      {activeCount < 2 && <Warning>{g.fewerThanTwo(activeCount)}</Warning>}
      {signers.length === 0 ? (
        <EmptyState>{g.empty}</EmptyState>
      ) : (
        <ul className="divide-y divide-border text-sm" aria-label={g.heading}>
          {signers.map((x) => (
            <SignerRow key={x.id} signer={x} active={isActive(x)} />
          ))}
        </ul>
      )}

      <ActionForm
        action={addSignerAction}
        aria-label={g.addHeading}
        className="border-t border-border pt-4"
        resetOnSuccess
      >
        <h3 className="text-sm font-semibold">{g.addHeading}</h3>
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
    </Section>
  );
}

function SignerRow({ signer, active }: { signer: Signer; active: boolean }) {
  const removeId = `remove-signer-${signer.id}`;
  return (
    <li className="space-y-3 py-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <span>
          <span className="font-medium">{signer.name}</span>
          {signer.email && <span className="block break-all text-fg-muted">{signer.email}</span>}
          <span className="block text-xs text-fg-muted">
            {`${g.columns.activeFrom}: ${formatDate(signer.activeFrom)}`}
          </span>
        </span>
        <Badge tone={active ? "success" : "neutral"}>
          {signer.activeUntil ? g.inactiveFrom(formatDate(signer.activeUntil)) : g.active}
        </Badge>
      </div>
      {signer.activeUntil === null && (
        <details className="rounded-control border border-border p-3">
          <summary className={buttonClass("ghost", "-m-1 cursor-pointer")}>
            {g.editLabel(signer.name)}
          </summary>
          <div className="mt-3 grid gap-6 lg:grid-cols-2">
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
              <TextField
                name="removeFrom"
                type="date"
                label={g.removeFrom}
                hint={g.removeFromHint}
              />
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
      )}
    </li>
  );
}
