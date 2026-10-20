"use server";

import { auth } from "@/auth";
import { getDb } from "@/db";
import {
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
  type NotificationItem,
} from "@/domain/notifications/in-app";
import { getChurchTimeZone } from "@/domain/settings";
import { loadViewer } from "@/domain/users/viewer";
import { fallbackTimeZone } from "@/lib/time-zone";

/** The signed-in person's id, or null. Notifications are only ever their own. */
async function viewerId(): Promise<string | null> {
  const userId = (await auth())?.user?.id;
  if (!userId) return null;
  const loaded = await loadViewer(getDb(), userId);
  return loaded.ok ? loaded.viewer.id : null;
}

export type NotificationPreview = { unread: number; items: NotificationItem[]; zone: string };

/** The bell: how many are unread and, for the panel, the latest few. */
export async function notificationsPreviewAction(
  options: { items?: boolean; actionOnly?: boolean } = {},
): Promise<NotificationPreview> {
  const id = await viewerId();
  if (!id) return { unread: 0, items: [], zone: fallbackTimeZone() };
  const db = getDb();
  const [unread, items, zone] = await Promise.all([
    unreadCount(db, id),
    options.items
      ? listNotifications(db, id, { filter: options.actionOnly ? "action" : "all", limit: 8 })
      : Promise.resolve([]),
    options.items ? getChurchTimeZone(db) : Promise.resolve(fallbackTimeZone()),
  ]);
  return { unread, items, zone };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function markNotificationReadAction(notificationId: string): Promise<void> {
  const id = await viewerId();
  if (!id || typeof notificationId !== "string" || !UUID.test(notificationId)) return;
  await markRead(getDb(), id, notificationId);
}

export async function markAllNotificationsReadAction(): Promise<number> {
  const id = await viewerId();
  if (!id) return 0;
  return markAllRead(getDb(), id);
}
