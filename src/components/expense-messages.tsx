import { MessageSquare } from "lucide-react";
import { sendExpenseMessageAction } from "@/app/(app)/expenses/message-actions";
import { expensesCopy } from "@/copy/expenses";
import type { ExpenseThread } from "@/domain/expenses/messages";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/time-zone";
import { MessageComposer } from "./message-composer";
import { Linked } from "./request-messages";

const t = expensesCopy.thread;

/**
 * The messages panel on an expense (6B.4): on the expense page, the accountant's review
 * screen and the Board Chair's decision screen. The thread oldest first, with who, which
 * side and when, then the box to write in for those who may.
 */
export function ExpenseMessages({
  expenseId,
  thread,
  zone,
}: {
  expenseId: string;
  thread: ExpenseThread;
  zone: string;
}) {
  if (thread.draft) return null;
  return (
    <section
      id="messages"
      aria-labelledby="expense-messages-heading"
      className="scroll-mt-20 space-y-4 rounded-card border border-border bg-surface p-5 shadow-card sm:p-6"
    >
      <div className="flex items-center gap-2">
        <MessageSquare aria-hidden="true" className="size-5 text-fg-muted" />
        <h2 id="expense-messages-heading" className="text-lg font-semibold">
          {t.heading}
        </h2>
      </div>
      <p className="text-sm text-fg-muted">{t.intro}</p>

      {thread.messages.length === 0 ? (
        <p className="text-sm text-fg-muted">{t.empty}</p>
      ) : (
        <ol className="space-y-3">
          {thread.messages.map((m) => (
            <li
              key={m.id}
              className={cn(
                "max-w-prose space-y-1 rounded-control border p-3 text-sm",
                m.side === "department"
                  ? "border-border bg-surface-2"
                  : "border-area-expenses/30 bg-area-expenses-soft/40",
                m.mine && "ml-auto",
              )}
            >
              <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-fg-muted">
                <span className="font-semibold text-fg">{m.mine ? t.you : m.authorName}</span>
                <span>{t.sides[m.side]}</span>
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
        <MessageComposer requestId={expenseId} note={t.note} send={sendExpenseMessageAction} />
      ) : (
        <p className="text-sm text-fg-muted">{t.readOnly}</p>
      )}
    </section>
  );
}
