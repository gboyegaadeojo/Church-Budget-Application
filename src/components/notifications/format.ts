import { notificationsCopy as n } from "@/copy/notifications";
import type { NotificationItem } from "@/domain/notifications/in-app";
import { formatDateTime, zonedDate } from "@/lib/time-zone";

/** "Just now", "5 minutes ago", "3 hours ago", then the date and time in the church zone. */
export function whenLabel(at: Date, now: Date, zone: string): string {
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return n.justNow;
  if (minutes < 60) return n.minutesAgo(minutes);
  if (minutes < 12 * 60) return n.hoursAgo(Math.floor(minutes / 60));
  return formatDateTime(at, zone);
}

export type NotificationSection = keyof typeof n.sections;

/** Today, Yesterday, This week (the last 7 days) or Earlier, by the church's calendar. */
export function sectionFor(at: Date, now: Date, zone: string): NotificationSection {
  const day = (d: Date) => Date.parse(zonedDate(d, zone));
  const days = Math.round((day(now) - day(at)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return "week";
  return "earlier";
}

/** Groups items (newest first) into their sections, keeping the order. */
export function groupBySection(items: NotificationItem[], now: Date, zone: string) {
  const groups: { section: NotificationSection; items: NotificationItem[] }[] = [];
  for (const item of items) {
    const section = sectionFor(new Date(item.createdAt), now, zone);
    const last = groups.at(-1);
    if (last?.section === section) last.items.push(item);
    else groups.push({ section, items: [item] });
  }
  return groups;
}
