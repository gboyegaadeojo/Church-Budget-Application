"use server";

import { AuthError } from "next-auth";
import { EmailCodeError, signIn, signOut } from "@/auth";
import { copy } from "@/copy/en-CA";
import { getDb } from "@/db";
import { normalizeCode, requestEmailCode } from "@/domain/users/email-sign-in";
import { fakeSignInEnabled } from "@/lib/auth-mode";
import { rememberDeniedEmail } from "@/lib/denied-email";
import { sendOutboxAfterResponse } from "@/lib/email";
import { trackQueuedEmails } from "@/lib/email/outbox";
import { requestIpHash } from "@/lib/request-ip";

const e = copy.signIn.email;

/** Only same-site paths, so a crafted link can't send people elsewhere after sign-in. */
function safeRedirect(value: FormDataEntryValue | null): string {
  const path = typeof value === "string" ? value : "/";
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}

export async function signInWithProvider(formData: FormData) {
  const provider = formData.get("provider");
  if (provider !== "google" && provider !== "planningcenter") return;
  await signIn(provider, { redirectTo: safeRedirect(formData.get("callbackUrl")) });
}

export async function signInFake(formData: FormData) {
  if (!fakeSignInEnabled()) return;
  await signIn("fake", {
    provider: formData.get("provider"),
    subject: formData.get("subject"),
    email: formData.get("email"),
    name: formData.get("name"),
    organizationId: formData.get("organizationId"),
    redirectTo: safeRedirect(formData.get("callbackUrl")),
  });
}

export async function signOutAction() {
  await rememberDeniedEmail(null);
  await signOut({ redirectTo: "/sign-in" });
}

// ---------------------------------------------------------------- Continue with email (FR-01b)

/** Where the email sign-in form is: asking for an address, or for the code sent to it. */
export type EmailCodeState =
  | { step: "email"; email?: string; error?: string }
  | { step: "code"; email: string; notice?: string; error?: string };

const text = (data: FormData, key: string) => {
  const v = data.get(key);
  return typeof v === "string" ? v : "";
};

const minutesUntil = (at: Date) => Math.max(1, Math.ceil((at.getTime() - Date.now()) / 60_000));

/**
 * Emails a code to an address on the allowlist. The answer is the same for any address
 * (AC-133). The email is sent straight after commit, not left for the 15-minute job.
 */
export async function requestEmailCodeAction(
  _: EmailCodeState,
  data: FormData,
): Promise<EmailCodeState> {
  const email = text(data, "email");
  // "Send a new code" stays on the code step, even when it's refused.
  const resend = data.get("resend") === "1";
  const fail = (error: string): EmailCodeState =>
    resend ? { step: "code", email, error } : { step: "email", email, error };
  const secret = process.env.AUTH_SECRET;
  if (!secret) return fail(e.unavailable);

  const deps = { now: new Date(), secret, requestIpHash: await requestIpHash() };
  const { result, ids } = await trackQueuedEmails(() =>
    getDb().transaction((tx) => requestEmailCode(tx, deps, { email })),
  );
  if (ids.length > 0) sendOutboxAfterResponse({ ids });
  if (result.ok) return { step: "code", email: result.email, notice: e.sent(result.email) };
  switch (result.reason) {
    case "invalid_email":
      return { step: "email", email, error: e.invalidEmail };
    case "disabled":
      return fail(e.disabled);
    case "too_many":
      return fail(e.tooMany(minutesUntil(result.retryAt)));
  }
}

/**
 * Signs in with the emailed code. Success, and a refusal by the access rules, redirect
 * (Home, or the access-denied screen); a wrong, expired or locked code comes back here.
 */
export async function verifyEmailCodeAction(
  _: EmailCodeState,
  data: FormData,
): Promise<EmailCodeState> {
  const email = text(data, "email");
  const code = text(data, "code");
  if (!normalizeCode(code)) return { step: "code", email, error: e.codeFormat };
  try {
    await signIn("email-code", { email, code, redirectTo: safeRedirect(data.get("callbackUrl")) });
  } catch (error) {
    // Next.js redirects are thrown too; only Auth.js errors are answered here.
    if (!(error instanceof AuthError)) throw error;
    if (!(error instanceof EmailCodeError))
      return { step: "code", email, error: copy.signIn.error };
    const r = error.result;
    switch (r.reason) {
      case "wrong":
        return { step: "code", email, error: e.wrong(r.triesLeft) };
      case "locked":
        return { step: "code", email, error: e.locked(minutesUntil(r.retryAt)) };
      case "expired":
        return { step: "code", email, error: e.expired };
      case "disabled":
        return { step: "email", email, error: e.disabled };
    }
  }
  return { step: "code", email };
}
