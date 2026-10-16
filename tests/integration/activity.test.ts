import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { budgetRequests, userRoles } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import {
  activityOptions,
  activityPeople,
  allActivity,
  listActivity,
} from "@/domain/analytics/activity";
import { buildAnnualExport } from "@/domain/annual/export";
import { decideRequest } from "@/domain/annual/review";
import { saveDraft, startRequest, submitRequest } from "@/domain/annual/service";
import { globalSearch } from "@/domain/search";
import { updateTaxRate, settingVersions } from "@/domain/settings/service";
import { loadViewer } from "@/domain/users/viewer";
import { writeAudit } from "@/lib/audit";
import type { Subject } from "@/lib/authz";
import type { Role } from "@/lib/roles";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertCycle, insertDepartment, insertUser } from "./helpers/fixtures";

const NOW = new Date("2026-10-20T17:00:00Z");

let t: TestDb;
let db: Db;
let admin: Subject;
let accountant: Subject;
let leaderA: Subject;
let leaderB: Subject;
let requestA: string;
let requestB: string;
let draftA: string;
let departmentA: string;
let departmentB: string;
let referenceA: string;

const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

async function person(role: Role, name?: string): Promise<Subject> {
  const row = await insertUser(db, {
    accessStatus: role === "requester" ? "pending_department" : "active",
    pcoLeaderVerified: role === "requester",
    pcoVerifiedAt: NOW,
    ...(name ? { displayName: name } : {}),
  });
  await db.insert(userRoles).values({ userId: row.id, role });
  return { id: row.id, roles: [role], departments: [] };
}

async function fresh(subject: Subject): Promise<Subject> {
  const result = await loadViewer(db, subject.id);
  if (!result.ok) throw new Error(`No viewer: ${result.reason}`);
  return result.viewer;
}

/** A leader starts a budget in their department and submits it (or leaves a draft). */
async function budget(leader: Subject, cycleId: string, departmentId: string, submit = true) {
  const { requestId } = await run((tx) => startRequest(tx, leader, { cycleId, departmentId }));
  const me = await fresh(leader);
  const saved = await run((tx) =>
    saveDraft(tx, me, {
      id: requestId,
      version: 1,
      title: "Sound desk",
      justification: "Hums.",
      lines: [{ name: "Mixer", quantity: "1", unitPrice: "1,025.00" }],
    }),
  );
  if (submit) {
    await run((tx) =>
      submitRequest(
        tx,
        me,
        { id: requestId, version: saved.version, idempotencyKey: randomUUID() },
        { now: NOW },
      ),
    );
  }
  return { requestId, me };
}

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  admin = await person("system_admin");
  accountant = await person("accountant", "Accountant Ana");
  const cycleId = (await insertCycle(db, admin.id)).id;
  departmentA = (await insertDepartment(db, { name: "Activity Choir" })).id;
  departmentB = (await insertDepartment(db, { name: "Activity Ushers" })).id;

  const a = await budget(await person("requester", "Leader Lee"), cycleId, departmentA);
  leaderA = a.me;
  requestA = a.requestId;
  const b = await budget(await person("requester", "Leader Bo"), cycleId, departmentB);
  leaderB = b.me;
  requestB = b.requestId;
  // A second draft in department A, with a fresh leader, isn't possible (one per cycle):
  // use another cycle for a draft that has only entity_id links.
  const nextCycle = (await insertCycle(db, admin.id, { name: "FY2028", budgetYear: 2028 })).id;
  draftA = (await budget(leaderA, nextCycle, departmentA, false)).requestId;

  const [{ version }] = await db
    .select()
    .from(budgetRequests)
    .where(eq(budgetRequests.id, requestA));
  await run((tx) =>
    decideRequest(
      tx,
      accountant,
      {
        id: requestA,
        version,
        idempotencyKey: randomUUID(),
        decision: {
          kind: "approve_different_amount",
          approvedTotal: "1,000.00",
          note: "Board said so",
        },
      },
      { now: NOW },
    ),
  );
  referenceA = (await db.select().from(budgetRequests).where(eq(budgetRequests.id, requestA)))[0]
    .referenceNumber!;

  await run(async (tx) =>
    updateTaxRate(tx, admin, {
      percent: "13",
      versions: await settingVersions(tx, ["sales_tax_rate"]),
    }),
  );
  await writeAudit(db, {
    actor: { kind: "system" },
    area: "access",
    eventType: "access.sign_in_failed",
    entity: { type: "user" },
    reason: "No account",
    details: { method: "planningcenter", email: "stranger@example.org" },
  });
  await run((tx) => buildAnnualExport(tx, accountant, { requestId: requestB }, { now: NOW }));
});

afterAll(async () => {
  await t?.close();
});

const types = (items: { eventType: string }[]) => items.map((i) => i.eventType);

describe("Activity tab (FR-52, AC-125, AC-126)", () => {
  it("AC-125 the administrator sees every kind of event, with actor, role, time, item and reason", async () => {
    const { items } = await listActivity(db, admin, {}, { pageSize: 500 });
    expect(types(items)).toEqual(
      expect.arrayContaining([
        "annual.draft_started",
        "annual.submitted",
        "annual.approved",
        "admin.tax_rate_changed",
        "access.sign_in_failed",
        "annual.exported",
      ]),
    );
    const approved = items.find((i) => i.eventType === "annual.approved")!;
    expect(approved).toMatchObject({
      actor: { id: accountant.id, name: "Accountant Ana" },
      actingRole: "accountant",
      request: { id: requestA, reference: referenceA },
      department: { id: departmentA, name: "Activity Choir" },
      cycle: "FY2027",
      reason: "Board said so",
    });
    // Newest first.
    expect(items[0].at.getTime()).toBeGreaterThanOrEqual(items.at(-1)!.at.getTime());
  });

  it("the accountant sees the financial log, not sign-ins or settings", async () => {
    const seen = types((await listActivity(db, accountant, {}, { pageSize: 500 })).items);
    expect(seen).toEqual(expect.arrayContaining(["annual.submitted", "annual.approved"]));
    expect(seen).not.toContain("access.sign_in_failed");
    expect(seen).not.toContain("admin.tax_rate_changed");
  });

  it("staff don't see the administration log, not even their own sign-ins or settings", async () => {
    const pat = await person("accountant");
    for (const [area, eventType] of [
      ["access", "access.sign_in_failed"],
      ["access", "access.denied"],
      ["admin", "user.away_set"],
      ["admin", "admin.activity_exported"],
    ] as const) {
      await writeAudit(db, {
        actor: { kind: "user", userId: pat.id, actingRole: "accountant" },
        area,
        eventType,
        entity: { type: "user", id: pat.id },
      });
    }
    await writeAudit(db, {
      actor: { kind: "system" },
      area: "admin",
      eventType: "notifications.email_failed",
      entity: { type: "email_outbox" },
    });
    const seen = types((await listActivity(db, pat, {}, { pageSize: 500 })).items);
    expect(seen.filter((e) => /^(access|admin|user|notifications)\./.test(e))).toEqual([]);
    expect(seen).toContain("annual.approved");

    // An administrator-only view typed into the address shows their usual log instead.
    for (const quick of ["access", "settings", "emails"]) {
      const viewed = await listActivity(db, pat, { quick }, { pageSize: 500 });
      expect(types(viewed.items)).toEqual(seen);
    }
    expect(
      types((await listActivity(db, pat, { area: "admin" }, { pageSize: 500 })).items),
    ).toEqual(seen);

    // The administrator still sees all of it.
    const all = types((await listActivity(db, admin, {}, { pageSize: 500 })).items);
    expect(all).toEqual(
      expect.arrayContaining(["access.denied", "user.away_set", "notifications.email_failed"]),
    );
  });

  it("offers each role only the views and filters it can use", () => {
    const staff = activityOptions(accountant);
    expect(staff.quickViews).toEqual(["today", "decisionsWeek", "money"]);
    expect(staff.areas).toEqual(["annual", "expenses", "spending"]);
    expect(staff.groups).not.toContain("access");
    expect(staff.roles).not.toContain("system_admin");
    expect(activityOptions({ id: "c", roles: ["church_admin"], departments: [] }).areas).toEqual([
      "spending",
    ]);
    const everything = activityOptions(admin);
    expect(everything.quickViews).toContain("emails");
    expect(everything.areas).toContain("access");
    expect(everything.roles).toContain("system_admin");
  });

  // Analytics & Audit is staff-only (docs/decisions.md, 2026-10-16); this scope now serves a
  // leader's "Activity on this budget" page.
  it("AC-128 a leader's budget history holds only their own department, without internal exports", async () => {
    const { items } = await listActivity(db, leaderA, {}, { pageSize: 500 });
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const own = item.actor?.id === leaderA.id;
      expect(own || item.department?.id === departmentA, item.eventType).toBe(true);
    }
    expect(types(items)).toContain("annual.approved");
    // Bo's department, and the accountant's export of it, stay out of sight.
    expect(items.some((i) => i.request?.id === requestB)).toBe(false);
    const forB = await listActivity(db, leaderA, { departmentId: departmentB });
    expect(forB.total).toBe(0);
    const bo = await listActivity(db, leaderB, {}, { pageSize: 500 });
    expect(types(bo.items)).not.toContain("annual.exported");
  });

  it("AC-126 filters by department, person, kind of event and date range", async () => {
    const byDepartment = await listActivity(
      db,
      admin,
      { departmentId: departmentB },
      { pageSize: 500 },
    );
    expect(byDepartment.items.every((i) => i.department?.id === departmentB)).toBe(true);
    const byPerson = await listActivity(db, admin, { personId: accountant.id }, { pageSize: 500 });
    expect(byPerson.items.every((i) => i.actor?.id === accountant.id)).toBe(true);
    const decisions = await listActivity(db, admin, { group: "decisions" }, { pageSize: 500 });
    expect(new Set(types(decisions.items))).toEqual(new Set(["annual.approved"]));
    const access = await listActivity(db, admin, { quick: "access" }, { pageSize: 500 });
    expect(types(access.items)).toContain("access.sign_in_failed");
    expect(types(access.items).every((e) => /^access\.(sign_in_failed|denied)$/.test(e))).toBe(
      true,
    );
    const future = await listActivity(db, admin, { from: "2099-01-01" });
    expect(future.total).toBe(0);
    const search = await listActivity(db, admin, { q: referenceA }, { pageSize: 500 });
    expect(search.items.length).toBeGreaterThan(0);
    expect(search.items.every((i) => i.request?.reference === referenceA)).toBe(true);
  });

  it("pages of 50, with a stable total", async () => {
    const first = await listActivity(db, admin, {}, { pageSize: 3 });
    const second = await listActivity(db, admin, { page: 2 }, { pageSize: 3 });
    expect(first.pages).toBe(Math.ceil(first.total / 3));
    expect(second.page).toBe(2);
    expect(second.items.map((i) => i.id)).not.toEqual(first.items.map((i) => i.id));
    const all = await allActivity(db, admin, {});
    expect(all).toHaveLength(first.total);
  });

  it("a budget's own history includes its draft events", async () => {
    const { items } = await listActivity(db, leaderA, { requestId: draftA }, { pageSize: 100 });
    expect(types(items)).toEqual(expect.arrayContaining(["annual.draft_started"]));
    expect(items.every((i) => i.request?.id === draftA)).toBe(true);
  });

  it("offers only people in the person's own log for the Person filter", async () => {
    const people = await activityPeople(db, leaderA);
    expect(people.map((p) => p.id)).not.toContain(leaderB.id);
    expect(people.map((p) => p.id)).toContain(accountant.id);
  });
});

describe("global search (DRD 6.0)", () => {
  it("finds budgets by reference and item, only where the person may look", async () => {
    const byRef = await globalSearch(db, accountant, referenceA);
    expect(byRef.find((r) => r.group === "budgets")).toMatchObject({
      href: `/annual/review/${requestA}`,
    });
    const items = await globalSearch(db, leaderB, "Mixer");
    const budgets = items.filter((r) => r.group === "budgets");
    expect(budgets.every((r) => r.href.endsWith(requestB))).toBe(true);
    // The accountant doesn't see a department's draft.
    const drafts = await globalSearch(db, accountant, "Sound desk");
    expect(drafts.some((r) => r.href.includes(draftA))).toBe(false);
  });

  it("doesn't offer Analytics & Audit to a department leader", async () => {
    const pages = (await globalSearch(db, leaderA, "Analytics")).filter((r) => r.group === "pages");
    expect(pages.some((r) => r.href === "/reports/analytics")).toBe(false);
    const staff = (await globalSearch(db, accountant, "Analytics")).filter(
      (r) => r.group === "pages",
    );
    expect(staff.some((r) => r.href === "/reports/analytics")).toBe(true);
  });

  it("finds people for the administrator only, and pages from the person's navigation", async () => {
    expect((await globalSearch(db, admin, "Leader Lee")).some((r) => r.group === "people")).toBe(
      true,
    );
    expect(
      (await globalSearch(db, accountant, "Leader Lee")).some((r) => r.group === "people"),
    ).toBe(false);
    expect(await globalSearch(db, accountant, "review dash")).toEqual(
      expect.arrayContaining([expect.objectContaining({ group: "pages", href: "/annual/review" })]),
    );
    expect(await globalSearch(db, accountant, "x")).toEqual([]);
  });
});
