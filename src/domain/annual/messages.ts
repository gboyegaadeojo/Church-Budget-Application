import { and, asc, count, eq, gt, gte, inArray, ne, or, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { annualCopy } from "@/copy/annual";
import { emailCopy } from "@/copy/email";
import {
  budgetCycles,
  idempotencyKeys,
  requestMessageReads,
  requestMessages,
  users,
} from "@/db/schema";
import type { Tx } from "@/db/types";
import { parseInput, RuleError } from "@/domain/errors";
import { queueNotice } from "@/domain/notifications/notice";
import { accountantRecipients, departmentRepresentatives } from "@/domain/notifications/recipients";
import { writeAudit } from "@/lib/audit";
import { assertCan, authorize, type Subject } from "@/lib/authz";
import { appUrl } from "@/lib/email/layout";
import type { Role } from "@/lib/roles";
import { actorOf, loadRequest, parseKey, previousResult } from "./service";

/**
 * Messages on a request between the department's leaders and the accountant (FR-31,
 * DRD 6.11a). Plain text up to 2,000 characters; links are shown as links, nothing is
 * attached. Each message emails the other side through the outbox (AC-59) and is in the
 * request's history. A message never changes the request or uses an edit, can't be
 * changed or deleted (the table is append-only), and the thread stays open after a
 * decision so questions about purchases can continue.
 */

const e = annualCopy.errors;
export const MESSAGE_MAX = 2000;
/** Per person per day, so a long conversation can't use up the free email quota. */
export const MESSAGES_PER_DAY = 30;
const DAY_MS = 86_400_000;

const bodySchema = z
  .string({ error: e.messageEmpty })
  .trim()
  .min(1, e.messageEmpty)
  .max(MESSAGE_MAX, e.messageTooLong);

/** Which side wrote a message, from the role they acted in. */
export type MessageSide = "department" | "accountant";
export const sideOf = (role: Role): MessageSide =>
  role === "requester" ? "department" : "accountant";

export type SendResult = { messageId: string; sentAt: string };

export async function sendMessage(
  tx: Tx,
  actor: Subject,
  input: { requestId: string; body: unknown; idempotencyKey: unknown },
  { now = new Date() }: { now?: Date } = {},
): Promise<SendResult> {
  const key = parseKey(input.idempotencyKey);
  const repeat = await previousResult<SendResult>(tx, key, actor, "annual.message_send");
  if (repeat) return repeat;

  const row = await loadRequest(tx, input.requestId);
  const { actingRole } = assertCan(actor, "annual.message_send", {
    departmentId: row.departmentId,
    annualStatus: row.status,
  });
  // The accountant can't see a draft, so there's nobody to write to yet.
  if (row.status === "draft") throw new RuleError(e.messageDraft);
  const body = parseInput(z.object({ body: bodySchema }), { body: input.body }).body;

  const [{ today }] = await tx
    .select({ today: count() })
    .from(requestMessages)
    .where(
      and(
        eq(requestMessages.authorUserId, actor.id),
        gte(requestMessages.createdAt, new Date(now.getTime() - DAY_MS)),
      ),
    );
  if (today >= MESSAGES_PER_DAY) throw new RuleError(e.messageLimit);

  const [message] = await tx
    .insert(requestMessages)
    .values({
      budgetRequestId: row.id,
      authorUserId: actor.id,
      actingRole,
      body,
      createdAt: now,
    })
    .returning({ id: requestMessages.id });
  await markRead(tx, actor.id, row.id, now);

  const side = sideOf(actingRole);
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "annual",
    eventType: "annual.message_sent",
    entity: { type: "budget_request", id: row.id },
    budgetRequestId: row.id,
    departmentId: row.departmentId,
    cycleId: row.budgetCycleId,
    details: { messageId: message.id, side, characters: body.length },
  });

  // AC-59: the other side is emailed; never the person who wrote it.
  const [author] = await tx
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, actor.id));
  const [cycle] = await tx
    .select({ name: budgetCycles.name })
    .from(budgetCycles)
    .where(eq(budgetCycles.id, row.budgetCycleId));
  const m = emailCopy.annual.message;
  const about = [row.departmentNameSnapshot, cycle.name, row.referenceNumber ?? ""] as const;
  const toDepartment = side === "accountant";
  const recipients = (
    toDepartment
      ? await departmentRepresentatives(tx, row.departmentId)
      : await accountantRecipients(tx, now)
  ).filter((r) => r.userId !== actor.id);
  await queueNotice(tx, {
    template: toDepartment ? "annual.message.department" : "annual.message.accountant",
    audience: toDepartment ? "requester" : "accountant",
    to: recipients,
    budgetRequestId: row.id,
    cycleId: row.budgetCycleId,
    now,
    content: {
      subject: toDepartment ? m.subjectToDepartment(...about) : m.subjectToAccountant(...about),
      heading: m.heading,
      status: emailCopy.annual.statuses.message,
      paragraphs: [m.intro(author?.name ?? "")],
      facts: [
        { label: emailCopy.annual.facts.reference, value: row.referenceNumber ?? "" },
        { label: emailCopy.annual.facts.department, value: row.departmentNameSnapshot },
      ],
      note: { label: m.label, text: body },
      action: m.action,
      button: {
        label: m.button,
        href: appUrl(
          toDepartment ? `/annual/${row.id}#messages` : `/annual/review/${row.id}#messages`,
        ),
      },
    },
  });

  const result: SendResult = { messageId: message.id, sentAt: now.toISOString() };
  await tx.insert(idempotencyKeys).values({
    key,
    userId: actor.id,
    action: "annual.message_send",
    entityId: row.id,
    result,
  });
  return result;
}

// ---------------------------------------------------------------- reading

export type ThreadMessage = {
  id: string;
  authorName: string;
  side: MessageSide;
  mine: boolean;
  body: string;
  at: Date;
};

export type Thread = {
  messages: ThreadMessage[];
  /** The viewer may write (the department's leaders, or the accountant's side). */
  canSend: boolean;
  /** Which side the viewer writes as, for "Sends an email to …". */
  side: MessageSide | null;
  /** The request is still a draft: nothing to write to the accountant about yet. */
  draft: boolean;
};

/** A request's thread, oldest first, or null when the viewer may not read it. */
export async function getThread(
  tx: Tx,
  viewer: Subject,
  requestId: string,
): Promise<Thread | null> {
  const row = await loadRequest(tx, requestId).catch(() => null);
  if (!row) return null;
  const ctx = { departmentId: row.departmentId, annualStatus: row.status };
  if (!authorize(viewer, "annual.messages_view", ctx).allowed) return null;
  const send = authorize(viewer, "annual.message_send", ctx);
  const rows = await tx
    .select({
      id: requestMessages.id,
      authorId: requestMessages.authorUserId,
      authorName: users.displayName,
      actingRole: requestMessages.actingRole,
      body: requestMessages.body,
      at: requestMessages.createdAt,
    })
    .from(requestMessages)
    .innerJoin(users, eq(users.id, requestMessages.authorUserId))
    .where(eq(requestMessages.budgetRequestId, row.id))
    .orderBy(asc(requestMessages.createdAt));
  return {
    messages: rows.map((m) => ({
      id: m.id,
      authorName: m.authorName,
      side: sideOf(m.actingRole),
      mine: m.authorId === viewer.id,
      body: m.body,
      at: m.at,
    })),
    canSend: send.allowed && row.status !== "draft",
    side: send.allowed ? sideOf(send.actingRole) : null,
    draft: row.status === "draft",
  };
}

async function markRead(tx: Tx, userId: string, requestId: string, at: Date) {
  await tx
    .insert(requestMessageReads)
    .values({ userId, budgetRequestId: requestId, lastReadAt: at })
    .onConflictDoUpdate({
      target: [requestMessageReads.userId, requestMessageReads.budgetRequestId],
      set: { lastReadAt: sql`greatest(${requestMessageReads.lastReadAt}, excluded.last_read_at)` },
    });
}

/** The viewer has read the thread (called when it's shown). Not audited: it's not a change. */
export async function markThreadRead(
  tx: Tx,
  viewer: Subject,
  requestId: string,
  now: Date = new Date(),
): Promise<void> {
  const row = await loadRequest(tx, requestId).catch(() => null);
  if (!row) return;
  const ctx = { departmentId: row.departmentId, annualStatus: row.status };
  if (!authorize(viewer, "annual.messages_view", ctx).allowed) return;
  await markRead(tx, viewer.id, row.id, now);
}

/** Messages from others the viewer hasn't read, per request (DRD 6.11a unread count). */
export async function unreadCounts(
  tx: Tx,
  viewer: Subject,
  requestIds: string[],
): Promise<Map<string, number>> {
  if (requestIds.length === 0) return new Map();
  const rows = await tx
    .select({ requestId: requestMessages.budgetRequestId, n: count() })
    .from(requestMessages)
    .leftJoin(
      requestMessageReads,
      and(
        eq(requestMessageReads.budgetRequestId, requestMessages.budgetRequestId),
        eq(requestMessageReads.userId, viewer.id),
      ),
    )
    .where(
      and(
        inArray(requestMessages.budgetRequestId, requestIds),
        ne(requestMessages.authorUserId, viewer.id),
        or(
          isNull(requestMessageReads.lastReadAt),
          gt(requestMessages.createdAt, requestMessageReads.lastReadAt),
        ),
      ),
    )
    .groupBy(requestMessages.budgetRequestId);
  return new Map(rows.map((r) => [r.requestId, r.n]));
}
