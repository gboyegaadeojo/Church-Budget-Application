import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appSettings,
  auditEvents,
  notifications,
  pushSubscriptions,
  userRoles,
  users,
} from "@/db/schema";
import type { Db } from "@/db/types";
import {
  deliverPushes,
  listPushDevices,
  pendingPushCount,
  savePushSubscription,
} from "@/domain/notifications/push";
import { updatePushEnabled } from "@/domain/settings/service";
import { removeUserPushDevice, setUserPushAlerts } from "@/domain/users/admin";
import { ForbiddenError, type Subject } from "@/lib/authz";
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
let admin: Subject;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  const row = await insertUser(db, { accessStatus: "active" });
  await db.insert(userRoles).values({ userId: row.id, role: "system_admin" });
  admin = { id: row.id, roles: ["system_admin"], departments: [] };
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

  it("moves a shared device to whoever signed in last", async () => {
    const ana = await insertUser(db);
    const ben = await insertUser(db);
    const shared = await turnOn(ana.id);
    await turnOn(ben.id, shared);
    expect(await listPushDevices(db, ana.id)).toEqual([]);
    expect(await listPushDevices(db, ben.id)).toHaveLength(1);
  });

  it("only the System Administrator turns a person's alerts off, and it is audited", async () => {
    const joy = await insertUser(db);
    await turnOn(joy.id);
    const accountant: Subject = { id: joy.id, roles: ["accountant"], departments: [] };
    await expect(
      db.transaction((tx) =>
        setUserPushAlerts(tx, accountant, { userId: joy.id, on: false, version: 1 }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const [before] = await db.select().from(users).where(eq(users.id, joy.id));
    await db.transaction((tx) =>
      setUserPushAlerts(tx, admin, { userId: joy.id, on: false, version: before.version }),
    );
    const [audit] = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "admin.user_alerts_off"));
    expect(audit.entityId).toBe(joy.id);

    // Off: her notifications no longer wait to be pushed, though the bell still has them.
    const sender = new FakePushSender();
    await notify([joy]);
    await deliverPushes(db, sender, { now: NOW });
    expect(sender.sent).toHaveLength(0);
    const rows = await db.select().from(notifications).where(eq(notifications.userId, joy.id));
    expect(rows).toHaveLength(1);
  });

  it("the System Administrator removes a lost phone; nobody else can", async () => {
    const max = await insertUser(db);
    await turnOn(max.id);
    const [device] = await listPushDevices(db, max.id);
    const leader: Subject = { id: max.id, roles: ["requester"], departments: [] };
    await expect(
      db.transaction((tx) =>
        removeUserPushDevice(tx, leader, { userId: max.id, deviceId: device.id }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const result = await db.transaction((tx) =>
      removeUserPushDevice(tx, admin, { userId: max.id, deviceId: device.id }),
    );
    expect(result.device).toBe("iPhone");
    expect(await listPushDevices(db, max.id)).toEqual([]);
  });

  it("the church-wide switch stops every alert", async () => {
    const zoe = await insertUser(db);
    await turnOn(zoe.id);
    await db.transaction((tx) => updatePushEnabled(tx, admin, { enabled: false, versions: {} }));
    const sender = new FakePushSender();
    await notify([zoe]);
    await deliverPushes(db, sender, { now: NOW });
    expect(sender.sent).toHaveLength(0);
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "push_enabled"));
    await db.transaction((tx) =>
      updatePushEnabled(tx, admin, { enabled: true, versions: { push_enabled: row.version } }),
    );
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
