import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, userRoles, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { RuleError } from "@/domain/errors";
import { addStaffFromPlanningCenter } from "@/domain/users/admin";
import { resolveSignIn } from "@/domain/users/sign-in";
import { ForbiddenError, type Subject } from "@/lib/authz";
import { FakePlanningCenterDirectory, type FakeDirectoryData } from "@/lib/pco";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertUser } from "./helpers/fixtures";

/*
 * Users & Roles → Add a staff member → Find them in Planning Center (decided 2026-10-20):
 * the account is linked to the person's profile from the start, so Planning Center
 * sign-in reaches it with no linking step. Nothing is ever matched by email alone.
 */

const ORG = "100";
const LEADER = { id: "77", name: "Ministry Leader", dataType: "boolean" };
const NOW = new Date("2026-10-20T17:00:00Z");

let t: TestDb;
let db: Db;
let admin: Subject;
let seq = 0;

const dir = new FakePlanningCenterDirectory({
  organizationId: ORG,
  fields: [LEADER],
  people: [],
  teams: [],
  groups: [],
  tags: [],
});

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  const row = await insertUser(db, { accessStatus: "active" });
  await db.insert(userRoles).values({ userId: row.id, role: "system_admin" });
  admin = { id: row.id, roles: ["system_admin"], departments: [] };
});

afterAll(async () => {
  await t?.close();
});

function pcoPerson(emails?: string[]): FakeDirectoryData["people"][number] {
  const n = ++seq;
  const person = {
    id: String(9000 + n),
    name: `Staff ${n}`,
    status: "active",
    emails: emails ?? [`staff${n}@example.org`],
    fieldValues: { [LEADER.id]: ["No"] },
  };
  dir.data.people.push(person);
  return person;
}

const add = (pcoPersonId: string, roles = ["accountant"], actor: Subject = admin) =>
  db.transaction((tx) => addStaffFromPlanningCenter(tx, actor, dir, { pcoPersonId, roles }));

describe("Add a staff member from Planning Center", () => {
  it("creates a linked account with the roles, and their first sign-in goes straight in", async () => {
    const person = pcoPerson();
    const { userId, name } = await add(person.id, ["accountant"]);
    expect(name).toBe(person.name);
    const [account] = await db.select().from(users).where(eq(users.id, userId));
    expect(account).toMatchObject({
      email: person.emails[0],
      displayName: person.name,
      pcoPersonId: person.id,
      accessStatus: "active",
    });
    const roles = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
    expect(roles.map((r) => r.role)).toEqual(["accountant"]);
    const [audit] = await db.select().from(auditEvents).where(eq(auditEvents.entityId, userId));
    expect(audit).toMatchObject({ eventType: "admin.user_added" });
    expect(audit.details).toMatchObject({ source: "planning_center" });

    // Not a Ministry Leader, and staff don't need the check by default: straight to Home.
    const signedIn = await db.transaction((tx) =>
      resolveSignIn(
        tx,
        { directory: dir, now: NOW },
        {
          provider: "planningcenter",
          subject: person.id,
          email: person.emails[0],
          emailVerified: true,
          name: person.name,
          organizationId: ORG,
        },
      ),
    );
    expect(signedIn).toEqual({ ok: true, userId, landing: "home" });
  });

  it("refuses someone who already has an account, has no email, or whose email is taken", async () => {
    const person = pcoPerson();
    await add(person.id);
    await expect(add(person.id)).rejects.toBeInstanceOf(RuleError);

    const noEmail = pcoPerson([]);
    await expect(add(noEmail.id)).rejects.toBeInstanceOf(RuleError);

    const existing = await insertUser(db, { email: "taken@example.org" });
    const sameEmail = pcoPerson(["Taken@example.org"]);
    await expect(add(sameEmail.id)).rejects.toBeInstanceOf(RuleError);
    // The existing account is left as it is: never linked by email.
    const [still] = await db.select().from(users).where(eq(users.id, existing.id));
    expect(still.pcoPersonId).toBeNull();
  });

  it("only the System Administrator can add staff", async () => {
    const person = pcoPerson();
    const accountant: Subject = { id: admin.id, roles: ["accountant"], departments: [] };
    await expect(add(person.id, ["accountant"], accountant)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
