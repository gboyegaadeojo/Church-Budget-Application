import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, emailOutbox, userRoles, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { checkEmailCode, requestEmailCode } from "@/domain/users/email-sign-in";
import { resolveSignIn } from "@/domain/users/sign-in";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertUser } from "./helpers/fixtures";

const NOW = new Date("2026-10-20T17:00:00Z");
const SECRET = "test-secret";
const FIRST = "office@church.example";

let t: TestDb;
let db: Db;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t?.close();
});

const request = (email: string, firstAdminEmail?: string, now = NOW) =>
  db.transaction((tx) =>
    requestEmailCode(
      tx,
      {
        now,
        secret: SECRET,
        generateCode: () => "123456",
        firstAdminEmail,
        firstAdminName: "Olive Office",
      },
      { email },
    ),
  );
const codeEmails = (email: string) =>
  db
    .select()
    .from(emailOutbox)
    .where(and(eq(emailOutbox.toEmail, email), eq(emailOutbox.template, "access.sign_in_code")));
const admins = () =>
  db
    .select({ email: users.email })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(eq(userRoles.role, "system_admin"));

// The tests run in order against one empty database.
describe("The first System Administrator (FIRST_ADMIN_EMAIL, go-live step 6)", () => {
  it("does nothing without the variable, or for another address", async () => {
    await request(FIRST);
    await request("someone@church.example", FIRST);
    expect(await admins()).toEqual([]);
    expect(await codeEmails(FIRST)).toHaveLength(0);
  });

  it("makes the address an administrator on an empty app, emails the code and signs them in", async () => {
    expect(await request(" Office@Church.Example ", FIRST.toUpperCase())).toEqual({
      ok: true,
      email: FIRST,
    });
    expect(await admins()).toEqual([{ email: FIRST }]);
    const [created] = await db.select().from(users).where(eq(users.email, FIRST));
    expect(created).toMatchObject({ displayName: "Olive Office", accessStatus: "active" });
    expect(await codeEmails(FIRST)).toHaveLength(1);

    const [audit] = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "access.first_admin_created"));
    expect(audit.details).toMatchObject({ email: FIRST, newAccount: true });

    const checked = await db.transaction((tx) =>
      checkEmailCode(tx, { now: NOW, secret: SECRET }, { email: FIRST, code: "123456" }),
    );
    expect(checked.ok).toBe(true);
    const signedIn = await db.transaction((tx) =>
      resolveSignIn(
        tx,
        { directory: null, now: NOW },
        { provider: "email", subject: FIRST, email: FIRST, emailVerified: true, name: null },
      ),
    );
    expect(signedIn).toMatchObject({ ok: true, landing: "home" });
  });

  it("does nothing once a System Administrator exists, even for another first address", async () => {
    await request("second@church.example", "second@church.example");
    expect(await admins()).toEqual([{ email: FIRST }]);
    expect(await codeEmails("second@church.example")).toHaveLength(0);
  });

  it("works again if every System Administrator is deactivated, promoting an existing account", async () => {
    await db.update(users).set({ active: false }).where(eq(users.email, FIRST));
    const staff = await insertUser(db, {
      email: "treasurer@church.example",
      accessStatus: "active",
    });
    await db.insert(userRoles).values({ userId: staff.id, role: "accountant" });

    await request("treasurer@church.example", "treasurer@church.example");
    const roles = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, staff.id));
    expect(roles.map((r) => r.role).sort()).toEqual(["accountant", "system_admin"]);
    expect(await codeEmails("treasurer@church.example")).toHaveLength(1);
  });
});
