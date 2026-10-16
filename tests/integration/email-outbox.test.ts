import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appSettings,
  budgetRequests,
  emailOutbox,
  userDepartments,
  userRoles,
  users,
} from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import type { DecisionInput } from "@/domain/annual/decision";
import { decideRequest, reopenRequest, startReview } from "@/domain/annual/review";
import type { RequestContentInput } from "@/domain/annual/schema";
import { reviseRequest, saveDraft, startRequest, submitRequest } from "@/domain/annual/service";
import { requestEmails } from "@/domain/notifications/history";
import { loadViewer } from "@/domain/users/viewer";
import { FakeEmailSender } from "@/lib/email/fake";
import { deliverOutbox, MAX_ATTEMPTS, trackQueuedEmails } from "@/lib/email/outbox";
import type { Subject } from "@/lib/authz";
import { createTestDb, expectRejected, type TestDb } from "./helpers/db";
import { insertCycle, insertDepartment, insertUser } from "./helpers/fixtures";

const NOW = new Date("2026-10-20T17:00:00Z");

let t: TestDb;
let db: Db;
let accountant: Subject;
let otherAccountant: Subject;
let churchAdmin: Subject;
let cycleId: string;

const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

async function person(role: "accountant" | "requester" | "system_admin" | "church_admin") {
  const row = await insertUser(db, {
    accessStatus: role === "requester" ? "pending_department" : "active",
    pcoLeaderVerified: role === "requester",
    pcoVerifiedAt: NOW,
  });
  await db.insert(userRoles).values({ userId: row.id, role });
  return { id: row.id, email: row.email, roles: [role], departments: [] } as Subject & {
    email: string;
  };
}

async function fresh(subject: Subject): Promise<Subject> {
  const result = await loadViewer(db, subject.id);
  if (!result.ok) throw new Error(`No viewer: ${result.reason}`);
  return result.viewer;
}

const CONTENT: RequestContentInput = {
  title: "Sound desk",
  justification: "The old one hums.",
  lines: [{ name: "Mixer", quantity: "1", unitPrice: "1,025.00" }],
};

/** A department with a Primary and a second representative, and its submitted request. */
async function submitted() {
  const leader = await person("requester");
  const dept = await insertDepartment(db);
  const { requestId } = await run((tx) =>
    startRequest(tx, leader, { cycleId, departmentId: dept.id }),
  );
  const second = await insertUser(db, { accessStatus: "active" });
  await db.insert(userRoles).values({ userId: second.id, role: "requester" });
  await db.insert(userDepartments).values({ userId: second.id, departmentId: dept.id });
  const me = await fresh(leader);
  const saved = await run((tx) => saveDraft(tx, me, { id: requestId, version: 1, ...CONTENT }));
  await run((tx) =>
    submitRequest(
      tx,
      me,
      { id: requestId, version: saved.version, idempotencyKey: randomUUID() },
      { now: NOW },
    ),
  );
  return { me, leader, second, dept, requestId };
}

async function emailsFor(requestId: string, template?: string) {
  return db
    .select()
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.budgetRequestId, requestId),
        template ? eq(emailOutbox.template, template) : undefined,
      ),
    );
}

async function version(id: string) {
  const [row] = await db.select().from(budgetRequests).where(eq(budgetRequests.id, id));
  return row.version;
}

async function decide(id: string, decision: DecisionInput) {
  const v = await version(id);
  return run((tx) =>
    decideRequest(
      tx,
      accountant,
      { id, version: v, idempotencyKey: randomUUID(), decision },
      { now: NOW },
    ),
  );
}

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  const admin = await person("system_admin");
  accountant = await person("accountant");
  otherAccountant = await person("accountant");
  churchAdmin = await person("church_admin");
  cycleId = (await insertCycle(db, admin.id)).id;
  await db.insert(appSettings).values({ key: "primary_accountant_user_id", value: accountant.id });
});

afterAll(async () => {
  await t?.close();
});

describe("request lifecycle emails (FR-11, FR-21, AC-56, AC-58)", () => {
  it("submitting emails a receipt to every representative and a notice to the Primary accountant", async () => {
    const { leader, second, requestId } = await submitted();

    const receipts = await emailsFor(requestId, "annual.submitted.receipt");
    expect(receipts.map((e) => e.toUserId).sort()).toEqual([leader.id, second.id].sort());
    const receipt = receipts[0];
    expect(receipt.status).toBe("pending");
    expect(receipt.audience).toBe("requester");
    expect(receipt.subject).toMatch(/^Budget received: Department-\d+ FY2027 \(IFC-2027-\d{4}\)$/);
    for (const body of [receipt.textBody, receipt.htmlBody]) {
      expect(body).toContain("$1,025.00");
      expect(body).toContain("$123.00");
      expect(body).toContain("$1,148.00");
      expect(body).toContain("Mixer");
      expect(body).toContain(`/annual/${requestId}`);
    }
    expect(receipt.textBody).toContain("You can still change it 2 more times");

    const notices = await emailsFor(requestId, "annual.submitted.accountant");
    expect(notices.map((e) => e.toUserId)).toEqual([accountant.id]);
    expect(notices[0].textBody).toContain(`/annual/review/${requestId}`);
  });

  it("emails every accountant while no Primary is chosen", async () => {
    await db
      .update(appSettings)
      .set({ value: "" })
      .where(eq(appSettings.key, "primary_accountant_user_id"));
    try {
      const { requestId } = await submitted();
      const notices = await emailsFor(requestId, "annual.submitted.accountant");
      expect(notices.map((e) => e.toUserId).sort()).toEqual(
        [accountant.id, otherAccountant.id].sort(),
      );
    } finally {
      await db
        .update(appSettings)
        .set({ value: accountant.id })
        .where(eq(appSettings.key, "primary_accountant_user_id"));
    }
  });

  it("doesn't email a representative who can't sign in", async () => {
    const { second, requestId } = await submitted();
    await db.update(users).set({ active: false }).where(eq(users.id, second.id));
    await run((tx) => startReview(tx, accountant, { id: requestId }));
    const started = await emailsFor(requestId, "annual.review_started");
    expect(started.map((e) => e.toUserId)).not.toContain(second.id);
    expect(started).toHaveLength(1);
  });

  it("a revision tells the accountant what changed and the department how many edits are left", async () => {
    const { me, requestId } = await submitted();
    const v = await version(requestId);
    await run((tx) =>
      reviseRequest(tx, me, {
        id: requestId,
        version: v,
        idempotencyKey: randomUUID(),
        ...CONTENT,
        lines: [{ name: "Mixer", quantity: "2", unitPrice: "1,025.00" }],
      }),
    );
    const [notice] = await emailsFor(requestId, "annual.revised.accountant");
    expect(notice.subject).toMatch(/^Budget changed: /);
    expect(notice.textBody).toContain("Mixer: 1 × $1,025.00 → 2 × $1,025.00");
    expect(notice.textBody).toContain("Total $1,148.00 → $2,296.00");
    const receipts = await emailsFor(requestId, "annual.revised.receipt");
    expect(receipts).toHaveLength(2);
    expect(receipts[0].textBody).toContain("You can still change it 1 more time before");
  });

  it("returning sends the question; the answer goes back to the accountant", async () => {
    const { me, requestId } = await submitted();
    await decide(requestId, { kind: "return", note: "Which model of mixer?" });
    const returned = await emailsFor(requestId, "annual.returned");
    expect(returned).toHaveLength(2);
    expect(returned[0].textBody).toContain("Which model of mixer?");
    expect(returned[0].textBody).toContain(`/annual/${requestId}/edit`);
    expect(await emailsFor(requestId, "annual.returned.accountant")).toHaveLength(1);

    const v = await version(requestId);
    await run((tx) =>
      reviseRequest(tx, me, {
        id: requestId,
        version: v,
        idempotencyKey: randomUUID(),
        ...CONTENT,
        justification: "The Yamaha MG10.",
      }),
    );
    const [answer] = await emailsFor(requestId, "annual.answered.accountant");
    expect(answer.subject).toMatch(/^Clarification answered: /);
    expect(answer.textBody).toContain("Justification changed");
    expect(await emailsFor(requestId, "annual.answered.receipt")).toHaveLength(2);
  });

  it("AC-56 FR-19 an approval shows requested and approved, the difference and that the approved total is authorized", async () => {
    const { requestId } = await submitted();
    await decide(requestId, {
      kind: "approve_different_amount",
      approvedTotal: "1,000.00",
      note: "Board approved a lower amount.",
      boardReference: "Minutes Nov 12",
    });
    const approvals = await emailsFor(requestId, "annual.approved");
    expect(approvals).toHaveLength(2);
    const text = approvals[0].textBody;
    expect(approvals[0].subject).toMatch(/^Budget approved: /);
    expect(text).toContain("Status: Approved");
    expect(text).toContain("Total (incl. tax): Requested $1,148.00 · Approved $1,000.00");
    expect(text).toContain("Subtotal: Requested $1,025.00 · Approved $892.86");
    expect(text).toContain("Difference: $148.00 less than requested");
    expect(text).toContain("amount authorized");
    expect(text).toContain("Board approved a lower amount.");
    expect(text).toContain("Minutes Nov 12");
    expect(text).toContain("Approved items:");

    expect(await emailsFor(requestId, "annual.approved.accountant")).toHaveLength(1);
    const [admin] = await emailsFor(requestId, "annual.approved.church_admin");
    expect(admin.toUserId).toBe(churchAdmin.id);
    expect(admin.subject).toMatch(/^New budget available: /);
  });

  it("declining sends the reason; reopening says what is now allowed", async () => {
    const { requestId } = await submitted();
    await decide(requestId, { kind: "decline", note: "Not this year." });
    const [declined] = await emailsFor(requestId, "annual.declined");
    expect(declined.textBody).toContain("Not this year.");
    expect(declined.textBody).toContain("Status: Declined");

    const v = await version(requestId);
    await run((tx) =>
      reopenRequest(
        tx,
        accountant,
        { id: requestId, version: v, idempotencyKey: randomUUID(), reason: "Board reconsidered." },
        { now: NOW },
      ),
    );
    const reopened = await emailsFor(requestId, "annual.reopened");
    expect(reopened).toHaveLength(2);
    expect(reopened[0].textBody).toContain("Board reconsidered.");
    expect(reopened[0].textBody).toContain("doesn't use one of your changes");
    expect(await emailsFor(requestId, "annual.reopened.accountant")).toHaveLength(1);
  });

  it("a refused action queues nothing, and a repeated submit doesn't email twice", async () => {
    const { me, requestId } = await submitted();
    const before = (await emailsFor(requestId)).length;
    await expect(
      run((tx) =>
        submitRequest(
          tx,
          me,
          { id: requestId, version: 99, idempotencyKey: randomUUID() },
          { now: NOW },
        ),
      ),
    ).rejects.toThrow();
    await expect(
      decide(requestId, { kind: "decline", note: "" } as DecisionInput),
    ).rejects.toThrow();
    expect((await emailsFor(requestId)).length).toBe(before);
  });

  it("the department's history lists only the emails sent to it", async () => {
    const { requestId } = await submitted();
    const all = await run((tx) => requestEmails(tx, requestId));
    const mine = await run((tx) => requestEmails(tx, requestId, ["requester"]));
    expect(all).toHaveLength(3);
    expect(mine).toHaveLength(2);
    expect(mine.every((e) => e.subject.startsWith("Budget received"))).toBe(true);
    expect(mine[0]).toMatchObject({ status: "pending", sentAt: null });
  });

  it("counts the emails an action queued, so it can send them after commit", async () => {
    const leader = await person("requester");
    const dept = await insertDepartment(db);
    const { requestId } = await run((tx) =>
      startRequest(tx, leader, { cycleId, departmentId: dept.id }),
    );
    const me = await fresh(leader);
    const saved = await trackQueuedEmails(() =>
      run((tx) => saveDraft(tx, me, { id: requestId, version: 1, ...CONTENT })),
    );
    expect(saved.queued).toBe(0);
    const sent = await trackQueuedEmails(() =>
      run((tx) =>
        submitRequest(
          tx,
          me,
          { id: requestId, version: saved.result.version, idempotencyKey: randomUUID() },
          { now: NOW },
        ),
      ),
    );
    expect(sent.queued).toBe(2);
  });
});

describe("delivery (CLAUDE.md constraint 7)", () => {
  /** Delivers only this request's emails, so other tests' rows don't interfere. */
  async function deliver(sender: FakeEmailSender, requestId: string, now: Date) {
    const ids = (await emailsFor(requestId)).map((e) => e.id);
    return deliverOutbox(db, sender, { now, ids });
  }

  it("sends each email once and records it", async () => {
    const { requestId } = await submitted();
    const sender = new FakeEmailSender();
    expect(await deliver(sender, requestId, NOW)).toEqual({ sent: 3, retrying: 0, failed: 0 });
    expect(await deliver(sender, requestId, NOW)).toEqual({ sent: 0, retrying: 0, failed: 0 });
    expect(sender.sent).toHaveLength(3);
    const rows = await emailsFor(requestId);
    expect(rows.every((r) => r.status === "sent" && r.attempts === 1 && r.sentAt)).toBe(true);
    expect(rows[0].providerMessageId).toBe(`fake-${rows[0].id}`);
    const history = await run((tx) => requestEmails(tx, requestId, ["requester"]));
    expect(history[0].status).toBe("sent");
  });

  it("a temporary failure waits and tries again; a refusal is marked failed", async () => {
    const { requestId } = await submitted();
    const sender = new FakeEmailSender().answerNext(
      { kind: "retry", error: "Resend 429 rate_limit_exceeded: slow down" },
      { kind: "failed", error: "Resend 422 validation_error: Invalid `to`" },
    );
    expect(await deliver(sender, requestId, NOW)).toEqual({ sent: 1, retrying: 1, failed: 1 });
    const waiting = (await emailsFor(requestId)).find((r) => r.status === "pending")!;
    expect(waiting.lastError).toContain("429");
    expect(waiting.nextAttemptAt.getTime()).toBe(NOW.getTime() + 60_000);
    expect((await emailsFor(requestId)).find((r) => r.status === "failed")!.lastError).toContain(
      "422",
    );

    // Not due yet, then due.
    expect(await deliver(sender, requestId, new Date(NOW.getTime() + 30_000))).toEqual({
      sent: 0,
      retrying: 0,
      failed: 0,
    });
    expect(await deliver(sender, requestId, new Date(NOW.getTime() + 61_000))).toEqual({
      sent: 1,
      retrying: 0,
      failed: 0,
    });
  });

  it(`gives up after ${MAX_ATTEMPTS} tries`, async () => {
    const { requestId } = await submitted();
    const [row] = await emailsFor(requestId, "annual.submitted.accountant");
    await db
      .update(emailOutbox)
      .set({ attempts: MAX_ATTEMPTS - 1 })
      .where(eq(emailOutbox.id, row.id));
    const sender = new FakeEmailSender().answerNext({ kind: "retry", error: "Resend 503" });
    expect(await deliverOutbox(db, sender, { now: NOW, ids: [row.id] })).toEqual({
      sent: 0,
      retrying: 0,
      failed: 1,
    });
  });

  it("picks up an email a stopped server left half-sent", async () => {
    const { requestId } = await submitted();
    const [row] = await emailsFor(requestId, "annual.submitted.accountant");
    await db
      .update(emailOutbox)
      .set({ status: "sending", attempts: 1, lastAttemptAt: NOW })
      .where(eq(emailOutbox.id, row.id));
    const sender = new FakeEmailSender();
    const soon = await deliverOutbox(db, sender, {
      now: new Date(NOW.getTime() + 60_000),
      ids: [row.id],
    });
    expect(soon.sent).toBe(0);
    const later = await deliverOutbox(db, sender, {
      now: new Date(NOW.getTime() + 11 * 60_000),
      ids: [row.id],
    });
    expect(later.sent).toBe(1);
  });

  it("never deletes an email", async () => {
    const { requestId } = await submitted();
    await expectRejected(
      db.delete(emailOutbox).where(eq(emailOutbox.budgetRequestId, requestId)),
      "append-only",
    );
  });

  it("a send failure never undoes the change", async () => {
    const { requestId } = await submitted();
    const sender = new FakeEmailSender();
    sender.send = async () => {
      throw new Error("boom");
    };
    const summary = await deliver(sender, requestId, NOW);
    expect(summary.retrying).toBe(3);
    const [row] = await db.select().from(budgetRequests).where(eq(budgetRequests.id, requestId));
    expect(row.status).toBe("submitted");
  });
});
