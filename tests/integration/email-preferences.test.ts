import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appSettings,
  auditEvents,
  budgetRequests,
  emailDigestItems,
  emailOutbox,
  userRoles,
} from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { decideRequest } from "@/domain/annual/review";
import type { RequestContentInput } from "@/domain/annual/schema";
import { saveDraft, startRequest, submitRequest } from "@/domain/annual/service";
import { ConflictError } from "@/domain/errors";
import {
  DIGEST_TEMPLATE,
  pendingDigestCount,
  queueAccountantDigests,
} from "@/domain/notifications/accountant-digest";
import { getMyEmailPreferences, updateMyEmailPreferences } from "@/domain/users/email-preferences";
import { loadViewer } from "@/domain/users/viewer";
import type { Subject } from "@/lib/authz";
import { emailCategory, routeByPreference, templatesIn } from "@/lib/email/preferences";
import type { Role } from "@/lib/roles";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertCycle, insertDepartment, insertUser } from "./helpers/fixtures";

/* Email preferences and the accountant's daily digest (FR-21 "Email rules", DRD 6.11b). */

const NOW = new Date("2026-10-20T17:00:00Z");

let t: TestDb;
let db: Db;
let admin: Subject;
let pat: Subject;
let cycleId: string;

const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

async function person(role: Role): Promise<Subject> {
  const row = await insertUser(db, {
    accessStatus: role === "requester" ? "pending_department" : "active",
    pcoLeaderVerified: role === "requester",
    pcoVerifiedAt: NOW,
  });
  await db.insert(userRoles).values({ userId: row.id, role });
  return { id: row.id, roles: [role], departments: [] };
}

async function prefs(
  who: Subject,
  change: Partial<{ reminders: boolean; copies: boolean; digest: string }>,
) {
  const current = await run((tx) => getMyEmailPreferences(tx, who.id));
  return run((tx) => updateMyEmailPreferences(tx, who, { ...current, ...change }, { now: NOW }));
}

const CONTENT: RequestContentInput = {
  title: "Microphones",
  justification: "Every small group needs one.",
  lines: [{ name: "Microphone", quantity: "2", unitPrice: "100.00" }],
};

/** A department leader submits a request; returns its id. */
async function submitted(): Promise<string> {
  const leader = await person("requester");
  const dept = await insertDepartment(db);
  const { requestId } = await run((tx) =>
    startRequest(tx, leader, { cycleId, departmentId: dept.id }),
  );
  const loaded = await loadViewer(db, leader.id);
  if (!loaded.ok) throw new Error("no viewer");
  const saved = await run((tx) =>
    saveDraft(tx, loaded.viewer, { id: requestId, version: 1, ...CONTENT }),
  );
  await run((tx) =>
    submitRequest(
      tx,
      loaded.viewer,
      { id: requestId, version: saved.version, idempotencyKey: randomUUID() },
      { now: NOW },
    ),
  );
  return requestId;
}

const outbox = (requestId: string, template: string) =>
  db
    .select()
    .from(emailOutbox)
    .where(and(eq(emailOutbox.budgetRequestId, requestId), eq(emailOutbox.template, template)));

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  admin = await person("system_admin");
  pat = await person("accountant");
  await person("backup_approver");
  await db.insert(appSettings).values({ key: "primary_accountant_user_id", value: pat.id });
  cycleId = (await insertCycle(db, admin.id)).id;
});

afterAll(async () => {
  await t?.close();
});

describe("which emails can be turned off (FR-21)", () => {
  it("request and decision emails always go; reminders, copies and the digest are optional", () => {
    expect(emailCategory("annual.approved")).toBe("always");
    expect(emailCategory("annual.message.accountant")).toBe("always");
    expect(emailCategory("access.sign_in_code")).toBe("always");
    expect(emailCategory(DIGEST_TEMPLATE)).toBe("always");
    expect(templatesIn("reminder")).toContain("cycle.reminder");
    expect(templatesIn("copy")).toEqual(
      expect.arrayContaining(["annual.approved.accountant", "annual.declined.accountant"]),
    );
    expect(templatesIn("digestible").sort()).toEqual([
      "annual.revised.accountant",
      "annual.submitted.accountant",
    ]);
  });
});

describe("email preferences (FR-21, DRD 6.11b)", () => {
  it("starts with every email, sent straight away", async () => {
    expect(await run((tx) => getMyEmailPreferences(tx, pat.id))).toEqual({
      reminders: true,
      copies: true,
      digest: "instant",
      version: 0,
    });
  });

  it("anyone can turn reminders off; copies and the digest stay the accountant's", async () => {
    const leader = await person("requester");
    await prefs(leader, { reminders: false, copies: false, digest: "daily" });
    expect(await run((tx) => getMyEmailPreferences(tx, leader.id))).toMatchObject({
      reminders: false,
      copies: true,
      digest: "instant",
    });
    const routed = await run((tx) =>
      routeByPreference(tx, "cycle.reminder", [
        { email: "leader@example.org", userId: leader.id },
        { email: "no-account@example.org" },
      ]),
    );
    expect(routed.now.map((r) => r.email)).toEqual(["no-account@example.org"]);

    const [audit] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, "user.email_preferences_changed"),
          eq(auditEvents.actorUserId, leader.id),
        ),
      );
    expect(audit?.details).toMatchObject({
      before: { reminders: true },
      after: { reminders: false },
    });
  });

  it("refuses a change made from an out-of-date page", async () => {
    const leader = await person("requester");
    await prefs(leader, { reminders: false });
    await expect(
      run((tx) =>
        updateMyEmailPreferences(tx, leader, {
          reminders: true,
          copies: true,
          digest: "instant",
          version: 0,
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("an accountant who turns copies off isn't copied, and the department still is", async () => {
    await prefs(pat, { copies: false });
    const requestId = await submitted();
    const [{ version }] = await db
      .select({ version: budgetRequests.version })
      .from(budgetRequests)
      .where(eq(budgetRequests.id, requestId));
    await run((tx) =>
      decideRequest(
        tx,
        pat,
        {
          id: requestId,
          version,
          idempotencyKey: randomUUID(),
          decision: { kind: "return", note: "Which microphones?" },
        },
        { now: NOW },
      ),
    );
    expect(await outbox(requestId, "annual.returned.accountant")).toHaveLength(0);
    expect((await outbox(requestId, "annual.returned")).length).toBeGreaterThan(0);
    await prefs(pat, { copies: true });
  });

  it("the daily digest holds new submissions and sends them together, once", async () => {
    await prefs(pat, { digest: "daily" });
    const first = await submitted();
    const second = await submitted();

    // Nothing to the accountant now; the department's receipts still go.
    expect(await outbox(first, "annual.submitted.accountant")).toHaveLength(0);
    expect((await outbox(first, "annual.submitted.receipt")).length).toBeGreaterThan(0);
    expect(await run((tx) => pendingDigestCount(tx, pat.id))).toBe(2);

    const later = new Date(NOW.getTime() + 10 * 3_600_000);
    expect(await run((tx) => queueAccountantDigests(tx, later))).toBe(1);
    const digests = await db
      .select()
      .from(emailOutbox)
      .where(and(eq(emailOutbox.template, DIGEST_TEMPLATE), eq(emailOutbox.toUserId, pat.id)));
    expect(digests).toHaveLength(1);
    expect(digests[0]!.subject).toBe("2 budget updates to review");
    expect(digests[0]!.textBody).toContain("IFC-");

    const items = await db
      .select()
      .from(emailDigestItems)
      .where(eq(emailDigestItems.userId, pat.id));
    expect(items.map((i) => i.budgetRequestId).sort()).toEqual([first, second].sort());
    expect(items.every((i) => i.outboxId === digests[0]!.id)).toBe(true);

    // A second run the same night sends nothing.
    expect(await run((tx) => queueAccountantDigests(tx, later))).toBe(0);
    expect(await run((tx) => pendingDigestCount(tx, pat.id))).toBe(0);
  });

  it("switching back to instant sends what was waiting straight away", async () => {
    await submitted();
    expect(await run((tx) => pendingDigestCount(tx, pat.id))).toBe(1);
    await prefs(pat, { digest: "instant" });
    expect(await run((tx) => pendingDigestCount(tx, pat.id))).toBe(0);
    const waiting = await db
      .select()
      .from(emailDigestItems)
      .where(and(eq(emailDigestItems.userId, pat.id), isNull(emailDigestItems.digestedAt)));
    expect(waiting).toHaveLength(0);

    // And new submissions go one by one again.
    const next = await submitted();
    expect((await outbox(next, "annual.submitted.accountant")).map((e) => e.toUserId)).toEqual([
      pat.id,
    ]);
  });

  it("digest items can't be deleted", async () => {
    const [item] = await db.select({ id: emailDigestItems.id }).from(emailDigestItems).limit(1);
    await expect(
      db.delete(emailDigestItems).where(eq(emailDigestItems.id, item!.id)),
    ).rejects.toThrow();
  });
});
