"use client";

import { startTransition, useActionState, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import {
  ActionForm,
  CheckboxField,
  FormMessage,
  SelectField,
  TextAreaField,
  TextField,
  SubmitButton,
} from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { buttonClass, inputClass } from "@/components/ui/styles";
import { SettingsCell, SettingsGroup } from "@/components/ui/grouped-list";
import { adminCopy } from "@/copy/admin";
import {
  signInSettingsAction,
  taxRateAction,
  testPersonAction,
  type TestPersonState,
} from "./actions";

const s = adminCopy.settings;

/** Sales tax (FR-07a): the new rate is confirmed in a dialog before it's saved. */
export function TaxRateForm({
  percent,
  versions,
}: {
  percent: string;
  versions: Record<string, number>;
}) {
  const [typed, setTyped] = useState(percent);
  const formId = "settings-tax";
  const shown = typed.trim().replace(/%$/, "").trim();
  return (
    <ActionForm action={taxRateAction} id={formId} aria-label={s.taxHeading}>
      <input type="hidden" name="versions" value={JSON.stringify(versions)} />
      {/* Reads the typed rate so the confirmation names it. */}
      <div
        className="max-w-xs"
        onInput={(e) => {
          const target = e.target as unknown as HTMLInputElement;
          if (target.name === "percent") setTyped(target.value);
        }}
      >
        <TextField
          name="percent"
          label={s.taxRate}
          defaultValue={percent}
          inputMode="decimal"
          autoComplete="off"
          required
        />
      </div>
      <ConfirmDialog
        formId={formId}
        trigger={s.taxSave}
        triggerTone="primary"
        title={s.taxConfirmTitle(`${shown}%`)}
        body={s.taxConfirmBody}
        confirmLabel={s.taxSave}
      />
    </ActionForm>
  );
}

export type SignInFormValues = {
  adminContactEmail: string;
  fieldName: string;
  acceptedValues: string[];
  requireForRequesters: boolean;
  requireForStaff: boolean;
  departmentFieldName: string;
  departmentMode: "off" | "suggest" | "restrict";
  planningCenterEnabled: boolean;
  emailEnabled: boolean;
};

/**
 * Sign-in and Planning Center (FR-01a). "Test a person" sends this same form's values to
 * a different action, so it checks the field and values as typed, before they're saved.
 */
export function SignInSettingsForm({
  values,
  versions,
  fields,
}: {
  values: SignInFormValues;
  versions: Record<string, number>;
  /** Planning Center custom fields for the picker; null when they can't be listed. */
  fields: { name: string; dataType: string }[] | null;
}) {
  const [testState, testAction, testing] = useActionState(testPersonAction, {
    status: "idle",
  } as TestPersonState);
  const queryError = testState.fieldErrors?.query;
  /**
   * Sends the form's current values to the test action outside a form submission, so
   * React doesn't reset the form afterwards and unsaved changes stay on screen.
   */
  const runTest = (from: HTMLElement) => {
    const formElement = from.closest("form");
    if (formElement) startTransition(() => testAction(new FormData(formElement)));
  };
  const fieldOptions = fields?.map((f) => ({ value: f.name, label: f.name })) ?? [];
  const hasCurrent = fieldOptions.some((o) => o.value === values.fieldName);
  if (fields && !hasCurrent) {
    fieldOptions.unshift({ value: values.fieldName, label: values.fieldName });
  }
  const [chosenField, setChosenField] = useState(values.fieldName);
  const fieldType = fields?.find((f) => f.name === chosenField)?.dataType;

  return (
    <ActionForm action={signInSettingsAction} aria-label={s.accessHeading} className="space-y-8">
      <input type="hidden" name="versions" value={JSON.stringify(versions)} />

      <SettingsGroup title={s.groups.methods} id="sign-in-methods">
        <SettingsCell>
          <CheckboxField
            name="planningCenterEnabled"
            label={s.allowPlanningCenter}
            defaultChecked={values.planningCenterEnabled}
          />
          <CheckboxField
            name="emailEnabled"
            label={s.allowEmail}
            hint={s.allowEmailHint}
            defaultChecked={values.emailEnabled}
          />
        </SettingsCell>
        <SettingsCell>
          <TextField
            name="adminContactEmail"
            type="email"
            label={s.contactEmail}
            hint={s.contactEmailHint}
            defaultValue={values.adminContactEmail}
            autoComplete="off"
          />
        </SettingsCell>
      </SettingsGroup>

      <SettingsGroup title={s.groups.leaderCheck} id="leader-check">
        <SettingsCell>
          <div
            onChange={(e) => {
              const target = e.target as unknown as HTMLSelectElement;
              if (target.name === "fieldName") setChosenField(target.value);
            }}
          >
            {fields ? (
              <SelectField
                name="fieldName"
                label={s.fieldName}
                hint={fieldType ? `${s.fieldNameHint} ${s.fieldType(fieldType)}` : s.fieldNameHint}
                defaultValue={values.fieldName}
                options={fieldOptions}
                required
              />
            ) : (
              <TextField
                name="fieldName"
                label={s.fieldName}
                hint={s.fieldNameHint}
                defaultValue={values.fieldName}
                autoComplete="off"
                required
              />
            )}
          </div>
          <TextAreaField
            name="acceptedValues"
            label={s.acceptedValues}
            hint={s.acceptedValuesHint}
            defaultValue={values.acceptedValues.join("\n")}
            rows={2}
            required
          />
        </SettingsCell>
        <SettingsCell>
          <CheckboxField
            name="requireForRequesters"
            label={s.requireRequesters}
            defaultChecked={values.requireForRequesters}
          />
          <CheckboxField
            name="requireForStaff"
            label={s.requireStaff}
            defaultChecked={values.requireForStaff}
          />
        </SettingsCell>
      </SettingsGroup>

      <SettingsGroup title={s.testHeading} id="test-person" footer={s.testHint}>
        <SettingsCell>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <label htmlFor="settings-test-query" className="block text-sm font-medium">
                {s.testQuery}
              </label>
              <input
                id="settings-test-query"
                name="query"
                type="search"
                autoComplete="off"
                aria-invalid={queryError ? true : undefined}
                aria-describedby={queryError ? "settings-test-query-error" : undefined}
                className={inputClass}
                onKeyDown={(e) => {
                  // Enter tests the person; it must not save the settings.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runTest(e.currentTarget);
                  }
                }}
              />
            </div>
            <button
              type="button"
              onClick={(e) => runTest(e.currentTarget)}
              disabled={testing}
              aria-busy={testing || undefined}
              className={buttonClass("secondary")}
            >
              {testing && (
                <Loader2
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
              {s.test}
            </button>
          </div>
          {queryError && (
            <p id="settings-test-query-error" className="text-sm text-danger">
              {queryError}
            </p>
          )}
          <FormMessage state={testState} />
          {testState.results && testState.results.length > 0 && (
            <ul className="divide-y divide-border text-sm" aria-label={s.testHeading}>
              {testState.results.map(({ person, check }) => (
                <li
                  key={person.id}
                  className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <span>
                    <span className="font-medium">{person.name}</span>
                    {person.emails[0] && (
                      <span className="block text-fg-muted">{person.emails[0]}</span>
                    )}
                  </span>
                  <TestVerdict check={check} />
                </li>
              ))}
            </ul>
          )}
        </SettingsCell>
      </SettingsGroup>

      <SettingsGroup title={s.ministryHeading} id="ministry-department" footer={s.ministryIntro}>
        <SettingsCell>
          {fields ? (
            <SelectField
              name="departmentFieldName"
              label={s.ministryField}
              hint={s.ministryFieldHint}
              defaultValue={values.departmentFieldName}
              options={withCurrent(fields, values.departmentFieldName)}
              required
            />
          ) : (
            <TextField
              name="departmentFieldName"
              label={s.ministryField}
              hint={s.ministryFieldHint}
              defaultValue={values.departmentFieldName}
              autoComplete="off"
              required
            />
          )}
          <SelectField
            name="departmentMode"
            label={s.ministryMode}
            hint={s.ministryModeHint}
            defaultValue={values.departmentMode}
            options={(["off", "suggest", "restrict"] as const).map((mode) => ({
              value: mode,
              label: s.ministryModes[mode],
            }))}
            required
          />
        </SettingsCell>
      </SettingsGroup>

      <SubmitButton>{s.pcoSave}</SubmitButton>
    </ActionForm>
  );
}

function TestVerdict({
  check,
}: {
  check: NonNullable<TestPersonState["results"]>[number]["check"];
}) {
  if (check.status === "leader" || check.status === "not_leader") {
    const pass = check.status === "leader";
    const Icon = pass ? CheckCircle2 : XCircle;
    return (
      <span className={pass ? "text-success" : "text-danger"}>
        <Icon className="mr-1 inline size-4 align-[-3px]" aria-hidden="true" />
        <span className="font-medium">{pass ? s.testPass : s.testFail}</span>
        <span className="block text-xs text-fg-muted">{s.testValue(check.fieldValue)}</span>
      </span>
    );
  }
  const reason = check.status === "unavailable" ? check.reason : check.status;
  return (
    <span className="text-warning">
      <XCircle className="mr-1 inline size-4 align-[-3px]" aria-hidden="true" />
      {s.testUnavailable(reason)}
    </span>
  );
}

/** Planning Center's fields as options, keeping the saved one even if it's gone. */
function withCurrent(fields: { name: string }[], current: string) {
  const options = fields.map((f) => ({ value: f.name, label: f.name }));
  return options.some((o) => o.value === current)
    ? options
    : [{ value: current, label: current }, ...options];
}
