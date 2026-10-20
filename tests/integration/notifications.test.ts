import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { notifications } from "@/db/schema";
import type { Db } from "@/db/types";
import {
  filterCounts,
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
} from "@/domain/notifications/in-app";
import { enqueueEmail, type QueuedEmail } from "@/lib/email/outbox";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertUser } from "./helpers/fixtures";

const NOW = new Date("2026-10-20T17:00:00Z");
const BRAND = { churchName: "IFC", appName: "Budget", logoUrl: null, accent: null };

let t: TestDb;
let db: Db;

function email(template: string, to: QueuedEmail["to"], extra: Partial<QueuedEmail> = {}) {
  return {
    template,
    audience: "accountant",
    to,
    brand: BRAND,
    now: NOW,
    content: {
      subject: `Subject for ${template}`,
      heading: "An expense needs your approval",
      status: "Submitted",
      action: "Approve or return it.",
      button: { label: "Open", href: "http://localhost:3000/expenses/review/abc" },
    },
    ...extra,
  } satisfies QueuedEmail;
}

const mine = (userId: string) =>
  db.select().from(notifications).where(eq(notifications.userId, userId));

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t.close();
});

describe("in-app notifications follow the email outbox (decided 2026-10-19)", () => {
  it("adds one notification per person with an account, in the same transaction", async () => {
    const pat = await insertUser(db);
    const cleo = await insertUser(db);
    await db.transaction((tx) =>
      enqueueEmail(
        tx,
        email("expenses.board_needed", [
          { email: pat.email, userId: pat.id },
          // No userId: matched to Cleo's account by email, whatever the case.
          { email: cleo.email.toUpperCase() },
          { email: "outsider@example.org" },
        ]),
      ),
    );
    const [p] = await mine(pat.id);
    expect(p).toMatchObject({
      area: "expenses",
      actionNeeded: true,
      title: "An expense needs your approval",
      body: "Subject for expenses.board_needed",
      href: "/expenses/review/abc",
      readAt: null,
    });
    expect(await mine(cleo.id)).toHaveLength(1);
  });

  it("nothing reaches the bell when the change rolls back", async () => {
    const pat = await insertUser(db);
    await db
      .transaction(async (tx) => {
        await enqueueEmail(tx, email("expenses.paid", [{ email: pat.email, userId: pat.id }]));
        throw new Error("rolled back");
      })
      .catch(() => {});
    expect(await mine(pat.id)).toHaveLength(0);
  });

  it("skips sign-in codes, system emails and dedupe-skipped repeats", async () => {
    const pat = await insertUser(db);
    const to = [{ email: pat.email, userId: pat.id }];
    await enqueueEmail(db, email("access.sign_in_code", to, { sensitive: true }));
    await enqueueEmail(db, email("system.test_email", to));
    await enqueueEmail(db, email("cycle.reminder", to, { dedupeKey: "r-1" }));
    await enqueueEmail(db, email("cycle.reminder", to, { dedupeKey: "r-1" }));
    const rows = await mine(pat.id);
    expect(rows.map((r) => r.template)).toEqual(["cycle.reminder"]);
  });

  it("each person reads and marks only their own", async () => {
    const pat = await insertUser(db);
    const sam = await insertUser(db);
    for (const template of ["expenses.paid", "annual.approved", "expenses.board_needed"]) {
      await enqueueEmail(db, email(template, [{ email: pat.email, userId: pat.id }]));
    }
    expect(await unreadCount(db, pat.id)).toBe(3);
    const counts = await filterCounts(db, pat.id);
    expect(counts).toMatchObject({ all: 3, unread: 3, action: 1, expenses: 2, annual: 1 });
    const actions = await listNotifications(db, pat.id, { filter: "action", limit: 10 });
    expect(actions.map((a) => a.title)).toHaveLength(1);

    const [first] = await listNotifications(db, pat.id, { limit: 1 });
    // Sam can't mark Pat's notification.
    expect(await markRead(db, sam.id, first.id, NOW)).toBe(0);
    expect(await unreadCount(db, pat.id)).toBe(3);
    expect(await markRead(db, pat.id, first.id, NOW)).toBe(1);
    expect(await unreadCount(db, pat.id)).toBe(2);
    expect(await markAllRead(db, pat.id, NOW)).toBe(2);
    expect(await unreadCount(db, pat.id)).toBe(0);
    expect(await listNotifications(db, sam.id, { limit: 10 })).toEqual([]);
  });
});
