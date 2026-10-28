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
import { cn } from "@/lib/cn";

const e = copy.signIn.email;

/** The main way in: filled, full width and tall, like the page's other sign-in button. */
const primaryClass =
  "flex min-h-[52px] w-full items-center justify-center gap-3 rounded-[14px] bg-fg px-5 text-[15px] font-semibold text-bg shadow-sm transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.99] motion-reduce:transition-none";
const fieldClass = "min-h-12 rounded-[12px] text-base";

/**
 * "Sign in with Church Center Email" (FR-01b, DRD 6.1): the main way in since most leaders only have a
 * Church Center login (docs/decisions.md 2026-10-23). The button opens an email field, then one 6-digit code field (autocomplete="one-time-code", paste-friendly).
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
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-describedby={`${id}-open-note`}
          className={primaryClass}
        >
          <Mail className="size-[18px]" aria-hidden="true" />
          {e.open}
        </button>
        <p id={`${id}-open-note`} className="text-center text-xs text-fg-muted">
          {e.openNote}
        </p>
      </div>
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
    <form action={formAction} aria-label={e.formLabel} noValidate className="space-y-4 pt-1">
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
              className={cn(inputClass, fieldClass)}
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
            className={buttonClass("primary", "min-h-12 w-full rounded-[12px] text-[15px]")}
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
              className={cn(inputClass, fieldClass, "tabular text-center text-xl tracking-[0.4em]")}
            />
          </div>
          {error}
          <button
            type="submit"
            name="intent"
            value="verify"
            disabled={pending}
            aria-busy={pending || undefined}
            className={buttonClass("primary", "min-h-12 w-full rounded-[12px] text-[15px]")}
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
