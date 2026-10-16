import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { appSettings, auditEvents, userDepartments, userRoles, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { departmentPicker } from "@/domain/annual/queries";
import { startRequest } from "@/domain/annual/service";
import { setPlanningCenterValue } from "@/domain/departments/service";
import { RuleError, ValidationError } from "@/domain/errors";
import { runPcoVerification } from "@/domain/users/pco-verify-job";
import { resolveSignIn, type ExternalIdentity } from "@/domain/users/sign-in";
import { loadViewer } from "@/domain/users/viewer";
import type { Subject } from "@/lib/authz";
import { FakePlanningCenterDirectory, type FakeDirectoryData } from "@/lib/pco";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertCycle, insertDepartment, insertUser } from "./helpers/fixtures";

const ORG = "100";
const LEADER = { id: "77", name: "Ministry Leader", dataType: "boolean" };
const MINISTRY = { id: "88", name: "Ministry Department", dataType: "checkboxes" };
const NOW = new Date("2026-10-20T17:00:00Z");

let t: TestDb;
let db: Db;
let admin: Subject;
let cycleId: string;
let seq = 0;

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

beforeEach(async () => {
  await setMode("suggest");
});

async function setMode(mode: "off" | "suggest" | "restrict") {
  await db
    .insert(appSettings)
    .values({ key: "pco_department_mode", value: mode })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: mode } });
}

/** A Planning Center Group Leader whose Ministry Department lists `ministries`. */
function leader(ministries: string[]) {
  const n = ++seq;
  return {
    id: String(7000 + n),
    name: `Leader ${n}`,
    status: "active",
    emails: [`leader${n}@example.org`],
    fieldValues: { [LEADER.id]: ["Yes"], [MINISTRY.id]: ministries },
  };
}

function directory(people: FakeDirectoryData["people"], extra: Partial<FakeDirectoryData> = {}) {
  return new FakePlanningCenterDirectory({
    organizationId: ORG,
    fields: [LEADER, MINISTRY],
    people,
    ...extra,
  });
}

const viaPlanningCenter = (personId: string): ExternalIdentity => ({
  provider: "planningcenter",
  subject: personId,
  email: null,
  emailVerified: true,
  name: "PCO Person",
  organizationId: ORG,
});

function signIn(dir: FakePlanningCenterDirectory, personId: string, now = NOW) {
  return db.transaction((tx) =>
    resolveSignIn(tx, { directory: dir, now }, viaPlanningCenter(personId)),
  );
}

async function viewerOf(userId: string) {
  const result = await loadViewer(db, userId);
  if (!result.ok) throw new Error(result.reason);
  return result.viewer;
}

async function linkOf(userId: string, departmentId: string) {
  const [row] = await db
    .select()
    .from(userDepartments)
    .where(and(eq(userDepartments.userId, userId), eq(userDepartments.departmentId, departmentId)));
  return row;
}

describe("Ministry Department at sign-in (Suggest)", () => {
  it("a new leader lands on their department as its Primary, not the waiting screen", async () => {
    const media = await insertDepartment(db);
    const person = leader([media.name.toUpperCase()]);
    const result = await signIn(directory([person]), person.id);
    expect(result).toMatchObject({ ok: true, landing: "home" });
    if (!result.ok) return;
    const [user] = await db.select().from(users).where(eq(users.id, result.userId));
    expect(user).toMatchObject({
      accessStatus: "active",
      pcoMinistryDepartments: [media.name.toUpperCase()],
    });
    expect(await linkOf(result.userId, media.id)).toMatchObject({
      representativeType: "primary",
      source: "pco_mapping",
      pcoStatus: "confirmed",
    });
  });

  it("a second leader joins as Representative; a checkboxes field gives several departments", async () => {
    const a = await insertDepartment(db);
    const b = await insertDepartment(db);
    const first = leader([a.name]);
    const second = leader([` ${a.name} `, b.name]);
    await signIn(directory([first]), first.id);
    const result = await signIn(directory([second]), second.id);
    if (!result.ok) throw new Error("sign-in failed");
    expect((await linkOf(result.userId, a.id)).representativeType).toBe("representative");
    expect((await linkOf(result.userId, b.id)).representativeType).toBe("primary");
  });

  it("matches the department's Planning Center value instead of its name", async () => {
    const dept = await insertDepartment(db);
    await db.transaction((tx) =>
      setPlanningCenterValue(tx, admin, { id: dept.id, value: "Media / Production", version: 1 }),
    );
    const byName = leader([dept.name]);
    const byValue = leader(["media / production"]);
    const r1 = await signIn(directory([byName]), byName.id);
    const r2 = await signIn(directory([byValue]), byValue.id);
    if (!r1.ok || !r2.ok) throw new Error("sign-in failed");
    expect(await linkOf(r1.userId, dept.id)).toBeUndefined();
    expect(await linkOf(r2.userId, dept.id)).toBeDefined();
  });

  it("a department dropped from the field is flagged, not removed; added back, it's confirmed again", async () => {
    const dept = await insertDepartment(db);
    const person = leader([dept.name]);
    const result = await signIn(directory([person]), person.id);
    if (!result.ok) throw new Error("sign-in failed");

    await signIn(
      directory([{ ...person, fieldValues: { ...person.fieldValues, [MINISTRY.id]: [] } }]),
      person.id,
    );
    expect(await linkOf(result.userId, dept.id)).toMatchObject({ pcoStatus: "no_longer_leader" });
    const [flagged] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, "admin.pco_department_no_longer_listed"),
          eq(auditEvents.departmentId, dept.id),
        ),
      );
    expect(flagged).toBeDefined();

    await signIn(directory([person]), person.id);
    expect(await linkOf(result.userId, dept.id)).toMatchObject({ pcoStatus: "confirmed" });
  });

  it("Planning Center down or the field missing keeps the last known values", async () => {
    const dept = await insertDepartment(db);
    const person = leader([dept.name]);
    const result = await signIn(directory([person]), person.id);
    if (!result.ok) throw new Error("sign-in failed");
    // The field was deleted in Planning Center: the leader check still passes, nothing changes.
    const noField = new FakePlanningCenterDirectory({
      organizationId: ORG,
      fields: [LEADER],
      people: [{ ...person, fieldValues: { [LEADER.id]: ["Yes"] } }],
    });
    expect(await signIn(noField, person.id)).toMatchObject({ ok: true });
    expect(await linkOf(result.userId, dept.id)).toMatchObject({ pcoStatus: "confirmed" });
    const [user] = await db.select().from(users).where(eq(users.id, result.userId));
    expect(user.pcoMinistryDepartments).toEqual([dept.name]);
  });

  it("Off changes nothing: the leader still waits for a department", async () => {
    await setMode("off");
    const dept = await insertDepartment(db);
    const person = leader([dept.name]);
    const result = await signIn(directory([person]), person.id);
    expect(result).toMatchObject({ ok: true, landing: "waiting" });
    if (!result.ok) return;
    expect(await linkOf(result.userId, dept.id)).toBeUndefined();
  });

  it("the nightly job joins departments added in Planning Center", async () => {
    const dept = await insertDepartment(db);
    const person = leader([]);
    const result = await signIn(directory([person]), person.id);
    if (!result.ok) throw new Error("sign-in failed");
    const later = { ...person, fieldValues: { ...person.fieldValues, [MINISTRY.id]: [dept.name] } };
    const summary = await runPcoVerification(db, directory([later]), NOW);
    expect(summary.departmentsJoined).toBeGreaterThanOrEqual(1);
    expect(await linkOf(result.userId, dept.id)).toMatchObject({ source: "pco_mapping" });
  });
});

describe("Ministry Department on the form", () => {
  it("Suggest lists Planning Center departments first and still offers the rest and Other", async () => {
    const dept = await insertDepartment(db);
    const person = leader([dept.name]);
    const result = await signIn(directory([person]), person.id);
    if (!result.ok) throw new Error("sign-in failed");
    const me = await viewerOf(result.userId);
    const picker = await db.transaction((tx) => departmentPicker(tx, me, cycleId));
    expect(picker.allowOther).toBe(true);
    expect(picker.choices[0]).toMatchObject({ id: dept.id, fromPlanningCenter: true });
    expect(picker.choices.length).toBeGreaterThan(1);
  });

  it("Restrict allows only matched and administrator-assigned departments, and no Other", async () => {
    const mine = await insertDepartment(db);
    const assigned = await insertDepartment(db);
    const other = await insertDepartment(db);
    const person = leader([mine.name]);
    const result = await signIn(directory([person]), person.id);
    if (!result.ok) throw new Error("sign-in failed");
    await db.insert(userDepartments).values({
      userId: result.userId,
      departmentId: assigned.id,
      representativeType: "representative",
      source: "manual",
      assignedByUserId: admin.id,
    });
    await setMode("restrict");
    const me = await viewerOf(result.userId);

    const picker = await db.transaction((tx) => departmentPicker(tx, me, cycleId));
    expect(picker).toMatchObject({ allowOther: false, restricted: true });
    expect(picker.choices.map((c) => c.id).sort()).toEqual([mine.id, assigned.id].sort());

    await expect(
      db.transaction((tx) => startRequest(tx, me, { cycleId, departmentId: other.id })),
    ).rejects.toBeInstanceOf(RuleError);
    await expect(
      db.transaction((tx) => startRequest(tx, me, { cycleId, otherName: "Brand new team" })),
    ).rejects.toBeInstanceOf(RuleError);
    const started = await db.transaction((tx) =>
      startRequest(tx, me, { cycleId, departmentId: assigned.id }),
    );
    expect(started.departmentId).toBe(assigned.id);
  });
});

describe("the department's Planning Center value (admin)", () => {
  it("refuses a value another department already matches, and is audited", async () => {
    const taken = await insertDepartment(db);
    const dept = await insertDepartment(db);
    await expect(
      db.transaction((tx) =>
        setPlanningCenterValue(tx, admin, {
          id: dept.id,
          value: taken.name.toLowerCase(),
          version: 1,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await db.transaction((tx) =>
      setPlanningCenterValue(tx, admin, { id: dept.id, value: "Youth Ministry", version: 1 }),
    );
    const [audit] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, "admin.department_pco_value_changed"),
          eq(auditEvents.departmentId, dept.id),
        ),
      );
    expect(audit.details).toMatchObject({ after: { pcoValue: "Youth Ministry" } });
  });
});
