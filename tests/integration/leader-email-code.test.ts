import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, emailOutbox, userRoles, users } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { checkEmailCode, requestEmailCode } from "@/domain/users/email-sign-in";
import { resolveSignIn } from "@/domain/users/sign-in";
import { FakePlanningCenterDirectory, type FakeDirectoryData } from "@/lib/pco";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertUser } from "./helpers/fixtures";

/*
 * Ministry leaders sign in with an emailed code (decided 2026-10-23). Most leaders only
 * have a Church Center login, so "Continue with Planning Center" can't work for them. A code
 * goes to the email on a verified leader's Planning Center profile, and signing in with it
 * counts as that Planning Center person's sign-in.
 */

const ORG = "100";
const FIELD = { id: "77", name: "Ministry Leader", dataType: "boolean" };
const NOW = new Date("2026-10-23T17:00:00Z");
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

type Person = FakeDirectoryData["people"][number];

function person(leader: boolean, email?: string): Person {
  const n = ++seq;
  return {
    id: String(7000 + n),
    name: `Leader ${n}`,
    status: "active",
    emails: [email ?? `leader${n}@gmail.com`],
    fieldValues: { [FIELD.id]: [leader ? "Yes" : "No"] },
  };
}

const directory = (people: Person[]) =>
  new FakePlanningCenterDirectory({
    organizationId: ORG,
    fields: [FIELD],
    people,
    teams: [],
    groups: [],
    tags: [],
  });

const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const request = (email: string, dir: FakePlanningCenterDirectory) =>
  run((tx) =>
    requestEmailCode(
      tx,
      { now: NOW, secret: SECRET, generateCode: () => "246810", directory: dir },
      { email },
    ),
  );

const check = (email: string) =>
  run((tx) => checkEmailCode(tx, { now: NOW, secret: SECRET }, { email, code: "246810" }));

const codesTo = (email: string) =>
  db
    .select()
    .from(emailOutbox)
    .where(and(eq(emailOutbox.toEmail, email), eq(emailOutbox.template, "access.sign_in_code")));

describe("Ministry leaders sign in with an emailed code", () => {
  it("emails a verified leader a code, and signing in with it is their Planning Center sign-in", async () => {
    const ada = person(true);
    const dir = directory([ada]);
    expect(await request(ada.emails[0], dir)).toEqual({ ok: true, email: ada.emails[0] });
    expect(await codesTo(ada.emails[0])).toHaveLength(1);

    const checked = await check(ada.emails[0]);
    expect(checked).toEqual({ ok: true, email: ada.emails[0], pcoPersonId: ada.id });

    // What auth.ts builds from a leader's code: the Planning Center person, not the address.
    const result = await run((tx) =>
      resolveSignIn(
        tx,
        { directory: dir, now: NOW },
        {
          provider: "planningcenter",
          subject: ada.id,
          email: ada.emails[0],
          emailVerified: false,
          name: null,
          organizationId: ORG,
          via: "email-code",
        },
      ),
    );
    expect(result).toMatchObject({ ok: true, landing: "waiting" });
    const [account] = await db.select().from(users).where(eq(users.pcoPersonId, ada.id));
    expect(account).toMatchObject({ displayName: ada.name, pcoLeaderVerified: true });
    const roles = await db.select().from(userRoles).where(eq(userRoles.userId, account.id));
    expect(roles.map((r) => r.role)).toEqual(["requester"]);
    const [signedIn] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, "access.sign_in_succeeded"),
          eq(auditEvents.entityId, account.id),
        ),
      );
    expect(signedIn.details).toMatchObject({ method: "planningcenter", via: "email-code" });
  });

  it("sends nothing to someone who isn't a leader, or isn't in Planning Center, with the same answer", async () => {
    const jo = person(false);
    const dir = directory([jo]);
    expect(await request(jo.emails[0], dir)).toEqual({ ok: true, email: jo.emails[0] });
    expect(await request("nobody@gmail.com", dir)).toEqual({ ok: true, email: "nobody@gmail.com" });
    expect(await codesTo(jo.emails[0])).toHaveLength(0);
    expect(await codesTo("nobody@gmail.com")).toHaveLength(0);
    expect(await check(jo.emails[0])).toEqual({ ok: true, email: jo.emails[0], pcoPersonId: null });
  });

  it("sends nothing when two leaders share one address, since nobody can tell who is signing in", async () => {
    const shared = `family${++seq}@gmail.com`;
    const dir = directory([person(true, shared), person(true, shared)]);
    await request(shared, dir);
    expect(await codesTo(shared)).toHaveLength(0);
    const requested = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "access.sign_in_code_requested"));
    const mine = requested.find((e) => (e.details as { email?: string }).email === shared);
    expect(mine?.details).toMatchObject({
      sent: false,
      for: "several ministry leaders share this address",
    });
  });

  it("an existing leader account is found by its Planning Center person, never by the address", async () => {
    const sam = person(true);
    const dir = directory([sam]);
    const existing = await insertUser(db, {
      email: sam.emails[0],
      pcoPersonId: sam.id,
      accessStatus: "active",
    });
    await db.insert(userRoles).values({ userId: existing.id, role: "requester" });
    await request(sam.emails[0], dir);
    expect(await check(sam.emails[0])).toMatchObject({ pcoPersonId: sam.id });
    const result = await run((tx) =>
      resolveSignIn(
        tx,
        { directory: dir, now: NOW },
        {
          provider: "planningcenter",
          subject: sam.id,
          email: sam.emails[0],
          emailVerified: false,
          name: null,
          organizationId: ORG,
          via: "email-code",
        },
      ),
    );
    expect(result).toMatchObject({ ok: true, userId: existing.id });
  });
});
