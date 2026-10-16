import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditEvents,
  budgetRequests,
  departments,
  emailOutbox,
  pcoLeaderSuggestions,
  userDepartments,
  userRoles,
  users,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { startRequest } from "@/domain/annual/service";
import {
  addSuggestedLeader,
  ignoreSuggestedLeader,
  pendingSuggestions,
  setDepartmentMapping,
  suggestedFor,
  syncAllMappings,
  syncDepartmentNow,
} from "@/domain/departments/pco-mapping";
import { RuleError, ValidationError } from "@/domain/errors";
import { resolveSignIn, type ExternalIdentity } from "@/domain/users/sign-in";
import { loadViewer } from "@/domain/users/viewer";
import { ForbiddenError, type Subject } from "@/lib/authz";
import { FakePlanningCenterDirectory, type FakeDirectoryData } from "@/lib/pco";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertCycle, insertDepartment, insertUser } from "./helpers/fixtures";

/* Planning Center team mapping (FR-39, AC-121 to AC-124). */

const ORG = "100";
const LEADER = { id: "77", name: "Ministry Leader", dataType: "boolean" };
const NOW = new Date("2026-10-20T17:00:00Z");

let t: TestDb;
let db: Db;
let admin: Subject;
let cycleId: string;
let seq = 0;

/** One shared fake directory; each test adds its own team and people. */
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
  cycleId = (await insertCycle(db, admin.id)).id;
});

afterAll(async () => {
  await t?.close();
});

/** A Planning Center person; a Group Leader unless `leader` is false. */
function pcoPerson(leader = true): FakeDirectoryData["people"][number] {
  const n = ++seq;
  const person = {
    id: String(9000 + n),
    name: `Team Leader ${n}`,
    status: "active",
    emails: [`team${n}@example.org`],
    fieldValues: { [LEADER.id]: [leader ? "Yes" : "No"] },
  };
  dir.data.people.push(person);
  return person;
}

/** A Services team led by these people. */
function team(leaderIds: string[]) {
  const id = String(5000 + ++seq);
  dir.data.teams!.push({ id, name: `Team ${id}`, leaderIds });
  return dir.data.teams!.at(-1)!;
}

const identity = (personId: string): ExternalIdentity => ({
  provider: "planningcenter",
  subject: personId,
  email: null,
  emailVerified: true,
  name: "PCO Person",
  organizationId: ORG,
});

const signIn = (personId: string) =>
  db.transaction((tx) => resolveSignIn(tx, { directory: dir, now: NOW }, identity(personId)));

async function versionOf(id: string) {
  const [row] = await db.select().from(departments).where(eq(departments.id, id));
  return row;
}

async function mapTo(
  departmentId: string,
  teamId: string,
  options: { mode?: "suggest" | "automatic"; countsAsLeaders?: boolean } = {},
) {
  const { version } = await versionOf(departmentId);
  await db.transaction((tx) =>
    setDepartmentMapping(tx, admin, dir, {
      id: departmentId,
      source: `services_team:${teamId}`,
      mode: options.mode ?? "suggest",
      countsAsLeaders: options.countsAsLeaders ?? false,
      version,
    }),
  );
}

async function linkOf(userId: string, departmentId: string) {
  const [row] = await db
    .select()
    .from(userDepartments)
    .where(and(eq(userDepartments.userId, userId), eq(userDepartments.departmentId, departmentId)));
  return row;
}

async function departmentsOf(userId: string) {
  const result = await loadViewer(db, userId);
  if (!result.ok) return [];
  return result.viewer.departments.map((d) => d.id);
}

describe("mapping a department (AC-121)", () => {
  it("AC-121 the administrator maps a department to a Services team loaded from Planning Center", async () => {
    const media = await insertDepartment(db);
    const t1 = team([]);
    await mapTo(media.id, t1.id);
    expect(await versionOf(media.id)).toMatchObject({
      pcoSourceType: "services_team",
      pcoSourceId: t1.id,
      pcoSourceName: t1.name,
      pcoMappingMode: "suggest",
    });
    const [audit] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, "admin.department_pco_mapping_changed"),
          eq(auditEvents.departmentId, media.id),
        ),
      );
    expect(audit?.details).toMatchObject({ after: { source: t1.name, mode: "suggest" } });

    // One team, one department; only real teams; only the administrator.
    const other = await insertDepartment(db);
    await expect(mapTo(other.id, t1.id)).rejects.toBeInstanceOf(ValidationError);
    await expect(mapTo(other.id, "999999")).rejects.toBeInstanceOf(ValidationError);
    const { version } = await versionOf(other.id);
    await expect(
      db.transaction((tx) =>
        setDepartmentMapping(tx, { id: admin.id, roles: ["accountant"], departments: [] }, dir, {
          id: other.id,
          source: "",
          mode: "suggest",
          countsAsLeaders: false,
          version,
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("Suggest mode (AC-122)", () => {
  it("AC-122 a team leader is suggested, gets access only once added, and is flagged after leaving", async () => {
    const media = await insertDepartment(db);
    const person = pcoPerson();
    const t1 = team([person.id]);
    await mapTo(media.id, t1.id);

    // A first-time leader: suggested, and told the administrator was asked.
    const result = await signIn(person.id);
    expect(result).toMatchObject({ ok: true, landing: "waiting" });
    if (!result.ok) return;
    const userId = result.userId;
    expect(await suggestedFor(db, userId)).toEqual([media.name]);
    expect(await linkOf(userId, media.id)).toBeUndefined();
    expect(await departmentsOf(userId)).toEqual([]);
    const emails = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.template, "department.leader_suggested"));
    expect(emails.length).toBeGreaterThan(0);

    const [suggestion] = await pendingSuggestions(db, media.id);
    expect(suggestion).toMatchObject({ userId });
    await db.transaction((tx) =>
      addSuggestedLeader(tx, admin, {
        id: suggestion!.id,
        slot: "primary",
        version: suggestion!.version,
      }),
    );
    expect(await linkOf(userId, media.id)).toMatchObject({
      representativeType: "primary",
      source: "pco_mapping",
      pcoStatus: "confirmed",
    });
    expect(await departmentsOf(userId)).toEqual([media.id]);
    expect(await pendingSuggestions(db, media.id)).toEqual([]);

    // Leaves the team: flagged, keeps access until the administrator removes them.
    t1.leaderIds = [];
    const sync = await db.transaction((tx) => syncDepartmentNow(tx, admin, dir, { id: media.id }));
    expect(sync.flagged).toEqual([userId]);
    expect(await linkOf(userId, media.id)).toMatchObject({ pcoStatus: "no_longer_leader" });
    expect(await departmentsOf(userId)).toEqual([media.id]);
    expect((await versionOf(media.id)).pcoLastSyncedAt).not.toBeNull();
  });

  it("an ignored suggestion stays ignored, and one who leaves first is withdrawn", async () => {
    const media = await insertDepartment(db);
    const a = pcoPerson();
    const b = pcoPerson();
    const t1 = team([a.id, b.id]);
    await mapTo(media.id, t1.id);
    const ra = await signIn(a.id);
    const rb = await signIn(b.id);
    if (!ra.ok || !rb.ok) throw new Error("sign-in failed");

    const [first] = (await pendingSuggestions(db, media.id)).filter((s) => s.userId === ra.userId);
    await db.transaction((tx) =>
      ignoreSuggestedLeader(tx, admin, { id: first!.id, version: first!.version }),
    );
    t1.leaderIds = [a.id];
    await syncAllMappings(db, dir, NOW);

    const rows = await db
      .select()
      .from(pcoLeaderSuggestions)
      .where(eq(pcoLeaderSuggestions.departmentId, media.id));
    expect(rows.find((r) => r.userId === ra.userId)?.status).toBe("ignored");
    expect(rows.find((r) => r.userId === rb.userId)?.status).toBe("withdrawn");
    expect(await pendingSuggestions(db, media.id)).toEqual([]);
  });
});

describe("Automatic mode (AC-123)", () => {
  it("AC-123 a team leader is added, and loses access at the next sync after leaving; requests stay", async () => {
    const media = await insertDepartment(db);
    const person = pcoPerson();
    const t1 = team([person.id]);
    await mapTo(media.id, t1.id, { mode: "automatic" });

    const result = await signIn(person.id);
    expect(result).toMatchObject({ ok: true, landing: "home" });
    if (!result.ok) return;
    expect(await linkOf(result.userId, media.id)).toMatchObject({
      representativeType: "representative",
      source: "pco_mapping",
    });
    const loaded = await loadViewer(db, result.userId);
    if (!loaded.ok) throw new Error("no viewer");
    const { requestId } = await db.transaction((tx) =>
      startRequest(tx, loaded.viewer, { cycleId, departmentId: media.id }),
    );

    t1.leaderIds = [];
    const summary = await syncAllMappings(db, dir, NOW);
    expect(summary.removed).toBe(1);
    expect(await linkOf(result.userId, media.id)).toBeUndefined();
    const [request] = await db
      .select({ departmentId: budgetRequests.departmentId })
      .from(budgetRequests)
      .where(eq(budgetRequests.id, requestId));
    expect(request?.departmentId).toBe(media.id);
  });

  it("never removes a Primary or Backup a person chose", async () => {
    const media = await insertDepartment(db);
    const person = pcoPerson();
    const t1 = team([person.id]);
    await mapTo(media.id, t1.id, { mode: "automatic" });
    const result = await signIn(person.id);
    if (!result.ok) throw new Error("sign-in failed");
    await db
      .update(userDepartments)
      .set({ representativeType: "primary" })
      .where(eq(userDepartments.userId, result.userId));
    t1.leaderIds = [];
    await syncAllMappings(db, dir, NOW);
    expect(await linkOf(result.userId, media.id)).toMatchObject({
      representativeType: "primary",
      pcoStatus: "no_longer_leader",
    });
  });
});

describe("Team leaders count as Group Leaders (AC-124)", () => {
  it("AC-124 a team leader without the Group Leader field gets in only when it's on", async () => {
    const media = await insertDepartment(db);
    const person = pcoPerson(false);
    const t1 = team([person.id]);
    await mapTo(media.id, t1.id, { mode: "automatic" });
    expect(await signIn(person.id)).toMatchObject({ ok: false, reason: "not-leader" });

    await mapTo(media.id, t1.id, { mode: "automatic", countsAsLeaders: true });
    const result = await signIn(person.id);
    expect(result).toMatchObject({ ok: true, landing: "home" });
    if (!result.ok) return;
    const [user] = await db.select().from(users).where(eq(users.id, result.userId));
    expect(user).toMatchObject({ pcoLeaderVerified: true });
    expect(await departmentsOf(result.userId)).toEqual([media.id]);
  });
});

describe("outages and problems", () => {
  it("an outage or a deleted team changes nothing and is recorded", async () => {
    const media = await insertDepartment(db);
    const person = pcoPerson();
    const t1 = team([person.id]);
    await mapTo(media.id, t1.id, { mode: "automatic" });
    const result = await signIn(person.id);
    if (!result.ok) throw new Error("sign-in failed");

    dir.data.unavailable = true;
    const down = await syncAllMappings(db, dir, NOW);
    dir.data.unavailable = false;
    expect(down.problems).toBeGreaterThan(0);
    expect(await linkOf(result.userId, media.id)).toBeDefined();

    dir.data.teams = dir.data.teams!.filter((x) => x.id !== t1.id);
    await expect(
      db.transaction((tx) => syncDepartmentNow(tx, admin, dir, { id: media.id })),
    ).rejects.toBeInstanceOf(RuleError);
    expect(await linkOf(result.userId, media.id)).toBeDefined();
    const problems = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, "admin.pco_mapping_sync_problem"),
          eq(auditEvents.departmentId, media.id),
        ),
      );
    expect(problems.length).toBeGreaterThan(0);
  });
});
