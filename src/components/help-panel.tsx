"use client";

import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { CircleHelp, X } from "lucide-react";
import { helpCopy } from "@/copy/help";
import { linkClass } from "@/components/ui/styles";

const p = helpCopy.panel;
type TopicId = (typeof helpCopy.topics)[number]["id"];

/**
 * Contextual help (FR-36, DRD 6.11c): a link such as "How is tax calculated?" that opens
 * the answer in a side panel, so nothing typed on the page is lost.
 */
export function HelpPanel({ topic, label = p.taxLink }: { topic: TopicId; label?: string }) {
  const t = helpCopy.topics.find((x) => x.id === topic)!;
  return (
    <Dialog.Root>
      <Dialog.Trigger
        className={`${linkClass} inline-flex min-h-11 items-center gap-1.5 text-sm lg:min-h-9`}
      >
        <CircleHelp className="size-4" aria-hidden="true" />
        {label}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-(--z-overlay) bg-black/40 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-(--z-overlay) flex w-full max-w-md flex-col border-l border-border bg-surface text-fg shadow-overlay data-[state=closed]:animate-panel-out data-[state=open]:animate-panel-in">
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <Dialog.Title className="text-lg font-semibold">{t.question}</Dialog.Title>
            <Dialog.Close
              aria-label={p.close}
              className="grid size-11 shrink-0 place-items-center rounded-full text-fg-muted transition-colors duration-fast hover:bg-surface-hover hover:text-fg"
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description asChild>
            <div className="space-y-3 overflow-y-auto px-5 py-4 text-sm">
              {t.answer.map((a) => (
                <p key={a}>{a}</p>
              ))}
              <p>
                <Link href={`/help#${t.id}`} className={linkClass}>
                  {p.more}
                </Link>
              </p>
            </div>
          </Dialog.Description>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
