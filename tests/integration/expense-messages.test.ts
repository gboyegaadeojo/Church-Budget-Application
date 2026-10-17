import { randomUUID } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emailOutbox, expenseMessages } from "@/db/schema";
import type { Db } from "@/db/types";
import { RuleError } from "@/domain/errors";
import { getExpenseThread, sendExpenseMessage } from "@/domain/expenses/messages";
import { saveExpenseDraft, startExpense } from "@/domain/expenses/service";
import { ForbiddenError } from "@/lib/authz";
import { createTestDb, type TestDb } from "./helpers/db";
import { expenseWorld, person, PURCHASE, submitted } from "./helpers/expenses";

/** Messages on an expense (6B.4). */

let t: TestDb;
let db: Db;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t?.close();
});

const send = (actor: Parameters<typeof sendExpenseMessage>[1], expenseId: string, body: string) =>
  db.transaction((tx) =>
    sendExpenseMessage(tx, actor, { expenseId, body, idempotencyKey: randomUUID() }),
  );

async function recipientsOf(expenseId: string, template: string) {
  const rows = await db
    .select({ to: emailOutbox.toEmail })
    .from(emailOutbox)
    .where(
      and(eq(emailOutbox.expenseSubmissionId, expenseId), like(emailOutbox.template, template)),
    );
  return rows.map((r) => r.to);
}

describe("messages on an expense (6B.4)", () => {
  it("emails every other side, never the writer, and shows the thread to each", async () => {
    const world = await expenseWorld(db);
    const leader = await person(db, ["requester"], [world.media.id]);
    const { expenseId: id } = await submitted(db, world, "purchase_request");

    await send(world.requester, id, "Can we buy it this week? https://example.org/mic");
    expect(await recipientsOf(id, "expenses.message.accountant")).toContain(world.accountant.email);
    expect(await recipientsOf(id, "expenses.message.board")).toContain(world.chair.email);
    // The writer's own side isn't emailed about their own message.
    expect(await recipientsOf(id, "expenses.message.department")).toEqual([]);

    await send(world.accountant, id, "Yes, once the Board Chair approves too.");
    const department = await recipientsOf(id, "expenses.message.department");
    expect(department).toEqual(expect.arrayContaining([world.requester.email, leader.email]));
    expect(department).not.toContain(world.accountant.email);
    // The office hears only once it's theirs to process.
    expect(await recipientsOf(id, "expenses.message.office")).toEqual([]);

    const thread = await getExpenseThread(db, world.chair, id);
    expect(thread?.messages.map((m) => [m.side, m.mine])).toEqual([
      ["department", false],
      ["accountant", false],
    ]);
    expect(thread?.canSend).toBe(true);
  });

  it("refuses a draft, an empty message, and people who can't see the expense", async () => {
    const world = await expenseWorld(db);
    const draft = await db.transaction(async (tx) => {
      const { expenseId } = await startExpense(tx, world.requester, {
        type: "purchase_request",
        departmentId: world.media.id,
        cycleId: world.cycle.id,
      });
      await saveExpenseDraft(tx, world.requester, { id: expenseId, version: 1, ...PURCHASE });
      return expenseId;
    });
    await expect(send(world.requester, draft, "Hello")).rejects.toThrow(RuleError);

    const { expenseId: id } = await submitted(db, world, "purchase_request");
    await expect(send(world.requester, id, "   ")).rejects.toThrow();
    const stranger = await person(db, ["requester"], []);
    await expect(send(stranger, id, "Hi")).rejects.toThrow(ForbiddenError);
    const admin = await person(db, ["system_admin"]);
    await expect(send(admin, id, "Hi")).rejects.toThrow(ForbiddenError);
    expect((await getExpenseThread(db, admin, id))?.canSend).toBe(false);
  });

  it("can't be changed or deleted", async () => {
    const world = await expenseWorld(db);
    const { expenseId: id } = await submitted(db, world, "purchase_request");
    const { messageId } = await send(world.requester, id, "Original");
    await expect(
      db.update(expenseMessages).set({ body: "Changed" }).where(eq(expenseMessages.id, messageId)),
    ).rejects.toThrow();
    await expect(
      db.delete(expenseMessages).where(eq(expenseMessages.id, messageId)),
    ).rejects.toThrow();
  });
});
