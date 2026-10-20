"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Bell, X } from "lucide-react";
import {
  markAllNotificationsReadAction,
  notificationsPreviewAction,
  type NotificationPreview,
} from "@/app/actions/notifications";
import { groupBySection } from "@/components/notifications/format";
import { NotificationRow } from "@/components/notifications/notification-row";
import { notificationsCopy as n } from "@/copy/notifications";
import { cn } from "@/lib/cn";

const bellClass =
  "relative grid size-11 shrink-0 place-items-center rounded-full text-fg-muted transition-colors duration-fast hover:bg-surface-hover hover:text-accent lg:size-10";

/** The unread count on the bell; "9+" past nine. The bell's label says the number. */
function CountBadge({ unread }: { unread: number }) {
  if (unread === 0) return null;
  return (
    <span
      aria-hidden="true"
      className="absolute top-1 right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[11px] leading-none font-semibold text-on-accent"
    >
      {unread > 9 ? "9+" : unread}
    </span>
  );
}

/** Stand-in the size of the bell while the page streams in, so the header doesn't jump. */
export function NotificationBellFallback() {
  return <span aria-hidden="true" className="block size-11 shrink-0 lg:size-10" />;
}

/**
 * The bell in the header (docs/decisions.md 2026-10-19). On a phone it opens the
 * Notifications page; from tablet width it opens a panel under the header with the
 * latest few, All or Needs action, and a link to the page. The count refreshes when
 * the page changes or the window regains focus: no timed polling.
 */
export function NotificationBell() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    notificationsPreviewAction()
      .then((p) => setUnread(p.unread))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  const label = n.bell(unread);
  return (
    <>
      <Link
        href="/notifications"
        aria-label={label}
        aria-current={pathname === "/notifications" ? "page" : undefined}
        className={cn(bellClass, "md:hidden")}
      >
        <Bell className="size-5" aria-hidden="true" />
        <CountBadge unread={unread} />
      </Link>
      <div className="hidden md:block">
        <NotificationPanel unread={unread} label={label} onUnread={setUnread} />
      </div>
    </>
  );
}

function NotificationPanel({
  unread,
  label,
  onUnread,
}: {
  unread: number;
  label: string;
  onUnread: (unread: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "action">("all");
  // Stamped with the time it loaded, which the rows measure "5 minutes ago" from.
  const [preview, setPreview] = useState<(NotificationPreview & { now: Date }) | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    notificationsPreviewAction({ items: true, actionOnly: tab === "action" })
      .then((p) => {
        if (!live) return;
        setPreview({ ...p, now: new Date() });
        onUnread(p.unread);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open, tab, onUnread]);

  const markAll = async () => {
    await markAllNotificationsReadAction();
    onUnread(0);
    setPreview((p) => p && { ...p, unread: 0, items: p.items.map((i) => ({ ...i, read: true })) });
  };

  return (
    // Non-modal, like the account menu: the page behind stays readable and usable.
    <Dialog.Root open={open} onOpenChange={setOpen} modal={false}>
      <Dialog.Trigger ref={trigger} aria-label={label} className={bellClass}>
        <Bell className="size-5" aria-hidden="true" />
        <CountBadge unread={unread} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content
          onInteractOutside={(e) => {
            // The bell toggles the panel itself, so a click on it must not close-then-reopen.
            if (trigger.current?.contains(e.target as Node)) e.preventDefault();
          }}
          className="fixed top-[4.5rem] right-4 z-(--z-overlay) flex max-h-[calc(100dvh-6rem)] w-[min(25rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-card border border-border bg-surface text-fg shadow-overlay data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in lg:right-8"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <Dialog.Title className="text-base font-semibold">{n.title}</Dialog.Title>
            <Dialog.Description className="sr-only">{n.intro}</Dialog.Description>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAll}
                  className="min-h-9 rounded-control px-2 text-sm font-medium text-accent transition-colors duration-fast hover:bg-surface-hover"
                >
                  {n.markAllRead}
                </button>
              )}
              <Dialog.Close
                aria-label={n.close}
                className="grid size-9 place-items-center rounded-full text-fg-muted transition-colors duration-fast hover:bg-surface-hover hover:text-accent"
              >
                <X className="size-4" aria-hidden="true" />
              </Dialog.Close>
            </div>
          </div>

          <div role="group" aria-label={n.filtersLabel} className="flex gap-2 px-4 pt-3">
            {(["all", "action"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-colors duration-fast",
                  tab === t
                    ? "border-accent bg-accent text-on-accent"
                    : "border-border bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                {n.panelTabs[t]}
              </button>
            ))}
          </div>

          <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
            {preview === null ? (
              <p className="px-4 py-8 text-center text-sm text-fg-muted" role="status">
                {n.loading}
              </p>
            ) : preview.items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="font-medium">{tab === "all" ? n.empty : n.emptyFilter}</p>
                {tab === "all" && <p className="mt-1 text-sm text-fg-muted">{n.emptyHint}</p>}
              </div>
            ) : (
              groupBySection(preview.items, preview.now, preview.zone).map((g) => (
                <section key={g.section} aria-label={n.sections[g.section]}>
                  <h3 className="px-4 pt-2 pb-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">
                    {n.sections[g.section]}
                  </h3>
                  <ul className="divide-y divide-border">
                    {g.items.map((item) => (
                      <NotificationRow
                        key={item.id}
                        item={item}
                        now={preview.now}
                        zone={preview.zone}
                        compact
                        onOpen={() => setOpen(false)}
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center justify-center border-t border-border text-sm font-medium text-accent transition-colors duration-fast hover:bg-surface-hover"
          >
            {n.seeAll}
          </Link>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
