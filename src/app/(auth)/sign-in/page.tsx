import { readFileSync } from "node:fs";
import path from "node:path";
import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AlertCircle, Users } from "lucide-react";
import { signInFake, signInWithProvider } from "@/app/actions/auth";
import { auth } from "@/auth";
import { copy } from "@/copy/en-CA";
import { getDb } from "@/db";
import { getSignInSettings } from "@/domain/settings";
import { fakeSignInEnabled } from "@/lib/auth-mode";
import { getEmailSender } from "@/lib/email";
import { EmailSignIn } from "./email-sign-in";

const s = copy.signIn;

export const metadata: Metadata = { title: s.title };

type FakeIdentity = {
  label: string;
  provider: "google" | "planningcenter";
  subject: string;
  email: string;
  name: string;
  organizationId?: string;
};

/** Sign-in (DRD 6.1): Planning Center and Google, equal size and stacked, then email. */
export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{s.heading}</h1>
        <p className="text-sm text-fg-muted">{s.description}</p>
      </div>
      <Suspense fallback={<ButtonsSkeleton />}>
        <SignInOptions searchParams={searchParams} />
      </Suspense>
      <p className="text-xs text-fg-muted">{s.privacyNote}</p>
    </div>
  );
}

async function SignInOptions({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  // Request-time first: Auth.js uses crypto before it reads cookies (Cache Components).
  await connection();
  const session = await auth();
  if (session?.user?.id) redirect("/");

  const params = await searchParams;
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : "/";
  const failed = typeof params.error === "string";
  const settings = await getSignInSettings(getDb());
  const showPco = settings.planningCenterEnabled && !!process.env.PCO_CLIENT_ID;
  const showGoogle = settings.googleEnabled && !!process.env.GOOGLE_CLIENT_ID;
  // Codes need a working sender; without one they would wait unsent in the outbox.
  const showEmail = settings.emailEnabled && getEmailSender() !== null;
  const fake = fakeSignInEnabled();

  return (
    <div className="space-y-6">
      {failed && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-control border border-danger p-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {s.error}
        </p>
      )}

      {showPco || showGoogle || showEmail ? (
        <div className="space-y-3">
          {showPco && (
            <ProviderButton provider="planningcenter" callbackUrl={callbackUrl}>
              <Users className="size-5" aria-hidden="true" />
              {s.continueWithPlanningCenter}
            </ProviderButton>
          )}
          {showGoogle && (
            <ProviderButton provider="google" callbackUrl={callbackUrl}>
              <GoogleMark />
              {s.continueWithGoogle}
            </ProviderButton>
          )}
          {showEmail && <EmailSignIn callbackUrl={callbackUrl} />}
        </div>
      ) : (
        !fake && <p className="rounded-control bg-surface-2 p-3 text-sm">{s.notConfigured}</p>
      )}

      <p className="text-sm text-fg-muted">{s.leaderNote}</p>

      <section aria-labelledby="access-heading" className="space-y-2 text-sm">
        <h2 id="access-heading" className="font-semibold">
          {s.accessHeading}
        </h2>
        <p className="text-fg-muted">{s.accessLeaders}</p>
        <p className="text-fg-muted">{s.accessStaff}</p>
        {settings.adminContactEmail && (
          <p className="text-fg-muted">{s.contact(settings.adminContactEmail)}</p>
        )}
      </section>

      {fake && <FakeSignIn callbackUrl={callbackUrl} />}
    </div>
  );
}

const buttonClass =
  "flex min-h-12 w-full items-center justify-center gap-3 rounded-control border border-border-strong bg-surface px-4 text-sm font-medium transition-colors duration-fast hover:bg-surface-hover";

function ProviderButton({
  provider,
  callbackUrl,
  children,
}: {
  provider: "google" | "planningcenter";
  callbackUrl: string;
  children: React.ReactNode;
}) {
  return (
    <form action={signInWithProvider}>
      <input type="hidden" name="provider" value={provider} />
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <button type="submit" className={buttonClass}>
        {children}
      </button>
    </form>
  );
}

function FakeSignIn({ callbackUrl }: { callbackUrl: string }) {
  const file = path.resolve(process.cwd(), "tests/fixtures/fake-identities.json");
  const identities = JSON.parse(readFileSync(file, "utf8")) as FakeIdentity[];
  return (
    <section
      aria-labelledby="fake-heading"
      className="space-y-3 rounded-control border border-dashed border-warning p-4"
    >
      <h2 id="fake-heading" className="text-sm font-semibold">
        {s.fakeHeading}
      </h2>
      <p className="text-xs text-fg-muted">{s.fakeNote}</p>
      {identities.map((identity) => (
        <form key={identity.subject} action={signInFake}>
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          {(["provider", "subject", "email", "name", "organizationId"] as const).map((key) => (
            <input key={key} type="hidden" name={key} value={identity[key] ?? ""} />
          ))}
          <button type="submit" className={`${buttonClass} min-h-10 justify-start text-left`}>
            {s.fakeAs(identity.label)}
          </button>
        </form>
      ))}
    </section>
  );
}

/** Google's "G" mark, as its sign-in branding guidelines ask. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function ButtonsSkeleton() {
  return (
    <div aria-busy="true" className="space-y-3">
      <span className="sr-only" role="status">
        {copy.app.loading}
      </span>
      <div className="h-12 animate-pulse rounded-control bg-surface-2" />
      <div className="h-12 animate-pulse rounded-control bg-surface-2" />
    </div>
  );
}
