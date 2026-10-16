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
  provider: "planningcenter" | "email";
  subject: string;
  email: string;
  name: string;
  organizationId?: string;
};

/**
 * Sign-in (DRD 6.1): Continue with Planning Center, then the quieter Continue with email
 * for administrators who aren't in Planning Center. No Google (docs/decisions.md).
 */
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

      {showPco || showEmail ? (
        <div className="space-y-3">
          {showPco && (
            <ProviderButton provider="planningcenter" callbackUrl={callbackUrl}>
              <Users className="size-5" aria-hidden="true" />
              {s.continueWithPlanningCenter}
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
  provider: "planningcenter";
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
