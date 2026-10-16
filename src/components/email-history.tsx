import { CheckCircle2, Clock, Mail, XCircle } from "lucide-react";
import { cardClass } from "@/components/ui/styles";
import { emailCopy } from "@/copy/email";
import type { EmailHistoryItem } from "@/domain/notifications/history";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/time-zone";

const h = emailCopy.history;

const ICON = {
  pending: Clock,
  sending: Clock,
  sent: CheckCircle2,
  failed: XCircle,
} as const;

/**
 * The emails sent about a request and what became of each (FR-21, AC-58). The status is
 * written out, with an icon beside it, so colour is never the only signal.
 */
export function EmailHistory({
  emails,
  zone,
  className,
}: {
  emails: EmailHistoryItem[];
  zone: string;
  className?: string;
}) {
  return (
    <section aria-labelledby="emails-heading" className={cn(cardClass, "space-y-3", className)}>
      <div className="flex items-center gap-2">
        <Mail className="size-5 text-fg-muted" aria-hidden="true" />
        <h2 id="emails-heading" className="text-lg font-semibold">
          {h.heading}
        </h2>
      </div>
      <p className="text-sm text-fg-muted">{h.intro}</p>
      {emails.length === 0 ? (
        <p className="text-sm text-fg-muted">{h.none}</p>
      ) : (
        <ol className="divide-y divide-border">
          {emails.map((email) => {
            const Icon = ICON[email.status];
            return (
              <li key={email.id} className="space-y-1 py-3 text-sm first:pt-0 last:pb-0">
                <p className="font-medium break-words">{email.subject}</p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-fg-muted">
                  <span>{h.to(email.to)}</span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 font-medium",
                      email.status === "sent" && "text-success",
                      email.status === "failed" && "text-danger",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {h.statuses[email.status]}
                  </span>
                  <span>
                    {email.sentAt
                      ? h.at(formatDateTime(email.sentAt, zone))
                      : h.queuedAt(formatDateTime(email.queuedAt, zone))}
                  </span>
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
