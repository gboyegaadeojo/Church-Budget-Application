"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { FormMessage } from "@/components/ui/action-form";
import { buttonClass, textareaClass } from "@/components/ui/styles";
import { annualCopy } from "@/copy/annual";
import { markMessagesReadAction, sendMessageAction } from "@/app/(app)/annual/message-actions";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/cn";

const t = annualCopy.thread;
const MAX = 2000;

/** Marks the thread read once it's on screen (DRD 6.11a unread counts). */
export function MarkMessagesRead({ requestId, unread }: { requestId: string; unread: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!unread) return;
    void markMessagesReadAction(requestId).then(() => router.refresh());
  }, [requestId, unread, router]);
  return null;
}

/**
 * The box under the thread: plain text up to 2,000 characters and Send. Each send has
 * its own idempotency key, so a double click posts one message (FR-10); the text is kept
 * if the server refuses it (DRD 11).
 */
export function MessageComposer({ requestId, note }: { requestId: string; note: string }) {
  const ids = useId();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [state, setState] = useState<ActionState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const error = state.status === "error" ? state.fieldErrors?.body : undefined;

  function send(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    startTransition(async () => {
      const result = await sendMessageAction({ requestId, body, idempotencyKey: key });
      setState(result);
      if (result.status === "success") {
        setBody("");
        setKey(crypto.randomUUID());
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={send} className="space-y-3" noValidate>
      <div className="space-y-1.5">
        <label htmlFor={`${ids}-body`} className="block text-sm font-medium">
          {t.label}
        </label>
        <textarea
          id={`${ids}-body`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MAX}
          rows={3}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${ids}-note ${ids}-count${error ? ` ${ids}-error` : ""}`}
          className={textareaClass}
        />
        <div className="flex flex-wrap justify-between gap-2 text-xs text-fg-muted">
          <span id={`${ids}-note`}>{note}</span>
          <span id={`${ids}-count`} className="tabular">
            {t.count(body.length)}
          </span>
        </div>
        {error && (
          <p id={`${ids}-error`} className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
      <button type="submit" disabled={pending} className={cn(buttonClass("primary"), "gap-2")}>
        {pending ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <Send aria-hidden="true" className="size-4" />
        )}
        {t.send}
      </button>
      <FormMessage state={error ? { status: "idle" } : state} />
    </form>
  );
}
