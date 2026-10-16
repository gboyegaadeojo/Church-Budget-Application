import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { Info, ShieldAlert } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { auth } from "@/auth";
import { copy } from "@/copy/en-CA";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getOpenCycle } from "@/domain/annual/queries";
import { suggestedFor } from "@/domain/departments/pco-mapping";
import { getSignInSettings } from "@/domain/settings";
import { ACCESS_DENIED_REASONS, isAccessDeniedReason } from "@/domain/users/access";
import { deniedEmail } from "@/lib/denied-email";

const d = copy.accessDenied;

export function generateStaticParams() {
  return ACCESS_DENIED_REASONS.map((reason) => ({ reason }));
}

export async function generateMetadata({
  params,
}: PageProps<"/access-denied/[reason]">): Promise<Metadata> {
  const { reason } = await params;
  return { title: isAccessDeniedReason(reason) ? d.reasons[reason].heading : d.title };
}

/** Access denied (DRD 6.1a): a plain explanation, the email used, a way out, who to contact. */
export default async function AccessDeniedPage({ params }: PageProps<"/access-denied/[reason]">) {
  const { reason } = await params;
  if (!isAccessDeniedReason(reason)) notFound();
  const text = d.reasons[reason];
  const calm = reason === "waiting";
  const Icon = calm ? Info : ShieldAlert;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Icon
          className={`mt-1 size-6 shrink-0 ${calm ? "text-info" : "text-warning"}`}
          aria-hidden="true"
        />
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">{text.heading}</h1>
          <p className="text-sm text-fg-muted">{text.body}</p>
        </div>
      </div>
      <Suspense fallback={<p className="text-sm text-fg-muted">{copy.app.loading}</p>}>
        {reason === "waiting" && <AskedToConfirm />}
        {reason === "waiting" && <PickDepartment />}
        <AccountDetails />
      </Suspense>
    </div>
  );
}

/** FR-39: Planning Center named their departments, and the administrator was asked to confirm. */
async function AskedToConfirm() {
  await connection();
  const userId = (await auth())?.user?.id;
  if (!userId) return null;
  const names = await suggestedFor(getDb(), userId);
  if (names.length === 0) return null;
  return (
    <p className="rounded-control border border-info p-4 text-sm" role="status">
      {d.askedToConfirm(names.join(", "))}
    </p>
  );
}

/**
 * A verified leader waiting for a department can pick one on the annual form while a
 * cycle is open (FR-03, FR-38), instead of waiting for the administrator.
 */
async function PickDepartment() {
  await connection();
  if (!(await getOpenCycle(getDb()))) return null;
  return (
    <div className="space-y-2 rounded-control border border-info p-4 text-sm">
      <p>{d.pickDepartment}</p>
      <Link
        href="/annual/new"
        className="inline-flex min-h-11 items-center rounded-control bg-accent px-4 font-medium text-on-accent transition-colors duration-fast hover:bg-accent-hover lg:min-h-10"
      >
        {d.pickDepartmentAction}
      </Link>
    </div>
  );
}

async function AccountDetails() {
  // Request-time first, so nothing below runs at build (Auth.js uses crypto early).
  await connection();
  let email = await deniedEmail();
  const db = getDb();
  if (!email) {
    const userId = (await auth())?.user?.id;
    if (userId) {
      const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
      email = row?.email ?? null;
    }
  }
  const { adminContactEmail } = await getSignInSettings(db);

  return (
    <div className="space-y-4 text-sm">
      {email && <p>{d.signedInWith(email)}</p>}
      <form action={signOutAction}>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-control border border-border-strong px-4 font-medium transition-colors duration-fast hover:bg-surface-hover lg:min-h-10"
        >
          {d.useDifferentAccount}
        </button>
      </form>
      <p className="text-fg-muted">
        {adminContactEmail ? d.contact(adminContactEmail) : d.contactFallback}
      </p>
    </div>
  );
}
