"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Loader2, Mail } from "lucide-react";
import {
  requestEmailCodeAction,
  verifyEmailCodeAction,
  type EmailCodeState,
} from "@/app/actions/auth";
import { buttonClass, inputClass, linkClass } from "@/components/ui/styles";
import { copy } from "@/copy/en-CA";

const e = copy.signIn.email;

/**
 * "Continue with email" (FR-01b, DRD 6.1): a quieter text button that opens an email
 * field, then one 6-digit code field (autocomplete="one-time-code", paste-friendly).
 * The server decides every step; this only shows where it says the person is.
 */
export function EmailSignIn({ callbackUrl }: { callbackUrl: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: EmailCodeState, data: FormData): Promise<EmailCodeState> => {
      switch (data.get("intent")) {
        case "verify":
          return verifyEmailCodeAction(prev, data);
        case "change":
          return { step: "email", email: prev.email };
        default:
          return requestEmailCodeAction(prev, data);
      }
    },
    { step: "email" },
  );
  const id = useId();
  const codeRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // Move focus to the field the person needs next.
  useEffect(() => {
    if (!open) return;
    if (state.step === "code") codeRef.current?.focus();
    else emailRef.current?.focus();
  }, [open, state]);

  if (!open) {
    return (
      <p className="flex flex-wrap items-center justify-center gap-x-1 text-sm text-fg-muted">
        {e.prompt}
        <button type="button" onClick={() => setOpen(true)} className={buttonClass("ghost")}>
          <Mail className="size-4" aria-hidden="true" />
          {e.open}
        </button>
      </p>
    );
  }

  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const error = state.error ? (
    <p id={errorId} role="alert" className="flex items-start gap-2 text-sm text-danger">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {state.error}
    </p>
  ) : null;
  const spinner = pending && (
    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
  );

  return (
    <form
      action={formAction}
      aria-label={e.formLabel}
      noValidate
      className="space-y-4 rounded-control border border-border p-4"
    >
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      {state.step === "email" ? (
        <>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-email`} className="block text-sm font-medium">
              {e.emailLabel}
            </label>
            <input
              ref={emailRef}
              id={`${id}-email`}
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              defaultValue={state.email}
              required
              aria-invalid={state.error ? true : undefined}
              aria-describedby={[hintId, state.error && errorId].filter(Boolean).join(" ")}
              className={inputClass}
            />
            <p id={hintId} className="text-xs text-fg-muted">
              {e.emailHint}
            </p>
          </div>
          {error}
          <button
            type="submit"
            name="intent"
            value="request"
            disabled={pending}
            aria-busy={pending || undefined}
            className={buttonClass("primary", "w-full")}
          >
            {spinner}
            {e.sendCode}
          </button>
        </>
      ) : (
        <>
          <input type="hidden" name="email" value={state.email} />
          {/* Asking again from here is a resend: a refusal keeps this step on screen. */}
          <input type="hidden" name="resend" value="1" />
          {state.notice && (
            <p id={hintId} role="status" className="text-sm">
              {state.notice}
            </p>
          )}
          <div className="space-y-1.5">
            <label htmlFor={`${id}-code`} className="block text-sm font-medium">
              {e.codeLabel}
            </label>
            <input
              ref={codeRef}
              id={`${id}-code`}
              name="code"
              type="text"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={11}
              spellCheck={false}
              aria-invalid={state.error ? true : undefined}
              aria-describedby={
                [state.notice && hintId, state.error && errorId].filter(Boolean).join(" ") ||
                undefined
              }
              className={`${inputClass} tabular text-base tracking-widest`}
            />
          </div>
          {error}
          <button
            type="submit"
            name="intent"
            value="verify"
            disabled={pending}
            aria-busy={pending || undefined}
            className={buttonClass("primary", "w-full")}
          >
            {spinner}
            {e.signIn}
          </button>
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 text-sm">
            <button
              type="submit"
              name="intent"
              value="request"
              disabled={pending}
              className={linkClass}
            >
              {e.sendNewCode}
            </button>
            <button
              type="submit"
              name="intent"
              value="change"
              disabled={pending}
              className={linkClass}
            >
              {e.differentEmail}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
