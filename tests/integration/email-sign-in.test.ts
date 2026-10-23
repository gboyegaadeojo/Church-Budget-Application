import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appSettings, auditEvents, emailLoginCodes, emailOutbox, userRoles } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import {
  checkEmailCode,
  CODE_LIFETIME_MS,
  LOCK_MS,
  normalizeCode,
  requestEmailCode,
  type EmailCodeDeps,
} from "@/domain/users/email-sign-in";
import { RuleError } from "@/domain/errors";
import { retryFailedEmails } from "@/domain/notifications/admin";
import { resolveSignIn } from "@/domain/users/sign-in";
import type { Subject } from "@/lib/authz";
import { FakeEmailSender } from "@/lib/email/fake";
import { CLEARED_BODY, deliverOutbox } from "@/lib/email/outbox";
import type { Role } from "@/lib/roles";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertUser } from "./helpers/fixtures";

const NOW = new Date("2026-10-20T17:00:00Z");
const MINUTES = 60_000;
const SECRET = "test-secret";

let t: TestDb;
let db: Db;
let seq = 0;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t?.close();
});

const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
const at = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTES);
const deps = (now = NOW, extra: Partial<EmailCodeDeps> = {}): EmailCodeDeps => ({
  now,
  secret: SECRET,
  generateCode: () => "123456",
  ...extra,
});

/** An account with these roles at a non-Gmail address. */
async function account(roles: Role[], overrides: Parameters<typeof insertUser>[1] = {}) {
  const email = `person${++seq}@outlook.com`;
  const row = await insertUser(db, { email, accessStatus: "active", ...overrides });
  if (roles.length > 0)
    await db.insert(userRoles).values(roles.map((role) => ({ userId: row.id, role })));
  return row;
}

const request = (email: string, now = NOW, extra: Partial<EmailCodeDeps> = {}) =>
  run((tx) => requestEmailCode(tx, deps(now, extra), { email }));
const check = (email: string, code: string, now = NOW) =>
  run((tx) => checkEmailCode(tx, { now, secret: SECRET }, { email, code }));
const codeEmails = (email: string) =>
  db
    .select()
    .from(emailOutbox)
    .where(and(eq(emailOutbox.toEmail, email), eq(emailOutbox.template, "access.sign_in_code")));

describe("Sign-in with an emailed code (FR-01b)", () => {
  it("AC-132 a Church Administrator at an outlook.com address signs in with an emailed code", async () => {
    const admin = await account(["church_admin"]);
    expect(await request(` ${admin.email.toUpperCase()} `)).toEqual({
      ok: true,
      email: admin.email,
    });

    const [email] = await codeEmails(admin.email);
    expect(email).toMatchObject({ sensitive: true, audience: "person", toUserId: admin.id });
    expect(email.expiresAt).toEqual(at(10));
    expect(email.subject).not.toContain("123456");
    expect(email.textBody).toContain("123456");
    // Only a keyed hash is stored with the code.
    const [row] = await db
      .select()
      .from(emailLoginCodes)
      .where(eq(emailLoginCodes.email, admin.email));
    expect(row.codeHash).not.toContain("123456");

    expect(await check(admin.email, "123 456", at(9))).toEqual({
      ok: true,
      email: admin.email,
      pcoPersonId: null,
    });
    // Single use.
    expect(await check(admin.email, "123456", at(9))).toEqual({ ok: false, reason: "expired" });

    const result = await run((tx) =>
      resolveSignIn(
        tx,
        { directory: null, now: NOW },
        {
          provider: "email",
          subject: admin.email,
          email: admin.email,
          emailVerified: true,
          name: null,
        },
      ),
    );
    expect(result).toEqual({ ok: true, userId: admin.id, landing: "home" });
  });

  it("AC-132 five wrong codes block further tries, and new codes, for 15 minutes", async () => {
    const admin = await account(["system_admin"]);
    await request(admin.email);
    for (let i = 1; i <= 4; i++) {
      expect(await check(admin.email, "000000")).toEqual({
        ok: false,
        reason: "wrong",
        triesLeft: 5 - i,
      });
    }
    const locked = await check(admin.email, "000000");
    expect(locked).toEqual({
      ok: false,
      reason: "locked",
      retryAt: new Date(NOW.getTime() + LOCK_MS),
    });
    // Even the right code, and asking for another, wait out the lock.
    expect(await check(admin.email, "123456", at(14))).toMatchObject({ reason: "locked" });
    expect(await request(admin.email, at(14))).toMatchObject({ ok: false, reason: "too_many" });

    expect(await request(admin.email, at(16))).toMatchObject({ ok: true });
    expect(await check(admin.email, "123456", at(16))).toMatchObject({ ok: true });
    const events = await db
      .select({ type: auditEvents.eventType })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, admin.id));
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(["access.sign_in_code_wrong", "access.sign_in_code_locked"]),
    );
  });

  it("AC-133 an address with no account gets the same answer and no email", async () => {
    const email = `nobody${++seq}@outlook.com`;
    expect(await request(email)).toEqual({ ok: true, email });
    expect(await codeEmails(email)).toHaveLength(0);
    // Its limits behave the same, so they don't reveal anything either.
    expect(await check(email, "000000")).toEqual({ ok: false, reason: "wrong", triesLeft: 4 });
  });

  it("only the Church Administrator and System Administrators are emailed a code", async () => {
    const accountant = await account(["accountant"]);
    const requester = await account(["requester"], { pcoPersonId: `p-${seq}` });
    const deactivated = await account(["church_admin"], { active: false });
    for (const person of [accountant, requester, deactivated]) {
      expect(await request(person.email)).toEqual({ ok: true, email: person.email });
      expect(await codeEmails(person.email)).toHaveLength(0);
    }
    // Even with a right code, email sign-in refuses other roles.
    const result = await run((tx) =>
      resolveSignIn(
        tx,
        { directory: null, now: NOW },
        {
          provider: "email",
          subject: accountant.email,
          email: accountant.email,
          emailVerified: true,
          name: null,
        },
      ),
    );
    expect(result).toEqual({ ok: false, reason: "not-allowed", email: accountant.email });
  });

  it("allows 5 codes an hour per address", async () => {
    const admin = await account(["church_admin"]);
    for (let i = 0; i < 5; i++)
      expect(await request(admin.email, at(i))).toMatchObject({ ok: true });
    expect(await request(admin.email, at(10))).toEqual({
      ok: false,
      reason: "too_many",
      retryAt: at(60),
    });
    expect(await request(admin.email, at(61))).toMatchObject({ ok: true });
  });

  it("allows 20 codes an hour from one network", async () => {
    const ip = `ip-${++seq}`;
    for (let i = 0; i < 20; i++) {
      expect(await request(`net${seq}-${i}@example.org`, NOW, { requestIpHash: ip })).toMatchObject(
        {
          ok: true,
        },
      );
    }
    expect(await request(`net${seq}-x@example.org`, NOW, { requestIpHash: ip })).toMatchObject({
      reason: "too_many",
    });
  });

  it("a code runs out after 10 minutes, and a new code replaces the old", async () => {
    const admin = await account(["church_admin"]);
    await request(admin.email);
    expect(await check(admin.email, "123456", new Date(NOW.getTime() + CODE_LIFETIME_MS))).toEqual({
      ok: false,
      reason: "expired",
    });
    await request(admin.email, at(11), { generateCode: () => "111111" });
    await request(admin.email, at(12), { generateCode: () => "222222" });
    expect(await check(admin.email, "111111", at(13))).toMatchObject({ reason: "wrong" });
    expect(await check(admin.email, "222222", at(13))).toMatchObject({ ok: true });
  });

  it("does nothing when email sign-in is turned off", async () => {
    const admin = await account(["church_admin"]);
    await db
      .update(appSettings)
      .set({ value: "false" })
      .where(eq(appSettings.key, "signin_email_enabled"));
    try {
      expect(await request(admin.email)).toEqual({ ok: false, reason: "disabled" });
      expect(await check(admin.email, "123456")).toEqual({ ok: false, reason: "disabled" });
    } finally {
      await db
        .update(appSettings)
        .set({ value: "true" })
        .where(eq(appSettings.key, "signin_email_enabled"));
    }
  });

  it("clears the code from the outbox once it's sent", async () => {
    const admin = await account(["church_admin"]);
    await request(admin.email);
    const [queued] = await codeEmails(admin.email);
    const sender = new FakeEmailSender();
    await deliverOutbox(db, sender, { now: at(1), ids: [queued.id] });
    expect(sender.sent[0].text).toContain("123456");
    const [sent] = await codeEmails(admin.email);
    expect(sent).toMatchObject({ status: "sent", textBody: CLEARED_BODY, htmlBody: CLEARED_BODY });
  });

  it("never sends a code after it runs out, and Send again skips it", async () => {
    const admin = await account(["church_admin", "system_admin"]);
    await request(admin.email);
    const [queued] = await codeEmails(admin.email);
    const sender = new FakeEmailSender();
    await deliverOutbox(db, sender, { now: at(11), ids: [queued.id] });
    expect(sender.sent).toHaveLength(0);
    const [row] = await codeEmails(admin.email);
    expect(row).toMatchObject({ status: "failed", textBody: CLEARED_BODY, htmlBody: CLEARED_BODY });

    const actor = { id: admin.id, roles: ["system_admin"], departments: [] } as Subject;
    await expect(
      run((tx) => retryFailedEmails(tx, actor, { ids: [row.id] })),
    ).rejects.toBeInstanceOf(RuleError);
  });

  it("accepts a code typed with a space or dash, and nothing else", () => {
    expect(normalizeCode("123 456")).toBe("123456");
    expect(normalizeCode(" 123-456 ")).toBe("123456");
    expect(normalizeCode("12345")).toBeNull();
    expect(normalizeCode("12345a")).toBeNull();
  });
});
