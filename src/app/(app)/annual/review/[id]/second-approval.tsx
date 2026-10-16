import { randomUUID } from "node:crypto";
import { ShieldCheck } from "lucide-react";
import { ActionForm, TextAreaField } from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { annualCopy } from "@/copy/annual";
import { secondDecideAction } from "../actions";

const t = annualCopy.second;

/**
 * The second approval of a large budget (FR-34, DRD 6.7): the first approval's amount is
 * shown above; here another accountant gives the second approval or refuses it with a
 * reason. Each form carries its own idempotency key, so a double click decides once.
 */
export function SecondApprovalPanel({ id, version }: { id: string; version: number }) {
  return (
    <section aria-labelledby="second-heading" className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck aria-hidden="true" className="size-5 text-info" />
        <h2 id="second-heading" className="text-lg font-semibold">
          {t.heading}
        </h2>
      </div>
      <ActionForm action={secondDecideAction} id="second-approve-form" aria-label={t.approve}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="version" value={version} />
        <input type="hidden" name="idempotencyKey" value={randomUUID()} />
        <input type="hidden" name="kind" value="approve" />
        <ConfirmDialog
          formId="second-approve-form"
          trigger={t.approve}
          triggerTone="primary"
          title={t.approveTitle}
          body={t.approveBody}
          confirmLabel={t.approve}
        />
      </ActionForm>
      <ActionForm
        action={secondDecideAction}
        id="second-refuse-form"
        aria-label={t.refuse}
        className="space-y-3 border-t border-border pt-4"
      >
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="version" value={version} />
        <input type="hidden" name="idempotencyKey" value={randomUUID()} />
        <input type="hidden" name="kind" value="refuse" />
        <TextAreaField name="note" label={t.reason} rows={2} required />
        <ConfirmDialog
          formId="second-refuse-form"
          trigger={t.refuse}
          triggerTone="danger"
          title={t.refuseTitle}
          body={t.refuseBody}
          confirmLabel={t.refuse}
          confirmTone="danger"
        />
      </ActionForm>
    </section>
  );
}
