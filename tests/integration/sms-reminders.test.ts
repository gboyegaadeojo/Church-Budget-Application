import { randomUUID } from "node:crypto";
import { and, eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appSettings, auditEvents, smsOutbox, userDepartments, users } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { runReminders } from "@/domain/cycles/emails";
import { boardDecide } from "@/domain/expenses/board";
import { runExpenseReminders } from "@/domain/expenses/reminders";
import { accountantDecide } from "@/domain/expenses/review";
import { loadExpense } from "@/domain/expenses/service";
import { refreshPhones } from "@/domain/users/phones";
import { applyVerification } from "@/domain/users/verification";
import { FakePlanningCenterDirectory } from "@/lib/pco";
import { FakeSmsSender } from "@/lib/sms/fake";
import { deliverSmsOutbox, enqueueSms, MONTHLY_LIMIT_REACHED } from "@/lib/sms/outbox";
import { createTestDb, type TestDb } from "./helpers/db";
import { expenseWorld, PURCHASE, submitted } from "./helpers/expenses";
import { insertCycle, insertDepartment, insertUser } from "./helpers/fixtures";

/**
 * Reminder texts (docs/decisions.md 2026-10-18): the deadline, approval, payment and
 * unclaimed-purchase reminders also text people with a Planning Center mobile number, in
 * church daytime, under a monthly cap. Winnipeg: 9:00 a.m. CST is 15:00 UTC.
 */

let t: TestDb;
let db: Db;
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
const TWILIO = { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM: "+12045550000" };

let phoneNumber = 2045551000;
async function givePhone(userId: string): Promise<string> {
  const phone = `+1${++phoneNumber}`;
  await db.update(users).set({ phoneE164: phone }).where(eq(users.id, userId));
  return phone;
}

const textsTo = (phone: string, template: string) =>
  db
    .select()
    .from(smsOutbox)
    .where(and(eq(smsOutbox.toPhone, phone), like(smsOutbox.template, `${template}%`)));

async function act<T>(
  id: string,
  fn: (tx: Tx, input: { id: string; version: number; idempotencyKey: string }) => Promise<T>,
) {
  const row = await loadExpense(db, id);
  return run((tx) => fn(tx, { id, version: row.version, idempotencyKey: randomUUID() }));
}

beforeAll(async () => {
  Object.assign(process.env, TWILIO);
  t = await createTestDb();
  db = t.db;
  // Manitoba keeps UTC−5 all year from Nov 2026 (tzdata 2026e); these tests check winter
  // times (UTC−6), so the church runs on America/Chicago here, which keeps the old rules
  // on any time-zone data (docs/decisions.md 2026-10-22).
  await db
    .insert(appSettings)
    .values({ key: "church_timezone", value: "America/Chicago" })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: "America/Chicago" } });
});

afterAll(async () => {
  for (const key of Object.keys(TWILIO)) delete process.env[key];
  await t?.close();
});

describe("the four reminders text people with a mobile number", () => {
  it("approval: each approver daily, once a day, and nobody without a number", async () => {
    const world = await expenseWorld(db);
    const accountant = await givePhone(world.accountant.id);
    const chair = await givePhone(world.chair.id);
    await submitted(db, world, "purchase_request");
    const day6 = new Date(Date.now() + 6 * 86_400_000);
    await runExpenseReminders(db, day6);
    await runExpenseReminders(db, day6);

    const [toAccountant] = await textsTo(accountant, "expenses.reminder.approval");
    expect(toAccountant.body).toMatch(
      /expenses? (is|are) waiting for your approval\. .*\/expenses\/review Reply STOP/,
    );
    expect(await textsTo(accountant, "expenses.reminder.approval")).toHaveLength(1);
    expect(await textsTo(chair, "expenses.reminder.approval")).toHaveLength(1);
    // The vice-chair has no number: the email goes, no text.
    const viceTexts = await db
      .select()
      .from(smsOutbox)
      .where(eq(smsOutbox.toUserId, world.vice.id));
    expect(viceTexts).toEqual([]);
  });

  it("unclaimed purchase: the requester, after 60 days", async () => {
    const world = await expenseWorld(db);
    const requester = await givePhone(world.requester.id);
    const { expenseId: id } = await submitted(db, world, "purchase_request", {
      ...PURCHASE,
      howBought: "requester_claims",
    });
    await act(id, (tx, input) =>
      accountantDecide(tx, world.accountant, { ...input, decision: { kind: "approve" } }),
    );
    await act(id, (tx, input) =>
      boardDecide(tx, world.chair, { ...input, decision: { kind: "approve" } }),
    );
    await runExpenseReminders(db, new Date(Date.now() + 61 * 86_400_000));
    const [unclaimed] = await textsTo(requester, "expenses.reminder.unclaimed");
    expect(unclaimed.body).toContain("hasn't been bought or claimed yet");
    expect(unclaimed.expenseSubmissionId).toBe(id);
  });

  it("payment: approved but not paid texts the office", async () => {
    const world = await expenseWorld(db);
    const office = await givePhone(world.office.id);
    const { expenseId: id } = await submitted(db, world, "purchase_request");
    for (const [actor, decide] of [
      [world.accountant, accountantDecide],
      [world.chair, boardDecide],
    ] as const) {
      await act(id, (tx, input) => decide(tx, actor, { ...input, decision: { kind: "approve" } }));
    }
    await runExpenseReminders(db, new Date(Date.now() + 15 * 86_400_000));
    const [text] = await textsTo(office, "expenses.reminder.payment");
    expect(text.body).toMatch(/waiting to be paid\. .*\/expenses\/ready/);
  });

  it("annual deadline: the department's leaders at 7 days and 1 day", async () => {
    const owner = await insertUser(db, { accessStatus: "active" });
    const leader = await insertUser(db, { accessStatus: "active" });
    const phone = await givePhone(leader.id);
    const dept = await insertDepartment(db);
    await db
      .insert(userDepartments)
      .values({ userId: leader.id, departmentId: dept.id, representativeType: "primary" });
    await insertCycle(db, owner.id, {
      budgetYear: 2091,
      name: "FY2091",
      submissionDeadline: new Date("2090-11-30T23:00:00Z"),
    });
    await runReminders(db, new Date("2090-11-23T15:00:00Z"));
    await runReminders(db, new Date("2090-11-23T20:00:00Z"));
    await runReminders(db, new Date("2090-11-29T15:00:00Z"));
    const texts = await textsTo(phone, "cycle.reminder");
    expect(texts.map((x) => x.body.match(/due in (\d+ days?)/)![1]).sort()).toEqual([
      "1 day",
      "7 days",
    ]);
    expect(texts.every((x) => x.cycleId !== null)).toBe(true);
  });
});

describe("sending", () => {
  async function queue(userIds: string[], at: Date, template = "test.reminder") {
    return run((tx) =>
      enqueueSms(tx, {
        template,
        userIds,
        body: "IFC Budget: test.",
        dedupeKey: randomUUID(),
        now: at,
      }),
    );
  }

  async function activePerson() {
    const row = await insertUser(db, { accessStatus: "active" });
    return { id: row.id, phone: await givePhone(row.id) };
  }

  it("holds a text queued at night until 9:00 a.m., then sends it and logs it", async () => {
    const p = await activePerson();
    const night = new Date("2088-02-10T08:15:00Z"); // 2:15 a.m. CST
    expect(await queue([p.id], night)).toBe(1);
    const [row] = await textsTo(p.phone, "test.reminder");
    expect(row.nextAttemptAt).toEqual(new Date("2088-02-10T15:00:00Z"));

    const sender = new FakeSmsSender();
    expect(
      (await deliverSmsOutbox(db, sender, { now: new Date("2088-02-10T09:00:00Z") })).sent,
    ).toBe(0);
    await deliverSmsOutbox(db, sender, { now: new Date("2088-02-10T15:05:00Z") });
    expect(sender.sent.filter((m) => m.to === p.phone)).toHaveLength(1);
    const [sent] = await textsTo(p.phone, "test.reminder");
    expect(sent.status).toBe("sent");
    const [audit] = await db
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.eventType, "notifications.sms_sent"), eq(auditEvents.entityId, row.id)),
      );
    expect(audit.details).toMatchObject({ to: `•••${p.phone.slice(-4)}` });
  });

  it("a person who replied STOP is marked failed, never retried", async () => {
    const p = await activePerson();
    const at = new Date("2088-03-10T18:00:00Z");
    await queue([p.id], at);
    const sender = new FakeSmsSender().answerNext({
      kind: "failed",
      error: "Twilio 400 (21610): Attempt to send to unsubscribed recipient",
    });
    await deliverSmsOutbox(db, sender, { now: at });
    const [row] = await textsTo(p.phone, "test.reminder");
    expect(row).toMatchObject({ status: "failed", attempts: 1 });
  });

  it("stops at the monthly limit", async () => {
    await db
      .insert(appSettings)
      .values({ key: "sms_monthly_limit", value: "2" })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: "2" } });
    try {
      const people = [await activePerson(), await activePerson(), await activePerson()];
      const at = new Date("2088-04-10T18:00:00Z");
      for (const p of people) await queue([p.id], at, "test.cap");
      const summary = await deliverSmsOutbox(db, new FakeSmsSender(), { now: at });
      expect(summary.sent).toBe(2);
      const rows = await db
        .select()
        .from(smsOutbox)
        .where(
          inArray(
            smsOutbox.toPhone,
            people.map((p) => p.phone),
          ),
        );
      expect(rows.filter((r) => r.status === "failed").map((r) => r.lastError)).toEqual([
        MONTHLY_LIMIT_REACHED,
      ]);
    } finally {
      await db
        .update(appSettings)
        .set({ value: "300" })
        .where(eq(appSettings.key, "sms_monthly_limit"));
    }
  });

  it("queues nothing for someone who can't sign in, or while texting isn't set up", async () => {
    const p = await activePerson();
    const inactive = await insertUser(db, { accessStatus: "inactive" });
    await givePhone(inactive.id);
    const at = new Date("2088-05-10T18:00:00Z");
    expect(await queue([inactive.id], at)).toBe(0);
    for (const key of Object.keys(TWILIO)) delete process.env[key];
    try {
      expect(await queue([p.id], at)).toBe(0);
    } finally {
      Object.assign(process.env, TWILIO);
    }
  });
});

describe("phone numbers from Planning Center", () => {
  it("the nightly job stores, changes and clears the mobile number", async () => {
    const linked = await insertUser(db, { accessStatus: "active", pcoPersonId: "777001" });
    const directory = new FakePlanningCenterDirectory({
      organizationId: "1",
      fields: [],
      people: [
        { id: "777001", name: "Lin Ked", status: "active", emails: [], phone: "+12045559001" },
      ],
    });
    const phoneOf = async () =>
      (await db.select().from(users).where(eq(users.id, linked.id)))[0].phoneE164;
    const night = new Date("2088-06-01T08:00:00Z");
    await refreshPhones(db, directory, night);
    expect(await phoneOf()).toBe("+12045559001");

    directory.data.people[0].phone = "+12045559002";
    // Read again only once the last read is a day old.
    await refreshPhones(db, directory, new Date(night.getTime() + 3_600_000));
    expect(await phoneOf()).toBe("+12045559001");
    await refreshPhones(db, directory, new Date(night.getTime() + 86_400_000));
    expect(await phoneOf()).toBe("+12045559002");

    directory.data.people[0].phone = null;
    await refreshPhones(db, directory, new Date(night.getTime() + 2 * 86_400_000));
    expect(await phoneOf()).toBeNull();
  });

  it("sign-in's Group Leader check stores the number too", async () => {
    const user = await insertUser(db, { accessStatus: "active", pcoPersonId: "777002" });
    const person = {
      id: "777002",
      name: "Sig Nin",
      status: "active",
      emails: [],
      phone: "+12045559003",
    };
    await run((tx) =>
      applyVerification(
        tx,
        user,
        { status: "leader", person, fieldValue: "Yes" },
        {
          now: new Date(),
          actor: { kind: "system" },
        },
      ),
    );
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.phoneE164).toBe("+12045559003");
    expect(row.phoneCheckedAt).not.toBeNull();
  });
});
