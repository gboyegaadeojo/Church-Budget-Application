import { MessageSquare } from "lucide-react";
import { annualCopy } from "@/copy/annual";
import type { Thread } from "@/domain/annual/messages";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/time-zone";
import { MarkMessagesRead, MessageComposer } from "./message-composer";

const t = annualCopy.thread;
const URL_PATTERN = /(https?:\/\/[^\s<>"]+)/g;

/**
 * Plain text with its http and https links made clickable (CLAUDE.md "Links"): opened in
 * a new tab without the opener, each followed by its domain. Nothing else is markup.
 */
function Linked({ text }: { text: string }) {
  return text.split(URL_PATTERN).map((part, i) => {
    if (i % 2 === 0) return part;
    let domain: string;
    try {
      domain = new URL(part).hostname;
    } catch {
      return part;
    }
    return (
      <span key={i}>
        <a
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-accent underline underline-offset-2"
        >
          {part}
        </a>{" "}
        <span className="text-fg-muted">{t.linkTo(domain)}</span>
      </span>
    );
  });
}

/** "2 new messages" on a request's row (DRD 6.11a); nothing when all are read. */
export function UnreadMessages({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium whitespace-nowrap text-on-accent">
      <MessageSquare aria-hidden="true" className="size-3" />
      {t.unread(count)}
    </span>
  );
}

/**
 * The messages panel (FR-31, DRD 6.11a) on the department's request page and the
 * accountant's review screen: the thread oldest first with who, which side and when,
 * then the box to write in for those who may.
 */
export function RequestMessages({
  requestId,
  thread,
  zone,
  unread,
}: {
  requestId: string;
  thread: Thread;
  zone: string;
  unread: number;
}) {
  return (
    <section
      id="messages"
      aria-labelledby="messages-heading"
      className="scroll-mt-20 space-y-4 rounded-card border border-border bg-surface p-5 shadow-card sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <MessageSquare aria-hidden="true" className="size-5 text-fg-muted" />
        <h2 id="messages-heading" className="text-lg font-semibold">
          {t.heading}
        </h2>
        {unread > 0 && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-on-accent">
            {t.unread(unread)}
          </span>
        )}
      </div>
      <p className="text-sm text-fg-muted">{t.intro}</p>
      <MarkMessagesRead requestId={requestId} unread={unread > 0} />

      {thread.messages.length === 0 ? (
        <p className="text-sm text-fg-muted">{t.empty}</p>
      ) : (
        <ol className="space-y-3">
          {thread.messages.map((m) => (
            <li
              key={m.id}
              className={cn(
                "max-w-prose space-y-1 rounded-control border p-3 text-sm",
                m.side === "accountant"
                  ? "border-area-annual/30 bg-area-annual-soft/40"
                  : "border-border bg-surface-2",
                m.mine && "ml-auto",
              )}
            >
              <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-fg-muted">
                <span className="font-semibold text-fg">{m.mine ? t.you : m.authorName}</span>
                <span>{m.side === "accountant" ? t.accountant : t.department}</span>
                <time dateTime={m.at.toISOString()}>{formatDateTime(m.at, zone)}</time>
              </p>
              <p className="break-words whitespace-pre-line">
                <Linked text={m.body} />
              </p>
            </li>
          ))}
        </ol>
      )}

      {thread.canSend ? (
        <MessageComposer
          requestId={requestId}
          note={thread.side === "accountant" ? t.toDepartment : t.toAccountant}
        />
      ) : thread.draft ? (
        <p className="text-sm text-fg-muted">{annualCopy.errors.messageDraft}</p>
      ) : (
        <p className="text-sm text-fg-muted">{t.readOnly}</p>
      )}
    </section>
  );
}
