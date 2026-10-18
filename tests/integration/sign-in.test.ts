import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appSettings,
  auditEvents,
  budgetRequests,
  emailOutbox,
  userDepartments,
  userRoles,
  users,
} from "@/db/schema";
import type { Db } from "@/db/types";
import { runPcoVerification } from "@/domain/users/pco-verify-job";
import { resolveSignIn, type ExternalIdentity } from "@/domain/users/sign-in";
import { loadViewer } from "@/domain/users/viewer";
import { FakePlanningCenterDirectory, type FakeDirectoryData } from "@/lib/pco";
import type { Role } from "@/lib/roles";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertCycle, insertDepartment, insertDraft, insertUser } from "./helpers/fixtures";

const ORG = "100";
const FIELD = { id: "77", name: "Ministry Leader", dataType: "boolean" };
const NOW = new Date("2026-10-20T17:00:00Z");
const HOURS = 60 * 60 * 1000;

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

/** A unique Planning Center person, as the API would return them. */
function person(fieldValue: string | null, extra: { email?: string; status?: string } = {}) {
  const n = ++seq;
  return {
    id: String(5000 + n),
    name: `Person ${n}`,
    status: extra.status ?? "active",
    emails: [extra.email ?? `person${n}@example.org`],
    fieldValues: fieldValue === null ? {} : { [FIELD.id]: [fieldValue] },
  };
}

function directory(people: FakeDirectoryData["people"], extra: Partial<FakeDirectoryData> = {}) {
  return new FakePlanningCenterDirectory({
    organizationId: ORG,
    fields: [FIELD],
    people,
    ...extra,
  });
}

/** An address an emailed code proved (email-sign-in.ts checked the code). */
const emailCode = (email: string): ExternalIdentity => ({
  provider: "email",
  subject: email,
  email,
  emailVerified: true,
  name: null,
});

/** A staff account linked to its own Planning Center person (no Group Leader field). */
async function linkedStaff(roles: Role[], overrides: Partial<typeof users.$inferInsert> = {}) {
  const pcoPerson = person(null);
  const user = await staffUser(roles, {
    email: pcoPerson.emails[0],
    pcoPersonId: pcoPerson.id,
    ...overrides,
  });
  return { user, pcoPerson };
}

const planningCenter = (personId: string, email: string | null = null): ExternalIdentity => ({
  provider: "planningcenter",
  subject: personId,
  email,
  emailVerified: true,
  name: "PCO Person",
  organizationId: ORG,
});

function signIn(dir: FakePlanningCenterDirectory | null, identity: ExternalIdentity, now = NOW) {
  return db.transaction((tx) => resolveSignIn(tx, { directory: dir, now }, identity));
}

async function staffUser(roles: Role[], overrides: Partial<typeof users.$inferInsert> = {}) {
  const user = await insertUser(db, { accessStatus: "active", ...overrides });
  for (const role of roles) await db.insert(userRoles).values({ userId: user.id, role });
  return user;
}

async function giveDepartment(userId: string) {
  const department = await insertDepartment(db);
  await db.insert(userDepartments).values({ userId, departmentId: department.id });
  return department;
}

async function lastAudit(userId: string, eventType: string) {
  const rows = await db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.entityId, userId), eq(auditEvents.eventType, eventType)));
  return rows.at(-1);
}

async function setSetting(key: string, value: string) {
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}

describe("Planning Center sign-in (FR-01a)", () => {
  it("AC-7 a Group Leader (Ministry Leader = Yes) gets in and waits for a department", async () => {
    const leader = person("true");
    const result = await signIn(directory([leader]), planningCenter(leader.id));
    expect(result).toMatchObject({ ok: true, landing: "waiting" });
    if (!result.ok) return;

    const [user] = await db.select().from(users).where(eq(users.id, result.userId));
    expect(user).toMatchObject({
      pcoPersonId: leader.id,
      email: leader.emails[0],
      pcoLeaderVerified: true,
      pcoFieldValueSnapshot: "true",
      accessStatus: "pending_department",
    });
    expect(await loadViewer(db, user.id)).toEqual({ ok: false, reason: "waiting" });
    // The annual form's first step lets them in to pick a department (FR-03, FR-38).
    expect(await loadViewer(db, user.id, { allowWaiting: true })).toMatchObject({
      ok: true,
      viewer: { roles: ["requester"], departments: [] },
    });
    expect(await lastAudit(user.id, "access.leader_granted")).toBeDefined();
    expect(await lastAudit(user.id, "access.sign_in_succeeded")).toMatchObject({
      details: { method: "planningcenter" },
    });
  });

  it.each([["Yes"], ["yes"], ["TRUE"], ["1"]])(
    "accepts a Yes/No field stored as %j",
    async (stored) => {
      const leader = person(stored);
      expect(await signIn(directory([leader]), planningCenter(leader.id))).toMatchObject({
        ok: true,
      });
    },
  );

  it.each([["false"], ["No"], [null]])(
    "AC-7 denies requester access when the field is %j",
    async (stored) => {
      const member = person(stored);
      expect(await signIn(directory([member]), planningCenter(member.id))).toEqual({
        ok: false,
        reason: "not-leader",
        email: null,
      });
    },
  );

  it("denies a Planning Center account from another church", async () => {
    const leader = person("true");
    const result = await signIn(directory([leader]), {
      ...planningCenter(leader.id),
      organizationId: "999",
    });
    expect(result).toMatchObject({ ok: false, reason: "not-allowed" });
  });

  it("never links a Planning Center sign-in to an existing account by email", async () => {
    const staff = await staffUser(["accountant"], { email: "treasurer@example.org" });
    const impostor = person("true", { email: "treasurer@example.org" });
    const result = await signIn(
      directory([impostor]),
      planningCenter(impostor.id, "treasurer@example.org"),
    );
    expect(result).toMatchObject({ ok: false, reason: "link-required" });
    const [after] = await db.select().from(users).where(eq(users.id, staff.id));
    expect(after.pcoPersonId).toBeNull();
  });

  it("uses the administrator's field and values, not hard-coded ones", async () => {
    await setSetting("pco_leader_field_name", "Ministry Role");
    await setSetting("pco_leader_accepted_values", JSON.stringify(["Group Leader"]));
    try {
      const role = { id: "88", name: "Ministry Role", dataType: "string" };
      const leader = { ...person(null), fieldValues: { "88": ["Group Leader"] } };
      const dir = new FakePlanningCenterDirectory({
        organizationId: ORG,
        fields: [role],
        people: [leader],
      });
      expect(await signIn(dir, planningCenter(leader.id))).toMatchObject({ ok: true });
    } finally {
      await setSetting("pco_leader_field_name", "Ministry Leader");
      await setSetting("pco_leader_accepted_values", JSON.stringify(["Yes"]));
    }
  });

  it("reports Planning Center as unavailable when the configured field doesn't exist", async () => {
    const leader = person("true");
    const dir = new FakePlanningCenterDirectory({
      organizationId: ORG,
      fields: [],
      people: [leader],
    });
    expect(await signIn(dir, planningCenter(leader.id))).toMatchObject({
      ok: false,
      reason: "unavailable",
    });
  });
});

describe("Planning Center sign-in for new people and staff (FR-01a, FR-21)", () => {
  it("AC-6 an administrator-linked Planning Center profile reaches the staff account", async () => {
    const { user, pcoPerson } = await linkedStaff(["accountant"]);
    expect(await signIn(directory([pcoPerson]), planningCenter(pcoPerson.id))).toEqual({
      ok: true,
      userId: user.id,
      landing: "home",
    });
  });

  it("AC-8 denies someone whose Planning Center profile the church can't find", async () => {
    expect(await signIn(directory([]), planningCenter("424242", "stranger@example.org"))).toEqual({
      ok: false,
      reason: "not-found",
      email: "stranger@example.org",
    });
  });

  it("FR-21 tells the administrators about an access request, but not about an outage refusal", async () => {
    const administrator = await staffUser(["system_admin"]);
    await signIn(directory([]), planningCenter("434343", "wants.in@example.org"));
    await signIn(
      directory([], { unavailable: true }),
      planningCenter("444444", "outage@example.org"),
    );
    const requests = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.template, "access.request"));
    expect(requests.map((r) => [r.toUserId, r.subject])).toEqual([
      [administrator.id, "Access request: PCO Person (wants.in@example.org)"],
    ]);
  });

  it("AC-2 does not let a Planning Center account in just because it can sign in", async () => {
    const member = person("No", { email: "member@example.org" });
    expect(
      await signIn(directory([member]), planningCenter(member.id, "member@example.org")),
    ).toMatchObject({ ok: false, reason: "not-leader" });
    expect(await db.select().from(users).where(eq(users.email, "member@example.org"))).toEqual([]);
  });

  it("refuses Google, which the church doesn't use", async () => {
    const staff = await staffUser(["accountant"]);
    const google = { ...emailCode(staff.email), provider: "google" } as unknown as ExternalIdentity;
    expect(await signIn(directory([]), google)).toMatchObject({ ok: false, reason: "not-allowed" });
  });
});

describe("emailed-code sign-in (FR-01b)", () => {
  it("lets the Church Administrator in, and links their Planning Center profile when one matches", async () => {
    const admin = await staffUser(["church_admin"], { email: "office@outlook.com" });
    const pcoPerson = person(null, { email: "office@outlook.com" });
    expect(await signIn(directory([pcoPerson]), emailCode("Office@Outlook.com"))).toEqual({
      ok: true,
      userId: admin.id,
      landing: "home",
    });
    const [after] = await db.select().from(users).where(eq(users.id, admin.id));
    expect(after.pcoPersonId).toBe(pcoPerson.id);
    expect(await lastAudit(admin.id, "access.identity_linked")).toMatchObject({
      details: { by: "emailed code" },
    });
  });

  it("refuses other roles and unknown addresses, without an access request", async () => {
    const accountant = await staffUser(["accountant"]);
    expect(await signIn(directory([]), emailCode(accountant.email))).toMatchObject({
      ok: false,
      reason: "not-allowed",
    });
    expect(await signIn(directory([]), emailCode("unknown@outlook.com"))).toMatchObject({
      ok: false,
      reason: "not-allowed",
    });
    const requests = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.template, "access.request"));
    expect(requests.some((r) => r.subject.includes("unknown@outlook.com"))).toBe(false);
  });

  it("respects the Allow email sign-in setting", async () => {
    await setSetting("signin_email_enabled", "false");
    try {
      const admin = await staffUser(["system_admin"]);
      expect(await signIn(directory([]), emailCode(admin.email))).toMatchObject({
        ok: false,
        reason: "not-allowed",
      });
    } finally {
      await setSetting("signin_email_enabled", "true");
    }
  });
});

describe("staff (AC-10) and deactivated accounts", () => {
  it("AC-10 lets the accountant and Church Administrator in without the field", async () => {
    for (const role of ["accountant", "church_admin"] as const) {
      const { user, pcoPerson } = await linkedStaff([role]);
      expect(await signIn(directory([pcoPerson]), planningCenter(pcoPerson.id))).toEqual({
        ok: true,
        userId: user.id,
        landing: "home",
      });
    }
  });

  it("requires the field for staff only when the administrator turns that on", async () => {
    await setSetting("pco_require_for_staff", "true");
    try {
      const { pcoPerson } = await linkedStaff(["accountant"]);
      expect(await signIn(directory([pcoPerson]), planningCenter(pcoPerson.id))).toMatchObject({
        ok: false,
        reason: "not-leader",
      });
    } finally {
      await setSetting("pco_require_for_staff", "false");
    }
  });

  it("refuses a deactivated account", async () => {
    const { user, pcoPerson } = await linkedStaff(["accountant"], { active: false });
    expect(await signIn(directory([pcoPerson]), planningCenter(pcoPerson.id))).toMatchObject({
      ok: false,
      reason: "not-allowed",
    });
    expect(await loadViewer(db, user.id)).toEqual({ ok: false, reason: "not-allowed" });
  });

  it("audits a failed sign-in with the method and reason", async () => {
    await signIn(directory([]), planningCenter("454545", "nobody@example.org"));
    const all = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "access.sign_in_failed"));
    const row = all.find((r) => (r.details as { email?: string }).email === "nobody@example.org");
    expect(row).toMatchObject({
      area: "access",
      details: { method: "planningcenter", result: "not-found" },
    });
  });
});

describe("suspension and the 72-hour rule (AC-9)", () => {
  async function verifiedRequester(hoursAgo: number, extraRoles: Role[] = []) {
    const pcoPerson = person("true");
    const user = await staffUser(["requester", ...extraRoles], {
      email: pcoPerson.emails[0],
      pcoPersonId: pcoPerson.id,
      pcoLeaderVerified: true,
      pcoVerifiedAt: new Date(NOW.getTime() - hoursAgo * HOURS),
    });
    await giveDepartment(user.id);
    return { user, pcoPerson };
  }

  it("AC-9 suspends a requester whose field was removed, and keeps their drafts", async () => {
    const { user, pcoPerson } = await verifiedRequester(1);
    const cycleOwner = await insertUser(db);
    const cycle = await insertCycle(db, cycleOwner.id, { budgetYear: 2040 + (seq % 50) });
    const [dept] = await db
      .select({ id: userDepartments.departmentId })
      .from(userDepartments)
      .where(eq(userDepartments.userId, user.id));
    const draft = await insertDraft(db, {
      cycleId: cycle.id,
      departmentId: dept.id,
      userId: user.id,
    });

    pcoPerson.fieldValues = { [FIELD.id]: ["false"] };
    expect(await signIn(directory([pcoPerson]), planningCenter(pcoPerson.id))).toMatchObject({
      ok: false,
      reason: "suspended",
    });
    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after).toMatchObject({ accessStatus: "suspended_not_leader", pcoLeaderVerified: false });
    expect(await lastAudit(user.id, "access.leader_suspended")).toBeDefined();
    expect(
      await db.select().from(budgetRequests).where(eq(budgetRequests.id, draft.id)),
    ).toHaveLength(1);
    expect(await loadViewer(db, user.id)).toEqual({ ok: false, reason: "suspended" });
    // Signing in again still explains the suspension.
    expect(await signIn(directory([pcoPerson]), planningCenter(pcoPerson.id))).toMatchObject({
      ok: false,
      reason: "suspended",
    });
  });

  it("restores a suspended leader once Planning Center confirms them again", async () => {
    const { user, pcoPerson } = await verifiedRequester(1);
    pcoPerson.fieldValues = {};
    await signIn(directory([pcoPerson]), planningCenter(pcoPerson.id));
    pcoPerson.fieldValues = { [FIELD.id]: ["Yes"] };
    expect(await signIn(directory([pcoPerson]), planningCenter(pcoPerson.id))).toMatchObject({
      ok: true,
      landing: "home",
    });
    expect(await lastAudit(user.id, "access.leader_restored")).toBeDefined();
    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after.accessStatus).toBe("active");
  });

  it("keeps a suspended requester's other roles", async () => {
    const { user, pcoPerson } = await verifiedRequester(1, ["accountant"]);
    pcoPerson.fieldValues = {};
    expect(await signIn(directory([pcoPerson]), planningCenter(pcoPerson.id))).toMatchObject({
      ok: true,
    });
    const viewer = await loadViewer(db, user.id);
    expect(viewer).toMatchObject({ ok: true, viewer: { roles: ["accountant"], departments: [] } });
  });

  it("lets someone verified in the last 72 hours in while Planning Center is down", async () => {
    const { user, pcoPerson } = await verifiedRequester(71);
    const down = directory([pcoPerson], { unavailable: true });
    expect(await signIn(down, planningCenter(pcoPerson.id))).toMatchObject({
      ok: true,
      landing: "home",
    });
    expect(await lastAudit(user.id, "access.pco_unavailable")).toMatchObject({
      details: { usingGracePeriod: true },
    });
  });

  it("turns away someone verified more than 72 hours ago while Planning Center is down", async () => {
    const { user, pcoPerson } = await verifiedRequester(73);
    const down = directory([pcoPerson], { unavailable: true });
    expect(await signIn(down, planningCenter(pcoPerson.id))).toMatchObject({
      ok: false,
      reason: "unavailable",
    });
    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after.accessStatus).toBe("active");
  });

  it("treats a missing Planning Center configuration as an outage", async () => {
    const { pcoPerson } = await verifiedRequester(80);
    expect(await signIn(null, planningCenter(pcoPerson.id))).toMatchObject({
      ok: false,
      reason: "unavailable",
    });
  });
});

describe("nightly pco-verify job", () => {
  it("AC-9 suspends removed leaders, keeps current ones, and logs a summary", async () => {
    const keep = person("true");
    const drop = person("true");
    const kept = await staffUser(["requester"], {
      pcoPersonId: keep.id,
      pcoLeaderVerified: true,
      pcoVerifiedAt: NOW,
    });
    const dropped = await staffUser(["requester"], {
      pcoPersonId: drop.id,
      pcoLeaderVerified: true,
      pcoVerifiedAt: NOW,
    });
    drop.fieldValues = { [FIELD.id]: ["false"] };

    const summary = await runPcoVerification(db, directory([keep, drop]), NOW);
    expect(summary.unavailable).toBe(false);
    expect(summary.checked).toBeGreaterThanOrEqual(2);

    const [a] = await db.select().from(users).where(eq(users.id, kept.id));
    const [b] = await db.select().from(users).where(eq(users.id, dropped.id));
    expect(a.pcoLeaderVerified).toBe(true);
    expect(b).toMatchObject({ pcoLeaderVerified: false, accessStatus: "suspended_not_leader" });
    expect(await lastAudit(dropped.id, "access.leader_suspended")).toMatchObject({
      actorKind: "job",
    });
  });

  it("changes nothing when Planning Center is down", async () => {
    const leader = person("true");
    const user = await staffUser(["requester"], {
      pcoPersonId: leader.id,
      pcoLeaderVerified: true,
      pcoVerifiedAt: NOW,
    });
    const summary = await runPcoVerification(db, directory([], { unavailable: true }), NOW);
    expect(summary).toEqual({
      checked: 0,
      verified: 0,
      suspended: 0,
      departmentsJoined: 0,
      mappings: null,
      phonesChanged: 0,
      unavailable: true,
    });
    const [after] = await db.select().from(users).where(eq(users.id, user.id));
    expect(after.pcoLeaderVerified).toBe(true);
  });
});
