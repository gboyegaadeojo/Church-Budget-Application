"use client";

import { createContext, startTransition, useActionState, useContext, useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { adminCopy } from "@/copy/admin";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/lib/action-state";
import { buttonClass, inputClass, textareaClass, type ButtonTone } from "./styles";

/**
 * A form posting to a server action (useActionState). The server's verdict is the only
 * truth: success and errors come back from the action, never guessed by the browser
 * (DRD 11). Field errors appear under their fields; the summary is announced politely
 * for success and assertively for errors (DRD 7.3).
 *
 * The form submits through onSubmit rather than as a native form action, because React
 * resets a form after a form action even when the server answers with an error, which
 * would wipe what the person typed (DRD 11). It is reset only on success, when asked.
 */

const FormErrors = createContext<Record<string, string>>({});
/** Whether this form's action is running, for SubmitButton (useFormStatus only sees native form actions). */
const FormPending = createContext(false);

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function ActionForm({
  action,
  children,
  id,
  className,
  resetOnSuccess = false,
  "aria-label": ariaLabel,
}: {
  action: Action;
  children: React.ReactNode;
  id?: string;
  className?: string;
  resetOnSuccess?: boolean;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (previous: ActionState, data: FormData) => {
      const next = await action(previous, data);
      // Cleared before the success message shows, so nothing typed after it is lost.
      if (next.status === "success" && resetOnSuccess) ref.current?.reset();
      return next;
    },
    { status: "idle" } as ActionState,
  );

  return (
    <form
      ref={ref}
      id={id}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        // Keeps the clicked button's name and value, as a normal submission would.
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const data = new FormData(event.currentTarget, submitter);
        startTransition(() => formAction(data));
      }}
      className={cn("space-y-4", className)}
      aria-label={ariaLabel}
      noValidate
    >
      <FormPending.Provider value={pending}>
        <FormErrors.Provider value={state.status === "error" ? (state.fieldErrors ?? {}) : {}}>
          {children}
        </FormErrors.Provider>
      </FormPending.Provider>
      <FormMessage state={state} />
    </form>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (state.status === "idle" || !state.message) {
    return <div role="status" className="sr-only" />;
  }
  const ok = state.status === "success";
  const Icon = ok ? CheckCircle2 : AlertCircle;
  return (
    <div
      role={ok ? "status" : "alert"}
      className={cn(
        "flex items-start gap-2 rounded-control border p-3 text-sm",
        ok ? "border-success text-success" : "border-danger text-danger",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        {state.message}
        {state.latestHref && (
          <>
            {" "}
            <a href={state.latestHref} className="font-medium underline">
              {adminCopy.common.viewLatest}
            </a>
          </>
        )}
      </span>
    </div>
  );
}

export function SubmitButton({
  children,
  tone = "primary",
  className,
  name,
  value,
  formAction,
}: {
  children: React.ReactNode;
  tone?: ButtonTone;
  className?: string;
  name?: string;
  value?: string;
  formAction?: (formData: FormData) => void;
}) {
  const native = useFormStatus().pending;
  const pending = useContext(FormPending) || native;
  return (
    <button
      type="submit"
      name={name}
      value={value}
      formAction={formAction}
      disabled={pending}
      aria-busy={pending || undefined}
      className={buttonClass(tone, className)}
    >
      {pending && (
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}

function useFieldIds(name: string) {
  const id = useId();
  const error = useContext(FormErrors)[name];
  return { inputId: `${id}-input`, hintId: `${id}-hint`, errorId: `${id}-error`, error };
}

function Describe({
  hint,
  hintId,
  error,
  errorId,
}: {
  hint?: string;
  hintId: string;
  error?: string;
  errorId: string;
}) {
  return (
    <>
      {hint && (
        <p id={hintId} className="text-xs text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}

type FieldProps = {
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string;
  required?: boolean;
};

export function TextField({
  type = "text",
  autoComplete,
  inputMode,
  placeholder,
  ...props
}: FieldProps & {
  type?: "text" | "email" | "date" | "datetime-local" | "number" | "search";
  autoComplete?: string;
  inputMode?: "decimal" | "numeric" | "email" | "text";
  placeholder?: string;
}) {
  const { inputId, hintId, errorId, error } = useFieldIds(props.name);
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium">
        {props.label}
        {!props.required && (
          <span className="font-normal text-fg-muted"> {adminCopy.common.optional}</span>
        )}
      </label>
      <input
        id={inputId}
        name={props.name}
        type={type}
        defaultValue={props.defaultValue}
        required={props.required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [props.hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined
        }
        className={inputClass}
      />
      <Describe hint={props.hint} hintId={hintId} error={error} errorId={errorId} />
    </div>
  );
}

/** The server's error for one field of the surrounding ActionForm, for custom fields. */
export function useFieldError(name: string): string | undefined {
  return useContext(FormErrors)[name];
}

/**
 * A file picker, used only for the administrator's logo and icon (FR-30); every other
 * form refuses files (AC-25). `accept` only guides the picker; the server checks the bytes.
 */
export function FileField({ accept, ...props }: FieldProps & { accept: string }) {
  const { inputId, hintId, errorId, error } = useFieldIds(props.name);
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium">
        {props.label}
      </label>
      <input
        id={inputId}
        name={props.name}
        type="file"
        accept={accept}
        required={props.required}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [props.hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined
        }
        className="block w-full text-sm text-fg-muted file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-control file:border file:border-border-strong file:bg-surface file:px-4 file:text-sm file:font-medium file:text-fg hover:file:bg-surface-hover lg:file:min-h-9"
      />
      <Describe hint={props.hint} hintId={hintId} error={error} errorId={errorId} />
    </div>
  );
}

export function TextAreaField({ rows = 4, ...props }: FieldProps & { rows?: number }) {
  const { inputId, hintId, errorId, error } = useFieldIds(props.name);
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium">
        {props.label}
        {!props.required && (
          <span className="font-normal text-fg-muted"> {adminCopy.common.optional}</span>
        )}
      </label>
      <textarea
        id={inputId}
        name={props.name}
        rows={rows}
        defaultValue={props.defaultValue}
        required={props.required}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [props.hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined
        }
        className={textareaClass}
      />
      <Describe hint={props.hint} hintId={hintId} error={error} errorId={errorId} />
    </div>
  );
}

export function SelectField({
  options,
  placeholder,
  ...props
}: FieldProps & { options: { value: string; label: string }[]; placeholder?: string }) {
  const { inputId, hintId, errorId, error } = useFieldIds(props.name);
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium">
        {props.label}
      </label>
      <select
        id={inputId}
        name={props.name}
        defaultValue={props.defaultValue ?? ""}
        required={props.required}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [props.hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined
        }
        className={inputClass}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Describe hint={props.hint} hintId={hintId} error={error} errorId={errorId} />
    </div>
  );
}

export function CheckboxField({
  name,
  label,
  hint,
  defaultChecked,
  value = "on",
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
  value?: string;
}) {
  const { inputId, hintId, errorId, error } = useFieldIds(name);
  return (
    <div className="space-y-1">
      <div className="flex items-start gap-3">
        <input
          id={inputId}
          type="checkbox"
          name={name}
          value={value}
          defaultChecked={defaultChecked}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined
          }
          className="mt-0.5 size-5 shrink-0 accent-accent"
        />
        <label htmlFor={inputId} className="text-sm">
          {label}
        </label>
      </div>
      <div className="pl-8">
        <Describe hint={hint} hintId={hintId} error={error} errorId={errorId} />
      </div>
    </div>
  );
}

/** A labelled group of checkboxes sharing one name (e.g. roles). */
export function CheckboxGroup({
  name,
  legend,
  hint,
  options,
  defaultValues = [],
}: {
  name: string;
  legend: string;
  hint?: string;
  options: { value: string; label: string }[];
  defaultValues?: readonly string[];
}) {
  const { hintId, errorId, error } = useFieldIds(name);
  const groupId = useId();
  return (
    <fieldset
      className="space-y-2"
      aria-describedby={[hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined}
    >
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <div key={o.value} className="flex items-center gap-3">
            <input
              id={`${groupId}-${o.value}`}
              type="checkbox"
              name={name}
              value={o.value}
              defaultChecked={defaultValues.includes(o.value)}
              className="size-5 shrink-0 accent-accent"
            />
            <label htmlFor={`${groupId}-${o.value}`} className="text-sm">
              {o.label}
            </label>
          </div>
        ))}
      </div>
      <Describe hint={hint} hintId={hintId} error={error} errorId={errorId} />
    </fieldset>
  );
}
