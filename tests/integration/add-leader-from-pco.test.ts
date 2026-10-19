import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, userDepartments, userRoles, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { addLeaderFromPlanningCenter } from "@/domain/departments/add-from-pco";
import { RuleError } from "@/domain/errors";
import { resolveSignIn } from "@/domain/users/sign-in";
import { ForbiddenError, type Subject } from "@/lib/authz";
import { FakePlanningCenterDirectory, type FakeDirectoryData } from "@/lib/pco";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertDepartment, insertUser } from "./helpers/fixtures";

/* Admin → Departments → Add a leader from Planning Center (FR-38, decided 2026-10-19). */

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

function pcoPerson(leader = true, email?: string): FakeDirectoryData["people"][number] {
  const n = ++seq;
  const person = {
    id: String(8000 + n),
    name: `Leader ${n}`,
    status: "active",
    emails: [email ?? `leader${n}@example.org`],
    fieldValues: { [LEADER.id]: [leader ? "Yes" : "No"] },
  };
  dir.data.people.push(person);
  return person;
}

const add = (
  departmentId: string,
  pcoPersonId: string,
  type = "primary",
  actor: Subject = admin,
  directory: FakePlanningCenterDirectory | null = dir,
) =>
  db.transaction((tx) =>
    addLeaderFromPlanningCenter(
      tx,
      actor,
      directory,
      { departmentId, pcoPersonId, type },
      {
        now: NOW,
      },
    ),
  );

describe("Add a leader from Planning Center", () => {
  it("adds a Group Leader who has never signed in, and their first sign-in finds the account", async () => {
    const dept = await insertDepartment(db);
    const person = pcoPerson();
    expect(await add(dept.id, person.id)).toEqual({ name: person.name });

    const [account] = await db.select().from(users).where(eq(users.pcoPersonId, person.id));
    expect(account).toMatchObject({
      email: person.emails[0],
      displayName: person.name,
      pcoLeaderVerified: true,
      accessStatus: "active",
    });
    const roles = await db.select().from(userRoles).where(eq(userRoles.userId, account.id));
    expect(roles.map((r) => r.role)).toEqual(["requester"]);
    const [link] = await db
      .select()
      .from(userDepartments)
      .where(
        and(eq(userDepartments.userId, account.id), eq(userDepartments.departmentId, dept.id)),
      );
    expect(link.representativeType).toBe("primary");
    const [audit] = await db
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.eventType, "admin.user_added"), eq(auditEvents.entityId, account.id)),
      );
    expect(audit.details).toMatchObject({ source: "planning_center", pcoPersonId: person.id });

    const signedIn = await db.transaction((tx) =>
      resolveSignIn(
        tx,
        { directory: dir, now: NOW },
        {
          provider: "planningcenter",
          subject: person.id,
          email: null,
          emailVerified: true,
          name: person.name,
          organizationId: ORG,
        },
      ),
    );
    expect(signedIn).toEqual({ ok: true, userId: account.id, landing: "home" });
  });

  it("adds someone who already has an account as they are, without a second account", async () => {
    const dept = await insertDepartment(db);
    const person = pcoPerson();
    await add(dept.id, person.id, "representative");
    const other = await insertDepartment(db);
    await add(other.id, person.id, "backup_1");
    const accounts = await db.select().from(users).where(eq(users.pcoPersonId, person.id));
    expect(accounts).toHaveLength(1);
  });

  it("refuses someone who isn't a Group Leader, and makes no account", async () => {
    const dept = await insertDepartment(db);
    const person = pcoPerson(false);
    await expect(add(dept.id, person.id)).rejects.toBeInstanceOf(RuleError);
    expect(await db.select().from(users).where(eq(users.pcoPersonId, person.id))).toEqual([]);
  });

  it("says plainly when someone with an account isn't a verified leader", async () => {
    const dept = await insertDepartment(db);
    const person = pcoPerson(false);
    await insertUser(db, {
      pcoPersonId: person.id,
      displayName: person.name,
      accessStatus: "active",
      pcoLeaderVerified: false,
    });
    await expect(add(dept.id, person.id)).rejects.toThrow(
      `${person.name} isn't marked as a Group Leader`,
    );
  });

  it("never joins an existing account by email", async () => {
    const dept = await insertDepartment(db);
    const existing = await insertUser(db, { accessStatus: "active" });
    const person = pcoPerson(true, existing.email.toUpperCase());
    await expect(add(dept.id, person.id)).rejects.toBeInstanceOf(RuleError);
    const [still] = await db.select().from(users).where(eq(users.id, existing.id));
    expect(still.pcoPersonId).toBeNull();
  });

  it("is the System Administrator's, and needs Planning Center", async () => {
    const dept = await insertDepartment(db);
    const person = pcoPerson();
    const accountant: Subject = { id: admin.id, roles: ["accountant"], departments: [] };
    await expect(add(dept.id, person.id, "primary", accountant)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(add(dept.id, person.id, "primary", admin, null)).rejects.toBeInstanceOf(RuleError);
    await expect(add(dept.id, "not-a-number")).rejects.toThrow();
  });
});
