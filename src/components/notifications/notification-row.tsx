"use client";

import Link from "next/link";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { AreaBadge } from "@/components/app-shell/area-icon";
import { Badge } from "@/components/ui/display";
import { notificationsCopy as n } from "@/copy/notifications";
import type { NotificationArea, NotificationItem } from "@/domain/notifications/in-app";
import type { AreaId } from "@/domain/navigation";
import { cn } from "@/lib/cn";
import { whenLabel } from "./format";

/** Each notification area wears the colour and icon of the app area it belongs to. */
const AREA_ICON: Record<NotificationArea, AreaId> = {
  annual: "annual",
  expenses: "expenses",
  spending: "spending",
  cycles: "annual",
  people: "admin",
};

/**
 * One notification. The title is the link, stretched over the row; opening it marks it
 * read. Unread rows have a dot and a bolder title, never colour alone.
 */
export function NotificationRow({
  item,
  now,
  zone,
  compact = false,
  onOpen,
}: {
  item: NotificationItem;
  now: Date;
  zone: string;
  compact?: boolean;
  onOpen?: () => void;
}) {
  const at = new Date(item.createdAt);
  return (
    <li
      className={cn(
        "relative flex gap-3 px-4 py-3 transition-colors duration-fast focus-within:bg-surface-2 hover:bg-surface-2 motion-reduce:transition-none",
      )}
    >
      <AreaBadge area={AREA_ICON[item.area]} size="sm" className="mt-0.5" />
      <div className={cn("min-w-0 flex-1", !compact && "sm:flex sm:items-start sm:gap-4")}>
        <div className="min-w-0 flex-1">
          <Link
            href={item.href}
            onClick={() => {
              if (!item.read) void markNotificationReadAction(item.id);
              onOpen?.();
            }}
            className={cn(
              "block text-sm text-fg after:absolute after:inset-0 after:content-[''] focus-visible:outline-none",
              item.read ? "font-normal" : "font-semibold",
            )}
          >
            {!item.read && <span className="sr-only">{`${n.unreadDot}: `}</span>}
            {item.title}
          </Link>
          <p className={cn("text-sm text-fg-muted", compact ? "line-clamp-2" : "break-words")}>
            {item.body}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            <span>{n.areas[item.area]}</span>
            {item.actionNeeded && <Badge tone="warning">{n.needsAction}</Badge>}
            <time dateTime={at.toISOString()} className={cn(!compact && "sm:hidden")}>
              {whenLabel(at, now, zone)}
            </time>
          </div>
        </div>
        {!compact && (
          <time
            dateTime={at.toISOString()}
            className="hidden shrink-0 text-xs text-fg-muted sm:block"
          >
            {whenLabel(at, now, zone)}
          </time>
        )}
      </div>
      {!item.read && (
        <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-accent" />
      )}
    </li>
  );
}
