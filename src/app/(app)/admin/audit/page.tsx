import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock, Mail, Send, XCircle } from "lucide-react";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/action-form";
import {
  AdminSkeleton,
  Badge,
  EmptyState,
  PageHeader,
  PermissionDenied,
  Section,
  StatCard,
  type BadgeTone,
  type Tone,
} from "@/components/ui/display";
import { buttonClass, inputClass, linkClass } from "@/components/ui/styles";
import { emailCopy } from "@/copy/email";
import { getDb } from "@/db";
import {
  EMAIL_STATUSES,
  getEmailLog,
  TEST_EMAILS_PER_DAY,
  type EmailLogItem,
  type EmailStatus,
} from "@/domain/notifications/admin";
import { getChurchTimeZone } from "@/domain/settings";
import { viewerAllowedTo } from "@/lib/admin-server";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/time-zone";
import { retryEmailsAction, sendTestEmailAction } from "./actions";

const a = emailCopy.admin;
const labels = emailCopy.history.statuses;

export const metadata: Metadata = { title: a.title };

const TONE: Record<EmailStatus, BadgeTone> = {
  pending: "info",
  sending: "info",
  sent: "success",
  failed: "danger",
};
const ICON = { pending: Clock, sending: Send, sent: CheckCircle2, failed: XCircle } as const;
const STATUS_TONE: Record<EmailStatus, Tone> = {
  pending: "amber",
  sending: "blue",
  sent: "green",
  failed: "red",
};

/** Admin → Notifications & Audit: the email log and sending failed emails again (FR-21). */
export default function NotificationsPage({ searchParams }: PageProps<"/admin/audit">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <NotificationsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NotificationsContent({
  searchParams,
}: Pick<PageProps<"/admin/audit">, "searchParams">) {
  const viewer = await viewerAllowedTo("admin.notifications", "/admin/audit");
  if (!viewer) return <PermissionDenied />;
  const params = await searchParams;
  const status = EMAIL_STATUSES.find((s) => s === params.status);
  const q = typeof params.q === "string" ? params.q : "";
  const db = getDb();
  const [log, zone] = await Promise.all([
    getEmailLog(db, viewer, { status, q }),
    getChurchTimeZone(db),
  ]);
  const filtered = Boolean(status || q);

  return (
    <>
      <PageHeader title={a.title} intro={a.intro} />

      <section aria-label={a.countsLabel} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {EMAIL_STATUSES.map((s) => (
          <StatCard
            key={s}
            href={`/admin/audit?status=${s}`}
            current={status === s}
            label={labels[s]}
            value={log.counts[s].toLocaleString("en-CA")}
            icon={ICON[s]}
            tone={STATUS_TONE[s]}
          />
        ))}
      </section>
      {log.retryable > 0 && (
        <ActionForm action={retryEmailsAction} aria-label={a.retryAll} className="space-y-2">
          <input type="hidden" name="all" value="1" />
          <SubmitButton tone="secondary">{a.retryAll}</SubmitButton>
          <p className="text-sm text-fg-muted">{a.retryAllHint}</p>
        </ActionForm>
      )}

      <Section title={a.test.heading} id="test-email" icon={Send} tone="blue">
        <p className="text-sm text-fg-muted">{a.test.intro}</p>
        <ActionForm action={sendTestEmailAction} aria-label={a.test.heading} className="max-w-md">
          <TextField
            name="to"
            type="email"
            label={a.test.to}
            hint={a.test.hint(TEST_EMAILS_PER_DAY)}
            defaultValue={viewer.email}
            autoComplete="email"
            required
          />
          <SubmitButton tone="secondary">{a.test.send}</SubmitButton>
        </ActionForm>
      </Section>

      <Section title={a.logHeading} id="email-log" icon={Mail} tone="violet">
        <form
          method="get"
          role="search"
          aria-label={a.filtersLabel}
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <div className="space-y-1.5">
            <label htmlFor="email-status" className="block text-sm font-medium">
              {a.statusFilter}
            </label>
            <select
              id="email-status"
              name="status"
              defaultValue={status ?? ""}
              className={inputClass}
            >
              <option value="">{a.allStatuses}</option>
              {EMAIL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {labels[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 space-y-1.5">
            <label htmlFor="email-search" className="block text-sm font-medium">
              {a.search}
            </label>
            <input
              id="email-search"
              type="search"
              name="q"
              defaultValue={q}
              className={inputClass}
            />
          </div>
          <button type="submit" className={buttonClass("secondary")}>
            {a.apply}
          </button>
          {filtered && (
            <Link href="/admin/audit" className={buttonClass("ghost")}>
              {a.clear}
            </Link>
          )}
        </form>

        {log.items.length === 0 ? (
          <EmptyState>{filtered ? a.empty : a.none}</EmptyState>
        ) : (
          <EmailTable items={log.items} zone={zone} />
        )}
        {log.truncated && <p className="text-sm text-fg-muted">{a.truncated}</p>}
      </Section>

      <p className="text-sm text-fg-muted">
        {a.activityNote}{" "}
        <Link href="/reports/analytics" className={linkClass}>
          {a.activityLink}
        </Link>
      </p>
    </>
  );
}

function EmailTable({ items, zone }: { items: EmailLogItem[]; zone: string }) {
  return (
    <div
      className="relative -mx-1 overflow-x-auto px-1"
      tabIndex={0}
      role="region"
      aria-label={a.logHeading}
    >
      <table className="w-full min-w-[44rem] text-left text-sm">
        <caption className="sr-only">{a.logHeading}</caption>
        <thead className="border-b border-border text-xs text-fg-muted">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">
              {a.columns.email}
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              {a.columns.to}
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              {a.columns.status}
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              {a.columns.tries}
            </th>
            <th scope="col" className="py-2 font-medium">
              {a.columns.when}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((e) => (
            <tr key={e.id} className="align-top">
              <td className="max-w-[22rem] py-3 pr-4">
                <span className="block font-medium break-words">{e.subject}</span>
                {e.lastError && e.status !== "sent" && (
                  <span className="block text-xs break-words text-danger">{e.lastError}</span>
                )}
                {e.budgetRequestId && (
                  <Link
                    href={`/annual/review/${e.budgetRequestId}`}
                    className={cn(linkClass, "text-xs")}
                  >
                    {a.openRequest}
                  </Link>
                )}
              </td>
              <td className="py-3 pr-4">
                {e.to}
                {e.to !== e.toEmail && (
                  <span className="block text-xs break-all text-fg-muted">{e.toEmail}</span>
                )}
              </td>
              <td className="py-3 pr-4">
                <Badge tone={TONE[e.status]}>{labels[e.status]}</Badge>
                {e.status === "failed" && !e.sensitive && (
                  <ActionForm
                    action={retryEmailsAction}
                    aria-label={a.retryLabel(e.subject, e.to)}
                    className="mt-2"
                  >
                    <input type="hidden" name="id" value={e.id} />
                    <SubmitButton tone="secondary">{a.retry}</SubmitButton>
                  </ActionForm>
                )}
              </td>
              <td className="tabular py-3 pr-4 text-right">{e.attempts}</td>
              <td className="py-3 text-xs text-fg-muted">
                <span className="block">
                  {e.sentAt
                    ? a.sent(formatDateTime(e.sentAt, zone))
                    : a.queued(formatDateTime(e.queuedAt, zone))}
                </span>
                {e.status === "pending" && e.attempts > 0 && (
                  <span className="block">{a.nextTry(formatDateTime(e.nextAttemptAt, zone))}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
