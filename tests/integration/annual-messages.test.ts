import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditEvents,
  budgetRequests,
  emailOutbox,
  requestMessages,
  userDepartments,
  userRoles,
} from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import type { DecisionInput } from "@/domain/annual/decision";
import {
  getThread,
  MESSAGES_PER_DAY,
  sendMessage,
  unreadCounts,
  markThreadRead,
} from "@/domain/annual/messages";
import { listMyRequests } from "@/domain/annual/queries";
import { decideRequest } from "@/domain/annual/review";
import { getReviewDashboard } from "@/domain/annual/review-queries";
import type { RequestContentInput } from "@/domain/annual/schema";
import { saveDraft, startRequest, submitRequest } from "@/domain/annual/service";
import { RuleError, ValidationError } from "@/domain/errors";
import { loadViewer } from "@/domain/users/viewer";
import { ForbiddenError, type Subject } from "@/lib/authz";
import { createTestDb, expectRejected, type TestDb } from "./helpers/db";
import { insertCycle, insertDepartment, insertUser } from "./helpers/fixtures";

/* Request messages (FR-31, AC-59, DRD 6.11a). */

const NOW = new Date("2026-10-20T17:00:00Z");

let t: TestDb;
let db: Db;
let admin: Subject;
let accountant: Subject;
let cycleId: string;

const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

async function person(role: "accountant" | "requester" | "system_admin" | "board_chair") {
  const row = await insertUser(db, {
    accessStatus: role === "requester" ? "pending_department" : "active",
    pcoLeaderVerified: role === "requester",
    pcoVerifiedAt: NOW,
  });
  await db.insert(userRoles).values({ userId: row.id, role });
  return { id: row.id, roles: [role], departments: [] } as Subject;
}

async function fresh(subject: Subject): Promise<Subject> {
  const result = await loadViewer(db, subject.id);
  if (!result.ok) throw new Error(`No viewer: ${result.reason}`);
  return result.viewer;
}

const CONTENT: RequestContentInput = {
  title: "Microphones",
  justification: "Every small group needs one.",
  lines: [{ name: "Microphone", quantity: "2", unitPrice: "100.00" }],
};

/** A department with two leaders and a request; submitted unless `draft`. */
async function request({ draft = false } = {}) {
  const leader = await person("requester");
  const dept = await insertDepartment(db);
  const { requestId } = await run((tx) =>
    startRequest(tx, leader, { cycleId, departmentId: dept.id }),
  );
  const other = await insertUser(db, { accessStatus: "active", pcoLeaderVerified: true });
  await db.insert(userRoles).values({ userId: other.id, role: "requester" });
  await db
    .insert(userDepartments)
    .values({ userId: other.id, departmentId: dept.id, representativeType: "representative" });
  const me = await fresh(leader);
  const saved = await run((tx) => saveDraft(tx, me, { id: requestId, version: 1, ...CONTENT }));
  if (!draft) {
    await run((tx) =>
      submitRequest(
        tx,
        me,
        { id: requestId, version: saved.version, idempotencyKey: randomUUID() },
        { now: NOW },
      ),
    );
  }
  return { me: await fresh(leader), otherId: other.id, dept, requestId };
}

const send = (who: Subject, requestId: string, body: string, now = NOW, key = randomUUID()) =>
  run((tx) => sendMessage(tx, who, { requestId, body, idempotencyKey: key }, { now }));

const emails = (requestId: string, template: string) =>
  db
    .select()
    .from(emailOutbox)
    .where(and(eq(emailOutbox.budgetRequestId, requestId), eq(emailOutbox.template, template)));

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  admin = await person("system_admin");
  accountant = await person("accountant");
  cycleId = (await insertCycle(db, admin.id)).id;
});

afterAll(async () => {
  await t?.close();
});

describe("sending (FR-31, AC-59)", () => {
  it("AC-59 the accountant's message emails every representative; a reply emails the accountant", async () => {
    const { me, otherId, requestId } = await request();
    await send(accountant, requestId, "Which brand of microphone?");
    const toDepartment = await emails(requestId, "annual.message.department");
    expect(toDepartment.map((e) => e.toUserId).sort()).toEqual([me.id, otherId].sort());
    expect(toDepartment[0].textBody).toContain("Which brand of microphone?");

    await send(me, requestId, "Shure SM58, see https://www.shure.com/sm58");
    const toAccountant = await emails(requestId, "annual.message.accountant");
    expect(toAccountant.map((e) => e.toUserId)).toEqual([accountant.id]);

    // Both are on the thread, in order, with their side, and in the history.
    const thread = await run((tx) => getThread(tx, me, requestId));
    expect(thread!.messages.map((m) => [m.side, m.mine])).toEqual([
      ["accountant", false],
      ["department", true],
    ]);
    expect(thread).toMatchObject({ canSend: true, side: "department" });
    const audits = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, "annual.message_sent"),
          eq(auditEvents.budgetRequestId, requestId),
        ),
      );
    expect(audits).toHaveLength(2);
  });

  it("doesn't change the request, its status or its edits", async () => {
    const { me, requestId } = await request();
    const [before] = await db.select().from(budgetRequests).where(eq(budgetRequests.id, requestId));
    await send(me, requestId, "A question before you start.");
    const [after] = await db.select().from(budgetRequests).where(eq(budgetRequests.id, requestId));
    expect(after).toMatchObject({
      status: before.status,
      version: before.version,
      editCount: before.editCount,
    });
  });

  it("stays open after a decision", async () => {
    const { me, requestId } = await request();
    const [{ version }] = await db
      .select({ version: budgetRequests.version })
      .from(budgetRequests)
      .where(eq(budgetRequests.id, requestId));
    const decision: DecisionInput = { kind: "approve_as_requested" };
    await run((tx) =>
      decideRequest(
        tx,
        accountant,
        { id: requestId, version, idempotencyKey: randomUUID(), decision },
        { now: NOW },
      ),
    );
    await expect(send(me, requestId, "Can we buy them from Long & McQuade?")).resolves.toBeTruthy();
  });

  it("refuses empty or over-long text, a draft, and a double click sends one", async () => {
    const { me, requestId } = await request();
    await expect(send(me, requestId, "   ")).rejects.toBeInstanceOf(ValidationError);
    await expect(send(me, requestId, "x".repeat(2001))).rejects.toBeInstanceOf(ValidationError);
    const key = randomUUID();
    const first = await send(me, requestId, "Hello", NOW, key);
    expect(await send(me, requestId, "Hello", NOW, key)).toEqual(first);
    const rows = await db
      .select()
      .from(requestMessages)
      .where(eq(requestMessages.budgetRequestId, requestId));
    expect(rows).toHaveLength(1);

    const draft = await request({ draft: true });
    await expect(send(draft.me, draft.requestId, "Hello")).rejects.toBeInstanceOf(RuleError);
  });

  it("only the department and the accountant's side may write; the administrator reads", async () => {
    const { requestId } = await request();
    // A leader of another department.
    const stranger = await person("requester");
    const chair = await person("board_chair");
    for (const who of [stranger, chair, admin]) {
      await expect(send(who, requestId, "Hi")).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await run((tx) => getThread(tx, stranger, requestId))).toBeNull();
    expect(await run((tx) => getThread(tx, chair, requestId))).toBeNull();
    expect(await run((tx) => getThread(tx, admin, requestId))).toMatchObject({ canSend: false });
  });

  it("messages can't be edited or deleted", async () => {
    const { me, requestId } = await request();
    const { messageId } = await send(me, requestId, "Original");
    await expectRejected(
      db.update(requestMessages).set({ body: "Changed" }).where(eq(requestMessages.id, messageId)),
      "append-only",
    );
    await expectRejected(
      db.delete(requestMessages).where(eq(requestMessages.id, messageId)),
      "append-only",
    );
  });

  it(`stops at ${MESSAGES_PER_DAY} a day per person, to protect the email quota`, async () => {
    const { me, requestId } = await request();
    for (let i = 0; i < MESSAGES_PER_DAY; i++) await send(me, requestId, `Message ${i}`);
    await expect(send(me, requestId, "One more")).rejects.toBeInstanceOf(RuleError);
    const tomorrow = new Date(NOW.getTime() + 86_400_000 + 1000);
    await expect(send(me, requestId, "Next day", tomorrow)).resolves.toBeTruthy();
  });
});

describe("unread counts (DRD 6.11a)", () => {
  it("counts the other side's messages until the thread is read", async () => {
    const { me, requestId } = await request();
    await send(accountant, requestId, "First question");
    await send(accountant, requestId, "Second question");
    expect((await run((tx) => unreadCounts(tx, me, [requestId]))).get(requestId)).toBe(2);
    const mine = await run((tx) => listMyRequests(tx, me));
    expect(mine.find((r) => r.id === requestId)!.unreadMessages).toBe(2);
    // The accountant's own messages aren't unread for them.
    expect((await run((tx) => unreadCounts(tx, accountant, [requestId]))).get(requestId)).toBe(
      undefined,
    );

    await run((tx) => markThreadRead(tx, me, requestId, new Date(NOW.getTime() + 60_000)));
    expect((await run((tx) => unreadCounts(tx, me, [requestId]))).get(requestId)).toBe(undefined);

    // A reply shows on the accountant's queue until they open it.
    await send(me, requestId, "Answer", new Date(NOW.getTime() + 120_000));
    const dashboard = await run((tx) => getReviewDashboard(tx, accountant, { cycleId }));
    expect(dashboard!.queue.find((r) => r.requestId === requestId)!.unreadMessages).toBe(1);
  });
});
