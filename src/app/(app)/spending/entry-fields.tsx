import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/ui/action-form";
import { RevealOnError } from "@/components/ui/reveal-on-error";
import { spendingCopy } from "@/copy/spending";
import { ENTRY_TYPES, PAYMENT_METHODS } from "@/domain/spending/schema";
import { formatDate } from "@/lib/time-zone";

const r = spendingCopy.record;

export type EntryDefaults = {
  entryType?: string;
  spentOn?: string;
  payee?: string;
  description?: string;
  amount?: string;
  paymentMethod?: string;
  referenceNumber?: string;
  budgetLineItemId?: string;
  notes?: string;
  overspendNote?: string;
};

/**
 * The fields of a spending entry (FR-24), for recording and correcting. Warnings the
 * server raises (a duplicate, no approved budget, an overspend) appear with their box
 * only when asked for, and stay once shown.
 */
export function EntryFields({
  defaults = {},
  lines,
  period,
  canAllowOutsideYear,
}: {
  defaults?: EntryDefaults;
  lines: { id: string; name: string }[];
  period: { from: string; to: string };
  canAllowOutsideYear: boolean;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="entryType"
          label={r.type}
          defaultValue={defaults.entryType ?? "expense"}
          options={ENTRY_TYPES.map((t) => ({ value: t, label: spendingCopy.types[t] }))}
          required
        />
        <TextField
          name="spentOn"
          type="date"
          label={r.spentOn}
          hint={r.spentOnHint(formatDate(period.from), formatDate(period.to))}
          defaultValue={defaults.spentOn}
          required
        />
        <TextField name="payee" label={r.payee} defaultValue={defaults.payee} required />
        <TextField
          name="amount"
          label={r.amount}
          hint={r.amountHint}
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={defaults.amount}
          required
        />
      </div>
      <TextField
        name="description"
        label={r.description}
        defaultValue={defaults.description}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="paymentMethod"
          label={r.method}
          defaultValue={defaults.paymentMethod ?? ""}
          placeholder={r.method}
          options={PAYMENT_METHODS.map((m) => ({ value: m, label: spendingCopy.methods[m] }))}
          required
        />
        <TextField
          name="referenceNumber"
          label={r.reference}
          defaultValue={defaults.referenceNumber}
        />
      </div>
      {lines.length > 0 && (
        <SelectField
          name="budgetLineItemId"
          label={r.line}
          defaultValue={defaults.budgetLineItemId ?? ""}
          options={[
            { value: "", label: r.general },
            ...lines.map((l) => ({ value: l.id, label: l.name })),
          ]}
        />
      )}
      <TextAreaField name="notes" label={r.notes} defaultValue={defaults.notes} rows={2} />
      <RevealOnError name="overspendNote" show={!!defaults.overspendNote}>
        <TextAreaField
          name="overspendNote"
          label={r.overspendNote}
          defaultValue={defaults.overspendNote}
          rows={2}
          required
        />
      </RevealOnError>
      <RevealOnError name="confirmDuplicate">
        <CheckboxField name="confirmDuplicate" label={r.confirmDuplicate} />
      </RevealOnError>
      <RevealOnError name="confirmUnbudgeted">
        <CheckboxField name="confirmUnbudgeted" label={r.confirmUnbudgeted} />
      </RevealOnError>
      {canAllowOutsideYear && (
        <RevealOnError name="spentOn">
          <CheckboxField name="allowOutsideYear" label={r.allowOutsideYear} />
        </RevealOnError>
      )}
    </>
  );
}
