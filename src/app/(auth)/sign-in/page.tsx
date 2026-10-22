import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AlertCircle, ArrowRight, ChevronRight, Users } from "lucide-react";
import { signInFake, signInWithProvider } from "@/app/actions/auth";
import { auth } from "@/auth";
import { DemoBanner } from "@/components/app-shell/demo-banner";
import { copy } from "@/copy/en-CA";
import { getDb } from "@/db";
import { getSignInSettings } from "@/domain/settings";
import { demoMode, fakeSignInEnabled } from "@/lib/auth-mode";
import { FAKE_IDENTITIES, isDemoDatabase } from "@/lib/demo";
import { getEmailSender } from "@/lib/email";
import { EmailSignIn } from "./email-sign-in";

const s = copy.signIn;

export const metadata: Metadata = { title: s.title };

/**
 * Sign-in (DRD 6.1, redesigned 2026-10-22): one clear Continue with Planning Center, then
 * Continue with email for people who aren't in Planning Center. Who can get in, and the
 * privacy note, stay one tap away so the page reads at a glance. No Google (docs/decisions.md).
 */
export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <div className="space-y-8">
      <DemoBanner className="-mx-6 -mt-6 rounded-t-[24px] sm:-mx-9 sm:-mt-9" />
      <div className="space-y-2 text-center">
        <h1 className="text-[26px] leading-tight sm:text-[28px] font-semibold tracking-[-0.02em]">
          {s.heading}
        </h1>
        <p className="text-[15px] leading-relaxed text-fg-muted">{s.description}</p>
      </div>
      <Suspense fallback={<ButtonsSkeleton />}>
        <SignInOptions searchParams={searchParams} />
      </Suspense>
      <p className="text-center text-xs leading-relaxed text-fg-muted">
        {s.privacyNote}{" "}
        <Link href="/privacy" className="font-medium text-fg underline-offset-4 hover:underline">
          {s.privacyLink}
        </Link>
      </p>
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
  const db = getDb();
  const settings = await getSignInSettings(db);
  // The demo site signs in only as its made-up people, and only against its own database.
  const demo = demoMode();
  const showPco = !demo && settings.planningCenterEnabled && !!process.env.PCO_CLIENT_ID;
  // Codes need a working sender; without one they would wait unsent in the outbox.
  const showEmail = !demo && settings.emailEnabled && getEmailSender() !== null;
  const fake = fakeSignInEnabled() && (!demo || (await isDemoDatabase(db)));

  return (
    <div className="space-y-6">
      {demo && fake && <FakeSignIn callbackUrl={callbackUrl} demo />}
      {failed && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[12px] bg-danger/10 p-3 text-sm text-danger"
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
          {showPco && showEmail && (
            <div className="flex items-center gap-3 py-1 text-xs text-fg-muted" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              {s.or}
              <span className="h-px flex-1 bg-border" />
            </div>
          )}
          {showEmail && <EmailSignIn callbackUrl={callbackUrl} />}
        </div>
      ) : (
        !fake && <p className="rounded-[12px] bg-surface-2 p-3 text-sm">{s.notConfigured}</p>
      )}

      <details className="group rounded-[14px] bg-surface-2/70 text-sm">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 font-medium transition-colors duration-150 hover:text-accent motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
          <span className="flex-1">{s.accessHeading}</span>
          <ChevronRight
            className="size-4 text-fg-muted transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        <div className="space-y-2 px-4 pb-4 leading-relaxed text-fg-muted">
          <p>{s.leaderNote}</p>
          <p>{s.accessLeaders}</p>
          <p>{s.accessStaff}</p>
          {settings.adminContactEmail && <p>{s.contact(settings.adminContactEmail)}</p>}
        </div>
      </details>

      {!demo && fake && <FakeSignIn callbackUrl={callbackUrl} />}
    </div>
  );
}

/** The main way in: filled, full width, in the text colour, like a platform sign-in button. */
const primaryClass =
  "group flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px] bg-fg px-4 whitespace-nowrap sm:gap-3 sm:px-5 text-[15px] font-semibold text-bg shadow-sm transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.99] motion-reduce:transition-none";

const fakeClass =
  "flex min-h-10 w-full items-center gap-3 rounded-[12px] border border-border bg-surface px-4 text-left text-sm font-medium transition-colors duration-150 hover:bg-surface-hover motion-reduce:transition-none";

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
      <button type="submit" className={primaryClass}>
        {children}
        <ArrowRight
          className="hidden size-4 opacity-60 transition-transform sm:block duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </button>
    </form>
  );
}

function FakeSignIn({ callbackUrl, demo = false }: { callbackUrl: string; demo?: boolean }) {
  return (
    <section
      aria-labelledby="fake-heading"
      className="space-y-3 rounded-[14px] border border-dashed border-warning p-4"
    >
      <h2 id="fake-heading" className="text-sm font-semibold">
        {demo ? copy.demo.signInHeading : s.fakeHeading}
      </h2>
      <p className="text-xs text-fg-muted">{demo ? copy.demo.signInNote : s.fakeNote}</p>
      {FAKE_IDENTITIES.map((identity) => (
        <form key={identity.subject} action={signInFake}>
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          {(["provider", "subject", "email", "name", "organizationId"] as const).map((key) => (
            <input key={key} type="hidden" name={key} value={identity[key] ?? ""} />
          ))}
          <button type="submit" className={fakeClass}>
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
      <div className="h-[52px] animate-pulse rounded-[14px] bg-surface-2" />
      <div className="h-[52px] animate-pulse rounded-[14px] bg-surface-2" />
    </div>
  );
}
