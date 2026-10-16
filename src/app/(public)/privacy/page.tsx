import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { linkClass } from "@/components/ui/styles";
import { privacyCopy as p } from "@/copy/help";
import { getDb } from "@/db";
import { emailBrand } from "@/domain/notifications/notice";
import { getSignInSettings } from "@/domain/settings";

export const metadata: Metadata = { title: p.title };

/**
 * The privacy notice (FR-36): open to everyone, linked from the sign-in screen and the
 * footer, in plain language. What it lists matches what the app actually stores.
 */
export default function PrivacyPage() {
  return (
    <article className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">{p.title}</h1>
        <p className="text-sm text-fg-muted">{p.updated}</p>
      </div>
      <Suspense fallback={<p className="text-sm text-fg-muted" aria-busy="true" />}>
        <PrivacyBody />
      </Suspense>
    </article>
  );
}

async function PrivacyBody() {
  await connection();
  const db = getDb();
  const [session, brand, settings] = await Promise.all([
    auth(),
    emailBrand(db),
    getSignInSettings(db),
  ]);
  const signedIn = Boolean(session?.user?.id);
  return (
    <>
      <Link
        href={signedIn ? "/" : "/sign-in"}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-fg-muted hover:text-fg lg:min-h-9"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {signedIn ? p.backToApp : p.backToSignIn}
      </Link>
      <p>{p.intro(brand.churchName, brand.appName)}</p>
      {p.sections.map((section) => (
        <section key={section.heading} className="space-y-2">
          <h2 className="text-lg font-semibold">{section.heading}</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{p.contactHeading}</h2>
        <p>
          {settings.adminContactEmail ? p.contact(settings.adminContactEmail) : p.contactFallback}
        </p>
        {signedIn && (
          <p>
            <Link href="/help#my-information" className={linkClass}>
              {p.askOnHelp}
            </Link>
          </p>
        )}
      </section>
    </>
  );
}
