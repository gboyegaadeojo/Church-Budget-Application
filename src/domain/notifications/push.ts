import { and, asc, count, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { appSettings, notifications, pushSubscriptions, users } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import type { PushSender } from "@/lib/push/sender";

/**
 * Phone and computer alerts (web push, docs/decisions.md 2026-10-22). Every notification
 * in the bell also pops up on the devices where its person turned alerts on. Marked in the
 * same transaction as the notification (`addNotifications`), sent after commit. Alerts are
 * a convenience: one that fails isn't retried, because the bell and the email have it.
 *
 * Alerts are on for everyone; nobody turns them off for themselves. Only the System
 * Administrator does: for the whole church (Settings, `push_enabled`) or for one person
 * (Users & Roles, `users.push_alerts`). Decided by the church 2026-10-22.
 */

/** The church-wide switch; on unless the System Administrator turned it off. */
export async function pushEnabled(tx: Tx | Db): Promise<boolean> {
  const [row] = await tx
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, "push_enabled"))
    .limit(1);
  return (row?.value ?? "true") !== "false";
}

/** Whether this person gets alerts: "on", or which switch turned them off. */
export async function alertsFor(
  tx: Tx | Db,
  userId: string,
): Promise<"on" | "church_off" | "person_off"> {
  if (!(await pushEnabled(tx))) return "church_off";
  const [row] = await tx
    .select({ on: users.pushAlerts })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.on === false ? "person_off" : "on";
}

/** The push services browsers use. The app posts to the endpoint, so nothing else is allowed. */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Android, Edge on Android
  /^(?:[a-z0-9-]+\.)*push\.apple\.com$/, // Safari, iPhone and iPad
  /^(?:[a-z0-9-]+\.)*push\.services\.mozilla\.com$/, // Firefox
  /^(?:[a-z0-9-]+\.)*notify\.windows\.com$/, // Edge on Windows
];

export function isPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.port === "" &&
      url.username === "" &&
      PUSH_HOSTS.some((host) => host.test(url.hostname))
    );
  } catch {
    return false;
  }
}

/** A plain name for the device, from its browser's user agent. */
export function deviceLabel(userAgent: string): string {
  if (/iPhone|iPod/.test(userAgent)) return "iPhone";
  if (/iPad/.test(userAgent)) return "iPad";
  if (/Android/.test(userAgent))
    return /Mobile/.test(userAgent) ? "Android phone" : "Android tablet";
  if (/Windows/.test(userAgent)) return "Windows computer";
  if (/Macintosh/.test(userAgent)) return "Mac";
  if (/CrOS/.test(userAgent)) return "Chromebook";
  if (/Linux/.test(userAgent)) return "Linux computer";
  return "Device";
}

const subscriptionSchema = z.object({
  endpoint: z.string().max(1000).refine(isPushEndpoint),
  // Base64url keys from the browser: 65-byte P-256 key and 16-byte secret.
  p256dh: z
    .string()
    .regex(/^[A-Za-z0-9_-]+=*$/)
    .min(80)
    .max(100),
  auth: z
    .string()
    .regex(/^[A-Za-z0-9_-]+=*$/)
    .min(16)
    .max(32),
});

export type PushSubscriptionInput = z.input<typeof subscriptionSchema>;

/**
 * Saves this device for the signed-in person. If someone else signed in on it before,
 * the device moves to whoever is signed in now, so alerts never reach the wrong person.
 */
export async function savePushSubscription(
  tx: Tx,
  userId: string,
  input: PushSubscriptionInput,
  userAgent: string,
): Promise<void> {
  const data = subscriptionSchema.parse(input);
  const device = deviceLabel(userAgent);
  await tx
    .insert(pushSubscriptions)
    .values({ userId, ...data, device })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: data.p256dh, auth: data.auth, device },
    });
}

/**
 * Removes one of a person's devices (a lost phone). Only the System Administrator calls
 * this, through Users & Roles; the caller checks the permission and audits it.
 */
export async function removePushDevice(
  tx: Tx,
  userId: string,
  deviceId: string,
): Promise<{ device: string } | null> {
  const [row] = await tx
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.id, deviceId)))
    .returning({ device: pushSubscriptions.device });
  return row ?? null;
}

export type PushDevice = { id: string; device: string; createdAt: Date; lastSentAt: Date | null };

export function listPushDevices(tx: Tx | Db, userId: string): Promise<PushDevice[]> {
  return tx
    .select({
      id: pushSubscriptions.id,
      device: pushSubscriptions.device,
      createdAt: pushSubscriptions.createdAt,
      lastSentAt: pushSubscriptions.lastSentAt,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(asc(pushSubscriptions.createdAt));
}

/**
 * Of these people, the ones who get alerts and have at least one device, so only their
 * notifications wait to be pushed.
 */
export async function withPushDevices(tx: Tx, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0 || !(await pushEnabled(tx))) return new Set();
  const rows = await tx
    .selectDistinct({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions)
    .innerJoin(users, eq(users.id, pushSubscriptions.userId))
    .where(and(inArray(pushSubscriptions.userId, userIds), eq(users.pushAlerts, true)));
  return new Set(rows.map((r) => r.userId));
}

/** Older than this, an alert is no longer news and is dropped unsent. */
const STALE_MS = 24 * 60 * 60 * 1000;

export type PushSummary = { sent: number; failed: number; removed: number };

/**
 * Sends waiting alerts, oldest first. Rows are claimed with SKIP LOCKED and cleared
 * before sending, so an action and the hourly job never send the same alert twice.
 */
export async function deliverPushes(
  db: Db,
  sender: PushSender,
  options: { now?: Date; limit?: number } = {},
): Promise<PushSummary> {
  const now = options.now ?? new Date();
  const summary: PushSummary = { sent: 0, failed: 0, removed: 0 };

  await db
    .update(notifications)
    .set({ pushPending: false })
    .where(
      and(
        eq(notifications.pushPending, true),
        lt(notifications.createdAt, new Date(now.getTime() - STALE_MS)),
      ),
    );

  const claimed = await db.transaction(async (tx) => {
    const due = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.pushPending, true))
      .orderBy(asc(notifications.createdAt))
      .limit(options.limit ?? 50)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    return tx
      .update(notifications)
      .set({ pushPending: false })
      .where(
        inArray(
          notifications.id,
          due.map((d) => d.id),
        ),
      )
      .returning({
        id: notifications.id,
        userId: notifications.userId,
        title: notifications.title,
        body: notifications.body,
        href: notifications.href,
      });
  });
  if (claimed.length === 0) return summary;
  // Turned off since these were marked: they are dropped, not held for later.
  if (!(await pushEnabled(db))) return summary;

  const userIds = [...new Set(claimed.map((n) => n.userId))];
  const [devices, unread] = await Promise.all([
    db
      .select({
        id: pushSubscriptions.id,
        userId: pushSubscriptions.userId,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .innerJoin(users, eq(users.id, pushSubscriptions.userId))
      .where(and(inArray(pushSubscriptions.userId, userIds), eq(users.pushAlerts, true))),
    db
      .select({ userId: notifications.userId, n: count() })
      .from(notifications)
      .where(and(inArray(notifications.userId, userIds), isNull(notifications.readAt)))
      .groupBy(notifications.userId),
  ]);
  const unreadBy = new Map(unread.map((r) => [r.userId, Number(r.n)]));

  const gone = new Set<string>();
  const reached = new Set<string>();
  await Promise.all(
    claimed.flatMap((n) =>
      devices
        .filter((d) => d.userId === n.userId)
        .map(async (d) => {
          const result = await sender.send(d, {
            title: n.title,
            body: n.body,
            url: n.href,
            tag: n.id,
            unread: unreadBy.get(n.userId) ?? 0,
          });
          if (result === "sent") {
            summary.sent++;
            reached.add(d.id);
          } else if (result === "gone") gone.add(d.id);
          else summary.failed++;
        }),
    ),
  );

  if (gone.size > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, [...gone]));
    summary.removed = gone.size;
  }
  if (reached.size > 0) {
    await db
      .update(pushSubscriptions)
      .set({ lastSentAt: now })
      .where(inArray(pushSubscriptions.id, [...reached]));
  }
  return summary;
}

/** A test alert to the person's own devices, from the Get the app page. */
export async function sendTestPush(
  db: Db,
  sender: PushSender,
  userId: string,
  message: { title: string; body: string },
): Promise<PushSummary> {
  const summary: PushSummary = { sent: 0, failed: 0, removed: 0 };
  const devices = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  for (const d of devices) {
    const result = await sender.send(d, {
      ...message,
      url: "/get-app",
      tag: "test",
      unread: -1,
    });
    if (result === "sent") summary.sent++;
    else if (result === "gone") {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, d.id));
      summary.removed++;
    } else summary.failed++;
  }
  return summary;
}

/** For Settings: the church-wide switch, devices with alerts, and people turned off. */
export async function pushDeviceCounts(
  db: Db,
): Promise<{ enabled: boolean; devices: number; peopleOff: number }> {
  const [enabled, [devices], [off]] = await Promise.all([
    pushEnabled(db),
    db.select({ n: count() }).from(pushSubscriptions),
    db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.pushAlerts, false), eq(users.active, true))),
  ]);
  return { enabled, devices: Number(devices?.n ?? 0), peopleOff: Number(off?.n ?? 0) };
}

/** Notifications waiting to be pushed (for tests and the job's summary). */
export async function pendingPushCount(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(eq(notifications.pushPending, true));
  return row?.n ?? 0;
}
