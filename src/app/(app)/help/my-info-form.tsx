"use client";

import { ActionForm, SelectField, SubmitButton, TextAreaField } from "@/components/ui/action-form";
import { helpCopy } from "@/copy/help";
import { privacyRequestAction } from "./actions";

const m = helpCopy.myInfo;

/** "See or correct my information" (FR-36); cleared once it's sent. */
export function MyInfoForm() {
  return (
    <ActionForm action={privacyRequestAction} aria-label={m.heading} resetOnSuccess>
      <SelectField
        name="kind"
        label={m.kind}
        required
        defaultValue="see"
        options={Object.entries(m.kinds).map(([value, label]) => ({ value, label }))}
      />
      <TextAreaField name="details" label={m.details} hint={m.detailsHint} rows={4} />
      <SubmitButton>{m.send}</SubmitButton>
    </ActionForm>
  );
}
