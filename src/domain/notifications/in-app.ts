import { and, count, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { notificationAreaEnum, notifications, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { withPushDevices } from "./push";

/**
 * In-app notifications: the bell (docs/decisions.md 2026-10-19). Every email the app
 * queues for someone with an account also lands here, written by `enqueueEmail` in the
 * same transaction. Each person sees only their own; nobody else, the System
 * Administrator included, can read or mark them. Marking as read is not a business
 * change, so it isn't audited.
 */

export type NotificationArea = (typeof notificationAreaEnum.enumValues)[number];
export const NOTIFICATION_AREAS = notificationAreaEnum.enumValues;

const AREA_BY_PREFIX: Record<string, NotificationArea> = {
  annual: "annual",
  expenses: "expenses",
  spending: "spending",
  cycle: "cycles",
  department: "people",
  access: "people",
};

/** Templates that ask the person to do something: approve, answer, finish or pay. */
const ACTION_EXACT = new Set([
  "annual.submitted.accountant",
  "annual.revised.accountant",
  "annual.answered.accountant",
  "annual.second_needed",
  "annual.returned",
  "annual.release_warning",
  "expenses.submitted.accountant",
  "expenses.board_needed",
  "expenses.returned",
  "expenses.ready_for_processing",
  "expenses.answered.accountant",
  "expenses.answered.board",
  "expenses.edited.accountant",
  "expenses.edited.board",
  "cycle.close_due",
  "cycle.reminder",
  "access.request",
  "access.new_leader_waiting",
  "department.proposed",
  "department.leader_suggested",
]);

/**
 * Where a notification belongs and whether it asks for action, from its email template.
 * Returns null for system emails (the test email, the failure digest), which stay
 * email-only.
 */
export function classify(
  template: string,
): { area: NotificationArea; actionNeeded: boolean } | null {
  const area = AREA_BY_PREFIX[template.split(".")[0]];
  if (!area) return null;
  const actionNeeded =
    ACTION_EXACT.has(template) || template.includes("reminder") || template.includes(".message.");
  return { area, actionNeeded };
}

/** The app path of an email's button, or "/" when it isn't a link into this app. */
export function appPath(href: string, base = process.env.AUTH_URL ?? "http://localhost:3000") {
  try {
    const origin = new URL(base).origin;
    const url = new URL(href, origin);
    if (url.origin !== origin) return "/";
    return url.pathname + url.hash;
  } catch {
    return "/";
  }
}

export type NotificationDraft = {
  template: string;
  title: string;
  body: string;
  href: string;
  budgetRequestId?: string | null;
  expenseSubmissionId?: string | null;
  cycleId?: string | null;
  createdAt: Date;
};

/**
 * Adds one notification per person, in the caller's transaction. Addresses without a
 * `userId` are matched to an active account by email; anyone without one is skipped.
 */
export async function addNotifications(
  tx: Tx,
  draft: NotificationDraft,
  to: readonly { email: string; userId?: string | null }[],
): Promise<number> {
  const kind = classify(draft.template);
  if (!kind || to.length === 0) return 0;
  const ids = new Set(to.flatMap((r) => (r.userId ? [r.userId] : [])));
  const emails = to.filter((r) => !r.userId).map((r) => r.email.trim().toLowerCase());
  if (emails.length > 0) {
    const found = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(sql`lower(${users.email})`, emails), eq(users.active, true)));
    for (const u of found) ids.add(u.id);
  }
  if (ids.size === 0) return 0;
  const body = draft.body.length > 200 ? `${draft.body.slice(0, 199)}…` : draft.body;
  // People with alerts turned on also get it on their phones, sent after commit.
  const pushed = await withPushDevices(tx, [...ids]);
  await tx.insert(notifications).values(
    [...ids].map((userId) => ({
      userId,
      template: draft.template,
      area: kind.area,
      actionNeeded: kind.actionNeeded,
      title: draft.title,
      body,
      href: appPath(draft.href),
      budgetRequestId: draft.budgetRequestId ?? null,
      expenseSubmissionId: draft.expenseSubmissionId ?? null,
      cycleId: draft.cycleId ?? null,
      pushPending: pushed.has(userId),
      createdAt: draft.createdAt,
    })),
  );
  return ids.size;
}

// ---------------------------------------------------------------- reading

export const NOTIFICATION_FILTERS = ["all", "unread", "action", ...NOTIFICATION_AREAS] as const;
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];
export const isNotificationFilter = (v: unknown): v is NotificationFilter =>
  typeof v === "string" && (NOTIFICATION_FILTERS as readonly string[]).includes(v);

export type NotificationItem = {
  id: string;
  area: NotificationArea;
  actionNeeded: boolean;
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: Date;
};

function filterWhere(filter: NotificationFilter): SQL | undefined {
  if (filter === "all") return undefined;
  if (filter === "unread") return isNull(notifications.readAt);
  if (filter === "action") return eq(notifications.actionNeeded, true);
  return eq(notifications.area, filter);
}

const itemColumns = {
  id: notifications.id,
  area: notifications.area,
  actionNeeded: notifications.actionNeeded,
  title: notifications.title,
  body: notifications.body,
  href: notifications.href,
  readAt: notifications.readAt,
  createdAt: notifications.createdAt,
};

const toItem = ({ readAt, ...row }: { readAt: Date | null } & Omit<NotificationItem, "read">) =>
  ({ ...row, read: readAt !== null }) satisfies NotificationItem;

export async function unreadCount(tx: Tx, userId: string): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

/** How many of the person's notifications each filter would show. */
export async function filterCounts(
  tx: Tx,
  userId: string,
): Promise<Record<NotificationFilter, number>> {
  const rows = await tx
    .select({
      area: notifications.area,
      total: count(),
      unread: sql<number>`count(*) filter (where ${notifications.readAt} is null)`.mapWith(Number),
      action: sql<number>`count(*) filter (where ${notifications.actionNeeded})`.mapWith(Number),
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .groupBy(notifications.area);
  const out = Object.fromEntries(NOTIFICATION_FILTERS.map((f) => [f, 0])) as Record<
    NotificationFilter,
    number
  >;
  for (const r of rows) {
    out[r.area] = r.total;
    out.all += r.total;
    out.unread += r.unread;
    out.action += r.action;
  }
  return out;
}

export async function listNotifications(
  tx: Tx,
  userId: string,
  options: { filter?: NotificationFilter; limit: number; offset?: number },
): Promise<NotificationItem[]> {
  const rows = await tx
    .select(itemColumns)
    .from(notifications)
    .where(and(eq(notifications.userId, userId), filterWhere(options.filter ?? "all")))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(options.limit)
    .offset(options.offset ?? 0);
  return rows.map(toItem);
}

/** Marks one of the person's own notifications as read; someone else's is left alone. */
export async function markRead(tx: Tx, userId: string, id: string, now = new Date()) {
  const done = await tx
    .update(notifications)
    .set({ readAt: now })
    .where(
      and(eq(notifications.id, id), eq(notifications.userId, userId), isNull(notifications.readAt)),
    )
    .returning({ id: notifications.id });
  return done.length;
}

export async function markAllRead(tx: Tx, userId: string, now = new Date()) {
  const done = await tx
    .update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return done.length;
}
