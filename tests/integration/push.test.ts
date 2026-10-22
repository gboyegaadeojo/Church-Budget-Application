import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { notifications, pushSubscriptions } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  deliverPushes,
  listPushDevices,
  pendingPushCount,
  removePushSubscription,
  savePushSubscription,
} from "@/domain/notifications/push";
import { enqueueEmail, type QueuedEmail } from "@/lib/email/outbox";
import { FakePushSender } from "@/lib/push/fake";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertUser } from "./helpers/fixtures";

/*
 * Phone and computer alerts (web push, decided 2026-10-22): every notification in the
 * bell also pops up on the devices where its person turned alerts on.
 */

const NOW = new Date("2026-10-22T17:00:00Z");
const BRAND = { churchName: "IFC", appName: "Budget", logoUrl: null, accent: null };
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
const KEY = "B".repeat(87);
const SECRET = "a".repeat(22);

let t: TestDb;
let db: Db;
let seq = 0;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t.close();
});

function endpoint() {
  return `https://web.push.apple.com/device-${++seq}`;
}

async function turnOn(userId: string, url = endpoint()) {
  await db.transaction((tx) =>
    savePushSubscription(tx, userId, { endpoint: url, p256dh: KEY, auth: SECRET }, IPHONE),
  );
  return url;
}

function notify(to: { email: string; id: string }[], now = NOW) {
  const email: QueuedEmail = {
    template: "expenses.board_needed",
    audience: "board",
    to: to.map((p) => ({ email: p.email, userId: p.id })),
    brand: BRAND,
    now,
    content: {
      subject: "EXP-2026-0042 needs your approval",
      heading: "An expense needs your approval",
      status: "Waiting for you",
      action: "Approve or return it.",
      button: { label: "Open", href: "http://localhost:3000/expenses/review/abc" },
    },
  };
  return db.transaction((tx) => enqueueEmail(tx, email));
}

describe("phone alerts", () => {
  it("pushes a new notification to each of the person's devices, once", async () => {
    const pat = await insertUser(db);
    const phone = await turnOn(pat.id);
    const laptop = await turnOn(pat.id);
    const sender = new FakePushSender();

    await notify([pat]);
    const first = await deliverPushes(db, sender, { now: NOW });
    expect(first).toEqual({ sent: 2, failed: 0, removed: 0 });
    expect(sender.sent.map((s) => s.target.endpoint).sort()).toEqual([phone, laptop].sort());
    expect(sender.sent[0].message).toMatchObject({
      title: "An expense needs your approval",
      body: "EXP-2026-0042 needs your approval",
      url: "/expenses/review/abc",
      unread: 1,
    });

    // Already sent: the hourly job finds nothing more for Pat.
    const again = await deliverPushes(db, sender, { now: NOW });
    expect(again.sent).toBe(0);
    expect(sender.sent).toHaveLength(2);
    const devices = await listPushDevices(db, pat.id);
    expect(devices.every((d) => d.lastSentAt?.getTime() === NOW.getTime())).toBe(true);
  });

  it("leaves people without a device alone", async () => {
    const before = await pendingPushCount(db);
    const sam = await insertUser(db);
    await notify([sam]);
    const [row] = await db.select().from(notifications).where(eq(notifications.userId, sam.id));
    expect(row.pushPending).toBe(false);
    expect(await pendingPushCount(db)).toBe(before);
  });

  it("drops a device the push service says is gone", async () => {
    const lee = await insertUser(db);
    const old = await turnOn(lee.id);
    const sender = new FakePushSender();
    sender.gone.add(old);
    await notify([lee]);
    const result = await deliverPushes(db, sender, { now: NOW });
    expect(result.removed).toBe(1);
    expect(await listPushDevices(db, lee.id)).toEqual([]);
  });

  it("drops alerts more than a day old instead of sending stale news", async () => {
    const kim = await insertUser(db);
    await turnOn(kim.id);
    const sender = new FakePushSender();
    await notify([kim], new Date(NOW.getTime() - 25 * 60 * 60 * 1000));
    await deliverPushes(db, sender, { now: NOW });
    expect(sender.sent).toHaveLength(0);
  });

  it("moves a shared device to whoever turned alerts on last, and only owners remove it", async () => {
    const ana = await insertUser(db);
    const ben = await insertUser(db);
    const shared = await turnOn(ana.id);
    await turnOn(ben.id, shared);
    expect(await listPushDevices(db, ana.id)).toEqual([]);
    expect(await listPushDevices(db, ben.id)).toHaveLength(1);

    // Ana can't turn off Ben's device.
    await db.transaction((tx) => removePushSubscription(tx, ana.id, { endpoint: shared }));
    expect(await listPushDevices(db, ben.id)).toHaveLength(1);
    await db.transaction((tx) => removePushSubscription(tx, ben.id, { endpoint: shared }));
    expect(await listPushDevices(db, ben.id)).toEqual([]);
  });

  it("refuses an address that isn't a browser push service", async () => {
    const eve = await insertUser(db);
    await expect(turnOn(eve.id, "https://internal.example/steal")).rejects.toThrow();
    const rows = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, eve.id));
    expect(rows).toEqual([]);
  });
});
