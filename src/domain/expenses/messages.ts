import { and, asc, count, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { expenseEmailCopy as x } from "@/copy/expense-email";
import { expensesCopy } from "@/copy/expenses";
import { expenseMessages, idempotencyKeys, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { actorOf, parseKey, previousResult } from "@/domain/annual/service";
import { parseInput, RuleError } from "@/domain/errors";
import { emailBrand } from "@/domain/notifications/notice";
import { accountantRecipients, boardCover, usersWithRole } from "@/domain/notifications/recipients";
import { writeAudit } from "@/lib/audit";
import { assertCan, authorize, type Subject } from "@/lib/authz";
import { appUrl } from "@/lib/email/layout";
import { enqueueEmail, type Recipient } from "@/lib/email/outbox";
import type { Role } from "@/lib/roles";
import { requesterGroup } from "./emails";
import { auditBase, authzContextOf, loadExpense } from "./service";

/**
 * Messages on an expense (6B.4 "history, messages"): questions and answers between the
 * department (its leaders, or the Expense submitter who submitted it), the accountant,
 * the board and the Church Administrator. Plain text up to 2,000 characters; links show as
 * links. Each message emails the other sides through the outbox, is audited, and can't be
 * changed or deleted. A message never changes the expense: a return for clarification is
 * still how a change is asked for.
 */

const e = expensesCopy.errors;
export const EXPENSE_MESSAGE_MAX = 2000;
/** Per person per day, so a long conversation can't use up the free email quota. */
export const EXPENSE_MESSAGES_PER_DAY = 30;
const DAY_MS = 86_400_000;

export type ExpenseMessageSide = "department" | "accountant" | "board" | "office";

export function sideOf(role: Role): ExpenseMessageSide {
  if (role === "requester") return "department";
  if (role === "board_chair" || role === "vice_chair") return "board";
  if (role === "church_admin") return "office";
  return "accountant";
}

const bodySchema = z
  .string({ error: e.messageEmpty })
  .trim()
  .min(1, e.messageEmpty)
  .max(EXPENSE_MESSAGE_MAX, e.messageTooLong);

export type SendExpenseMessageResult = { messageId: string; sentAt: string };

export async function sendExpenseMessage(
  tx: Tx,
  actor: Subject,
  input: { expenseId: string; body: unknown; idempotencyKey: unknown },
  { now = new Date() }: { now?: Date } = {},
): Promise<SendExpenseMessageResult> {
  const key = parseKey(input.idempotencyKey);
  const repeat = await previousResult<SendExpenseMessageResult>(
    tx,
    key,
    actor,
    "expenses.message_send",
  );
  if (repeat) return repeat;

  const row = await loadExpense(tx, input.expenseId);
  const { actingRole } = assertCan(actor, "expense.message_send", authzContextOf(row));
  if (row.status === "draft") throw new RuleError(e.messageDraft);
  const body = parseInput(z.object({ body: bodySchema }), { body: input.body }).body;

  const [{ today }] = await tx
    .select({ today: count() })
    .from(expenseMessages)
    .where(
      and(
        eq(expenseMessages.authorUserId, actor.id),
        gte(expenseMessages.createdAt, new Date(now.getTime() - DAY_MS)),
      ),
    );
  if (today >= EXPENSE_MESSAGES_PER_DAY) throw new RuleError(e.messageLimit);

  const [message] = await tx
    .insert(expenseMessages)
    .values({
      expenseSubmissionId: row.id,
      authorUserId: actor.id,
      actingRole,
      body,
      createdAt: now,
    })
    .returning({ id: expenseMessages.id });

  const side = sideOf(actingRole);
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "expenses",
    eventType: "expenses.message_sent",
    ...auditBase(row),
    details: { messageId: message.id, side, characters: body.length },
  });

  // Every other side hears; never the person who wrote it. The office only once it's theirs.
  const sides: { side: ExpenseMessageSide; to: Recipient[]; href: string }[] = [
    {
      side: "department",
      to: await requesterGroup(tx, row),
      href: `/expenses/${row.id}#messages`,
    },
    {
      side: "accountant",
      to: await accountantRecipients(tx, now),
      href: `/expenses/review/${row.id}#messages`,
    },
    {
      side: "board",
      to: (await boardCover(tx, row, now)).recipients,
      href: `/expenses/awaiting-approval/${row.id}#messages`,
    },
    ...(["approved", "processing"].includes(row.status) || side === "office"
      ? [
          {
            side: "office" as const,
            to: await usersWithRole(tx, ["church_admin"]),
            href: `/expenses/${row.id}#messages`,
          },
        ]
      : []),
  ];
  const [author] = await tx
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, actor.id));
  const m = x.message;
  const brand = await emailBrand(tx);
  for (const target of sides) {
    if (target.side === side) continue;
    await enqueueEmail(tx, {
      template: `expenses.message.${target.side}`,
      audience:
        target.side === "department"
          ? "requester"
          : target.side === "office"
            ? "church_admin"
            : target.side,
      to: target.to.filter((r) => r.userId !== actor.id),
      brand,
      expenseSubmissionId: row.id,
      cycleId: row.budgetCycleId,
      now,
      content: {
        subject: m.subject(row.referenceNumber ?? "", row.departmentNameSnapshot),
        heading: m.heading,
        status: m.status,
        paragraphs: [m.intro(author?.name ?? "", expensesCopy.thread.sides[side])],
        facts: [
          { label: x.facts.reference, value: row.referenceNumber ?? "" },
          { label: x.facts.department, value: row.departmentNameSnapshot },
          { label: x.facts.title, value: row.title },
        ],
        note: { label: m.label, text: body },
        action: m.action,
        button: { label: m.button, href: appUrl(target.href) },
      },
    });
  }

  const result: SendExpenseMessageResult = { messageId: message.id, sentAt: now.toISOString() };
  await tx.insert(idempotencyKeys).values({
    key,
    userId: actor.id,
    action: "expenses.message_send",
    entityId: row.id,
    result,
  });
  return result;
}

export type ExpenseThreadMessage = {
  id: string;
  authorName: string;
  side: ExpenseMessageSide;
  mine: boolean;
  body: string;
  at: Date;
};

export type ExpenseThread = {
  messages: ExpenseThreadMessage[];
  canSend: boolean;
  side: ExpenseMessageSide | null;
  draft: boolean;
};

/** An expense's thread, oldest first, or null when the viewer may not see the expense. */
export async function getExpenseThread(
  tx: Tx,
  viewer: Subject,
  expenseId: string,
): Promise<ExpenseThread | null> {
  if (!z.uuid().safeParse(expenseId).success) return null;
  const row = await loadExpense(tx, expenseId).catch(() => null);
  if (!row) return null;
  const ctx = authzContextOf(row);
  if (!authorize(viewer, "expense.view", ctx).allowed) return null;
  const send = authorize(viewer, "expense.message_send", ctx);
  const rows = await tx
    .select({
      id: expenseMessages.id,
      authorId: expenseMessages.authorUserId,
      authorName: users.displayName,
      actingRole: expenseMessages.actingRole,
      body: expenseMessages.body,
      at: expenseMessages.createdAt,
    })
    .from(expenseMessages)
    .innerJoin(users, eq(users.id, expenseMessages.authorUserId))
    .where(eq(expenseMessages.expenseSubmissionId, row.id))
    .orderBy(asc(expenseMessages.createdAt));
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
