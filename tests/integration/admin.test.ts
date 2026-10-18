import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appSettings,
  approvalDecisions,
  auditEvents,
  budgetCycles,
  budgetRequests,
  deadlineExtensions,
  departments,
  emailOutbox,
  userDepartments,
  userRoles,
  users,
} from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import {
  changeDeadline,
  createCycle,
  updateCycleDetails,
  effectiveDeadline,
  extendDepartment,
  openCycle,
} from "@/domain/cycles/service";
import { closeBudgetYear, reopenBudgetYear } from "@/domain/spending/year-end";
import {
  acceptProposed,
  addDepartments,
  mergeProposed,
  rejectProposed,
  removeRepresentative,
  renameDepartment,
  setDepartmentActive,
  setRepresentative,
} from "@/domain/departments/service";
import { slotOf } from "@/domain/departments/slots";
import { ConflictError, RuleError, ValidationError } from "@/domain/errors";
import { getSignInSettings } from "@/domain/settings";
import {
  settingVersions,
  testPerson,
  updateSignInSettings,
  updateTaxRate,
  updateTimeZone,
} from "@/domain/settings/service";
import {
  addStaff,
  linkPlanningCenterPerson,
  searchPlanningCenterPeople,
  setUserActive,
  setUserRoles,
  suggestPlanningCenterPeople,
  unlinkPlanningCenterPerson,
} from "@/domain/users/admin";
import { resolveSignIn } from "@/domain/users/sign-in";
import { loadViewer } from "@/domain/users/viewer";
import { ForbiddenError, type Subject } from "@/lib/authz";
import { FakePlanningCenterDirectory } from "@/lib/pco";
import type { Role } from "@/lib/roles";
import { createTestDb, type TestDb } from "./helpers/db";
import {
  insertCycle,
  insertDepartment,
  insertDraft,
  insertRevision,
  insertUser,
  SUBMITTED_1025,
} from "./helpers/fixtures";

const NOW = new Date("2026-10-20T17:00:00Z");

let t: TestDb;
let db: Db;
let admin: Subject;

/** Runs a service in a transaction, like the server actions do. */
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

async function person(
  roles: Role[],
  extra: Partial<typeof users.$inferInsert> = {},
): Promise<Subject & { version: number }> {
  const row = await insertUser(db, { accessStatus: "active", ...extra });
  if (roles.length)
    await db.insert(userRoles).values(roles.map((role) => ({ userId: row.id, role })));
  return { id: row.id, roles, departments: [], version: row.version };
}

async function leader(extra: Partial<typeof users.$inferInsert> = {}) {
  return person(["requester"], { pcoLeaderVerified: true, pcoVerifiedAt: NOW, ...extra });
}

async function version(table: typeof users | typeof departments | typeof budgetCycles, id: string) {
  const [row] = await db.select({ v: table.version }).from(table).where(eq(table.id, id));
  return row.v;
}

async function audits(eventType: string, entityId?: string) {
  return db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.eventType, eventType),
        entityId ? eq(auditEvents.entityId, entityId) : undefined,
      ),
    );
}

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  admin = await person(["system_admin"]);
});

afterAll(async () => {
  await t?.close();
});

describe("permissions", () => {
  it("refuses every admin change to someone who isn't a System Administrator", async () => {
    const accountant = await person(["accountant"]);
    await expect(
      run((tx) => addDepartments(tx, accountant, { names: "Choir" })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      run((tx) =>
        addStaff(tx, accountant, {
          email: "x@example.org",
          displayName: "X",
          roles: ["requester"],
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      run((tx) => updateTaxRate(tx, accountant, { percent: "13", versions: {} })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // Creating a cycle is open to finance and board staff, but not the Church Administrator.
    const office = await person(["church_admin"]);
    await expect(
      run((tx) =>
        createCycle(
          tx,
          office,
          {
            name: "FY2099",
            budgetYear: 2099,
            startDate: "2099-01-01",
            submissionDeadline: "2098-11-30T17:00",
          },
          { now: NOW },
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("the accountant, backup approver, Board Chair and Vice-Chair create, edit, open and close cycles", async () => {
    const roles: Role[] = ["accountant", "backup_approver", "board_chair", "vice_chair"];
    for (const [i, role] of roles.entries()) {
      const creator = await person([role]);
      const year = 2090 + i;
      const created = await run((tx) =>
        createCycle(
          tx,
          creator,
          {
            name: `FY${year}`,
            budgetYear: year,
            startDate: `${year}-01-01`,
            submissionDeadline: `${year - 1}-11-30T17:00`,
          },
          { now: NOW },
        ),
      );
      const [row] = await db.select().from(budgetCycles).where(eq(budgetCycles.id, created.id));
      expect(row).toMatchObject({ status: "draft", createdByUserId: creator.id });
      const [event] = await audits("admin.cycle_created", created.id);
      expect(event).toMatchObject({ actorUserId: creator.id, actingRole: role });

      // Edit the details: audited with what changed and the role used.
      const edited = await run((tx) =>
        updateCycleDetails(tx, creator, {
          id: created.id,
          version: row.version,
          name: `FY${year} budget`,
          budgetYear: year,
          startDate: `${year}-01-01`,
          taxRatePercent: "12",
          boardTotal: "150,000.00",
          boardReference: "Board minutes",
          spendingPeriodEnd: `${year}-12-31`,
        }),
      );
      expect(edited.changed).toBe(true);
      const [after] = await db.select().from(budgetCycles).where(eq(budgetCycles.id, created.id));
      expect(after).toMatchObject({
        name: `FY${year} budget`,
        boardTotalCents: 15_000_000,
        boardReference: "Board minutes",
        spendingPeriodEnd: `${year}-12-31`,
      });
      const [update] = await audits("admin.cycle_updated", created.id);
      expect(update).toMatchObject({ actorUserId: creator.id, actingRole: role });
      expect(update.details).toMatchObject({ after: { boardTotalCents: 15_000_000 } });

      // Open it, then close the budget year (docs/decisions.md 2026-10-18).
      await run((tx) =>
        openCycle(tx, creator, { id: created.id, version: after.version }, { now: NOW }),
      );
      await run((tx) =>
        closeBudgetYear(
          tx,
          creator,
          { cycleId: created.id, version: after.version + 1, idempotencyKey: randomUUID() },
          { now: NOW },
        ),
      );
      const [closed] = await db.select().from(budgetCycles).where(eq(budgetCycles.id, created.id));
      expect(closed.status).toBe("closed");
    }
  });

  it("the Church Administrator can't edit or open a cycle; a stale edit is a conflict", async () => {
    const owner = await person(["accountant"]);
    const created = await run((tx) =>
      createCycle(
        tx,
        owner,
        {
          name: "FY2095",
          budgetYear: 2095,
          startDate: "2095-01-01",
          submissionDeadline: "2094-11-30T17:00",
        },
        { now: NOW },
      ),
    );
    const details = {
      id: created.id,
      version: 1,
      name: "FY2095",
      budgetYear: 2095,
      startDate: "2095-01-01",
      taxRatePercent: "12",
      boardTotal: "",
      boardReference: "",
    };
    const office = await person(["church_admin"]);
    await expect(run((tx) => updateCycleDetails(tx, office, details))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      run((tx) => openCycle(tx, office, { id: created.id, version: 1 }, { now: NOW })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await run((tx) => updateCycleDetails(tx, owner, { ...details, name: "FY2095 v2" }));
    await expect(
      run((tx) => updateCycleDetails(tx, owner, { ...details, name: "FY2095 v3" })),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("keeps the budget year once a department has a budget for it", async () => {
    const owner = await person(["accountant"]);
    const created = await run((tx) =>
      createCycle(
        tx,
        owner,
        {
          name: "FY2096",
          budgetYear: 2096,
          startDate: "2096-01-01",
          submissionDeadline: "2095-11-30T17:00",
        },
        { now: NOW },
      ),
    );
    const leader = await person(["requester"]);
    const department = await insertDepartment(db);
    await insertDraft(db, { cycleId: created.id, departmentId: department.id, userId: leader.id });
    await expect(
      run((tx) =>
        updateCycleDetails(tx, owner, {
          id: created.id,
          version: 1,
          name: "FY2096",
          budgetYear: 2097,
          startDate: "2096-01-01",
          taxRatePercent: "12",
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("users and roles (FR-02)", () => {
  it("adds a staff member by email, with roles, audited", async () => {
    const { userId } = await run((tx) =>
      addStaff(tx, admin, {
        email: " New.Accountant@Example.org ",
        displayName: "Nia Accountant",
        roles: ["accountant"],
      }),
    );
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row).toMatchObject({
      email: "new.accountant@example.org",
      accessStatus: "active",
      active: true,
    });
    expect(await loadViewer(db, userId)).toMatchObject({
      ok: true,
      viewer: { roles: ["accountant"] },
    });
    expect((await audits("admin.user_added", userId))[0]).toMatchObject({
      actorUserId: admin.id,
      actingRole: "system_admin",
      details: { after: { roles: ["accountant"] } },
    });
  });

  it("adds staff roles without any two-step verification confirmation", async () => {
    const { userId } = await run((tx) =>
      addStaff(tx, admin, {
        email: "chair@example.org",
        displayName: "Chair",
        roles: ["board_chair", "system_admin"],
      }),
    );
    expect(await loadViewer(db, userId)).toMatchObject({
      ok: true,
      viewer: { roles: expect.arrayContaining(["board_chair", "system_admin"]) },
    });
    // Leave exactly one stand-alone administrator for the tests below.
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    await run((tx) => setUserActive(tx, admin, { userId, active: false, version: row.version }));
  });

  it("refuses an email that already has an account, ignoring case", async () => {
    await expect(
      run((tx) =>
        addStaff(tx, admin, {
          email: "NEW.ACCOUNTANT@example.org",
          displayName: "Again",
          roles: ["accountant"],
        }),
      ),
    ).rejects.toMatchObject({ fieldErrors: { email: expect.any(String) } });
  });

  it("hands a role to a new person when someone leaves, keeping their decisions in history", async () => {
    const leaving = await person(["accountant"], { displayName: "Old Accountant" });
    const arriving = await person([]);
    // A past decision by the leaving accountant.
    const department = await insertDepartment(db);
    const cycle = await insertCycle(db, admin.id, { budgetYear: 2030 });
    const request = await insertDraft(
      db,
      { cycleId: cycle.id, departmentId: department.id, userId: admin.id },
      { ...SUBMITTED_1025, referenceNumber: "IFC-2030-0001" },
    );
    const revision = await insertRevision(db, request.id, admin.id);
    const [decision] = await db
      .insert(approvalDecisions)
      .values({
        budgetRequestId: request.id,
        requestRevisionId: revision.id,
        decision: "returned",
        decisionReason: "Which mixer?",
        approverUserId: leaving.id,
        actingRole: "accountant",
      })
      .returning();

    await run((tx) =>
      setUserRoles(tx, admin, {
        userId: leaving.id,
        roles: ["requester"],
        version: leaving.version,
      }),
    );
    await run((tx) =>
      setUserActive(tx, admin, { userId: leaving.id, active: false, version: leaving.version + 1 }),
    );
    await run((tx) =>
      setUserRoles(tx, admin, {
        userId: arriving.id,
        roles: ["accountant"],
        version: arriving.version,
      }),
    );

    expect(await loadViewer(db, leaving.id)).toEqual({ ok: false, reason: "not-allowed" });
    const [kept] = await db
      .select({ approver: users.displayName })
      .from(approvalDecisions)
      .innerJoin(users, eq(users.id, approvalDecisions.approverUserId))
      .where(eq(approvalDecisions.id, decision.id));
    expect(kept.approver).toBe("Old Accountant");
    expect((await audits("admin.roles_changed", leaving.id))[0]).toMatchObject({
      details: { before: { roles: ["accountant"] }, after: { roles: ["requester"] } },
    });
  });

  it("refuses to remove the last System Administrator's role (Requirements 20.5)", async () => {
    const [{ v }] = await db.select({ v: users.version }).from(users).where(eq(users.id, admin.id));
    await expect(
      run((tx) =>
        setUserRoles(tx, admin, {
          userId: admin.id,
          roles: ["accountant"],
          version: v,
        }),
      ),
    ).rejects.toBeInstanceOf(RuleError);
  });

  it("lets an administrator remove their own role once another administrator exists", async () => {
    const first = await person(["system_admin"]);
    const second = await person(["system_admin"]);
    await run((tx) =>
      setUserRoles(tx, first, {
        userId: first.id,
        roles: ["accountant"],
        version: first.version,
      }),
    );
    expect(await loadViewer(db, first.id)).toMatchObject({ viewer: { roles: ["accountant"] } });
    // Clean up so later tests still have exactly one stand-alone admin besides `second`.
    await run((tx) =>
      setUserActive(tx, admin, { userId: second.id, active: false, version: second.version }),
    );
  });

  it("refuses to deactivate yourself or the last active administrator", async () => {
    const [{ v }] = await db.select({ v: users.version }).from(users).where(eq(users.id, admin.id));
    await expect(
      run((tx) => setUserActive(tx, admin, { userId: admin.id, active: false, version: v })),
    ).rejects.toBeInstanceOf(RuleError);
    const other = await person(["system_admin"]);
    await expect(
      run((tx) => setUserActive(tx, other, { userId: admin.id, active: false, version: v })),
    ).resolves.toBeDefined();
    await expect(
      run(async (tx) =>
        setUserActive(tx, admin, { userId: other.id, active: false, version: other.version }),
      ),
    ).rejects.toBeDefined();
    // Restore the main administrator.
    await run((tx) => setUserActive(tx, other, { userId: admin.id, active: true, version: v + 1 }));
  });

  it("refuses a stale form with the conflict error (DRD 11.2)", async () => {
    const staff = await person(["church_admin"]);
    await run((tx) =>
      setUserRoles(tx, admin, {
        userId: staff.id,
        roles: ["church_admin", "accountant"],
        version: staff.version,
      }),
    );
    await expect(
      run((tx) =>
        setUserRoles(tx, admin, {
          userId: staff.id,
          roles: ["requester"],
          version: staff.version,
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("linking a Planning Center profile (FR-01a, AC-6)", () => {
  const pcoDirectory = () =>
    new FakePlanningCenterDirectory({
      organizationId: "100",
      fields: [{ id: "77", name: "Ministry Leader", dataType: "boolean" }],
      people: [
        { id: "7001", name: "Treasurer Tess", status: "active", emails: ["tess@example.org"] },
        { id: "7002", name: "Tess Twin", status: "active", emails: ["tess@example.org"] },
        { id: "7003", name: "Other Person", status: "active", emails: ["other@example.org"] },
      ],
    });

  it("suggests people with the account's email, links one, and Planning Center sign-in then reaches it", async () => {
    const staff = await person(["accountant"], { email: "tess@example.org" });
    const dir = pcoDirectory();
    const suggestions = await run((tx) => suggestPlanningCenterPeople(tx, admin, dir, staff.id));
    expect(suggestions.map((p) => p.id)).toEqual(["7001", "7002"]);

    // Before linking, Planning Center sign-in asks for a link.
    const signIn = () =>
      run((tx) =>
        resolveSignIn(
          tx,
          { directory: dir, now: NOW },
          {
            provider: "planningcenter",
            subject: "7001",
            email: "tess@example.org",
            emailVerified: false,
            name: "Treasurer Tess",
            organizationId: "100",
          },
        ),
      );
    expect(await signIn()).toMatchObject({ ok: false, reason: "link-required" });

    expect(
      await run((tx) =>
        linkPlanningCenterPerson(tx, admin, dir, {
          userId: staff.id,
          pcoPersonId: "7001",
          version: staff.version,
        }),
      ),
    ).toEqual({ name: expect.any(String), personName: "Treasurer Tess" });
    expect(await signIn()).toEqual({ ok: true, userId: staff.id, landing: "home" });
    expect(await audits("access.identity_linked", staff.id)).toMatchObject([
      { actorUserId: admin.id, details: { by: "administrator", after: { pcoPersonId: "7001" } } },
    ]);
  });

  it("refuses a person linked to someone else, a person not in Planning Center, and a stale page", async () => {
    const dir = pcoDirectory();
    const first = await person(["accountant"]);
    const second = await person(["board_chair"]);
    await run((tx) =>
      linkPlanningCenterPerson(tx, admin, dir, {
        userId: first.id,
        pcoPersonId: "7003",
        version: first.version,
      }),
    );
    await expect(
      run((tx) =>
        linkPlanningCenterPerson(tx, admin, dir, {
          userId: second.id,
          pcoPersonId: "7003",
          version: second.version,
        }),
      ),
    ).rejects.toBeInstanceOf(RuleError);
    await expect(
      run((tx) =>
        linkPlanningCenterPerson(tx, admin, dir, {
          userId: second.id,
          pcoPersonId: "9999",
          version: second.version,
        }),
      ),
    ).rejects.toBeInstanceOf(RuleError);
    // first's version moved on when it was linked.
    await expect(
      run((tx) =>
        unlinkPlanningCenterPerson(tx, admin, { userId: first.id, version: first.version }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    const results = await run((tx) =>
      searchPlanningCenterPeople(tx, admin, dir, { userId: second.id, query: "other" }),
    );
    expect(results).toMatchObject([{ id: "7003", linkedTo: { id: first.id } }]);
    expect(await audits("admin.pco_person_searched", second.id)).toHaveLength(1);
  });

  it("unlinks, and clears the Group Leader result that belonged to that person", async () => {
    const lead = await leader({ pcoPersonId: "7002" });
    await run((tx) =>
      unlinkPlanningCenterPerson(tx, admin, { userId: lead.id, version: lead.version }),
    );
    const [after] = await db.select().from(users).where(eq(users.id, lead.id));
    expect(after).toMatchObject({
      pcoPersonId: null,
      pcoLeaderVerified: false,
      pcoVerifiedAt: null,
    });
    expect(await audits("access.identity_unlinked", lead.id)).toHaveLength(1);
  });

  it("is for System Administrators only", async () => {
    const accountant = await person(["accountant"]);
    const target = await person(["board_chair"]);
    await expect(
      run((tx) =>
        linkPlanningCenterPerson(tx, accountant, pcoDirectory(), {
          userId: target.id,
          pcoPersonId: "7001",
          version: target.version,
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("departments (FR-03)", () => {
  const CHURCH_LIST = `Adult Sunday School
Choir Team
Children Sunday School
Drama Team
Decoration Team
Evangelism Team
Media Team
Men's Fellowship
Prime Adult/Young Adult Ministry

Prayer Warrior Team
Quality Control Team
Sanctuary Keepers Team
Social Media Team
Transportation Team
Ushering Team
Visitation Team
Women's Fellowship Team
Young Couples Ministry
  media team  `;

  it("loads the church's 18 departments from a pasted list, skipping blanks and repeats", async () => {
    const result = await run((tx) => addDepartments(tx, admin, { names: CHURCH_LIST }));
    expect(result.added).toHaveLength(18);
    expect(result.skipped).toEqual([]);
    expect(await audits("admin.department_added")).toHaveLength(18);

    const again = await run((tx) =>
      addDepartments(tx, admin, { names: "Choir Team\nYouth Ministry" }),
    );
    expect(again).toEqual({ added: ["Youth Ministry"], skipped: ["Choir Team"], other: false });
  });

  it('AC-131 "Others" in a pasted list is the form\'s Other option, not a department', async () => {
    const result = await run((tx) =>
      addDepartments(tx, admin, { names: "Others\nHospitality Ministry\nother" }),
    );
    expect(result).toEqual({ added: ["Hospitality Ministry"], skipped: [], other: true });
    const named = await db.select().from(departments).where(eq(departments.name, "Others"));
    expect(named).toEqual([]);
  });

  it("refuses an empty list and over-long names", async () => {
    await expect(
      run((tx) => addDepartments(tx, admin, { names: " \n \n" })),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      run((tx) => addDepartments(tx, admin, { names: "x".repeat(81) })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("renames, keeping past requests' names, and refuses a taken name", async () => {
    const dept = await insertDepartment(db, { name: "Ushers" });
    const cycle = await insertCycle(db, admin.id, { budgetYear: 2031 });
    const draft = await insertDraft(
      db,
      { cycleId: cycle.id, departmentId: dept.id, userId: admin.id },
      { departmentNameSnapshot: "Ushers" },
    );

    await run((tx) =>
      renameDepartment(tx, admin, {
        id: dept.id,
        name: "  Ushering   Crew ",
        version: dept.version,
      }),
    );
    const [after] = await db.select().from(departments).where(eq(departments.id, dept.id));
    expect(after.name).toBe("Ushering Crew");
    const [request] = await db.select().from(budgetRequests).where(eq(budgetRequests.id, draft.id));
    expect(request.departmentNameSnapshot).toBe("Ushers");
    expect((await audits("admin.department_renamed", dept.id))[0]).toMatchObject({
      details: { before: { name: "Ushers" }, after: { name: "Ushering Crew" } },
    });
    await expect(
      run((tx) =>
        renameDepartment(tx, admin, { id: dept.id, name: "choir team", version: after.version }),
      ),
    ).rejects.toMatchObject({ fieldErrors: { name: expect.stringContaining("already exists") } });
    await expect(
      run((tx) =>
        renameDepartment(tx, admin, { id: dept.id, name: "Old version", version: dept.version }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("deactivates and reactivates through the state machine", async () => {
    const dept = await insertDepartment(db);
    await run((tx) =>
      setDepartmentActive(tx, admin, { id: dept.id, active: false, version: dept.version }),
    );
    await expect(
      run((tx) =>
        setDepartmentActive(tx, admin, { id: dept.id, active: false, version: dept.version + 1 }),
      ),
    ).rejects.toBeInstanceOf(RuleError);
    await run((tx) =>
      setDepartmentActive(tx, admin, { id: dept.id, active: true, version: dept.version + 1 }),
    );
    expect(await version(departments, dept.id)).toBe(dept.version + 2);
  });

  describe("proposed departments", () => {
    async function proposed(name: string) {
      const proposer = await leader();
      const dept = await insertDepartment(db, {
        name,
        status: "proposed",
        proposedByUserId: proposer.id,
      });
      await db.insert(userDepartments).values({
        userId: proposer.id,
        departmentId: dept.id,
        representativeType: "primary",
        source: "form_pick",
      });
      return { dept, proposer };
    }

    it("adds a proposed department to the list", async () => {
      const { dept } = await proposed("Hospitality Team");
      await run((tx) => acceptProposed(tx, admin, { id: dept.id, version: dept.version }));
      const [row] = await db.select().from(departments).where(eq(departments.id, dept.id));
      expect(row.status).toBe("active");
    });

    it("rejects with a reason and sends its submissions back to Draft", async () => {
      const { dept, proposer } = await proposed("Media Ministri");
      const cycle = await insertCycle(db, admin.id, { budgetYear: 2032 });
      const request = await insertDraft(
        db,
        { cycleId: cycle.id, departmentId: dept.id, userId: proposer.id },
        { ...SUBMITTED_1025, referenceNumber: "IFC-2032-0001" },
      );
      await expect(
        run((tx) => rejectProposed(tx, admin, { id: dept.id, reason: " ", version: dept.version })),
      ).rejects.toBeInstanceOf(ValidationError);
      await run((tx) =>
        rejectProposed(tx, admin, { id: dept.id, reason: "Use Media Team", version: dept.version }),
      );
      const [row] = await db.select().from(budgetRequests).where(eq(budgetRequests.id, request.id));
      expect(row.status).toBe("draft");
      expect((await audits("admin.department_rejected", dept.id))[0].reason).toBe("Use Media Team");
    });

    it("merges into an existing department: submissions and leaders move (AC-16)", async () => {
      const target = await insertDepartment(db, { name: "Worship Team" });
      const { dept, proposer } = await proposed("Worship Teem");
      const cycle = await insertCycle(db, admin.id, { budgetYear: 2033 });
      const request = await insertDraft(db, {
        cycleId: cycle.id,
        departmentId: dept.id,
        userId: proposer.id,
      });

      await run((tx) =>
        mergeProposed(tx, admin, { id: dept.id, intoId: target.id, version: dept.version }),
      );
      const [moved] = await db
        .select()
        .from(budgetRequests)
        .where(eq(budgetRequests.id, request.id));
      expect(moved).toMatchObject({
        departmentId: target.id,
        departmentNameSnapshot: "Worship Team",
      });
      const [link] = await db
        .select()
        .from(userDepartments)
        .where(
          and(eq(userDepartments.departmentId, target.id), eq(userDepartments.userId, proposer.id)),
        );
      expect(link.representativeType).toBe("primary");
      const [old] = await db.select().from(departments).where(eq(departments.id, dept.id));
      expect(old).toMatchObject({ status: "rejected", mergedIntoDepartmentId: target.id });
    });

    it("refuses a merge when the target already has a budget that year", async () => {
      const target = await insertDepartment(db, { name: "Greeters" });
      const { dept, proposer } = await proposed("Greeterz");
      const cycle = await insertCycle(db, admin.id, { budgetYear: 2034, name: "FY2034" });
      await insertDraft(db, { cycleId: cycle.id, departmentId: target.id, userId: admin.id });
      await insertDraft(db, { cycleId: cycle.id, departmentId: dept.id, userId: proposer.id });
      await expect(
        run((tx) =>
          mergeProposed(tx, admin, { id: dept.id, intoId: target.id, version: dept.version }),
        ),
      ).rejects.toThrow(/Greeters already has a budget for FY2034/);
    });
  });

  describe("Primary and Backup requesters (FR-38)", () => {
    async function leadersOf(departmentId: string) {
      const rows = await db
        .select()
        .from(userDepartments)
        .where(eq(userDepartments.departmentId, departmentId));
      return Object.fromEntries(
        rows.map((r) => [
          r.userId,
          slotOf({ type: r.representativeType, backupRank: r.backupRank }),
        ]),
      );
    }

    const set = (actor: Subject, departmentId: string, userId: string, type: string) =>
      run((tx) => setRepresentative(tx, actor, { departmentId, userId, type }));

    it("sets Primary and Backup, and Make Primary on the Backup swaps them", async () => {
      const dept = await insertDepartment(db);
      const [a, b] = [await leader(), await leader()];
      await set(admin, dept.id, a.id, "primary");
      await set(admin, dept.id, b.id, "backup_1");
      expect(await leadersOf(dept.id)).toEqual({ [a.id]: "primary", [b.id]: "backup_1" });

      await set(admin, dept.id, b.id, "primary");
      expect(await leadersOf(dept.id)).toEqual({ [a.id]: "backup_1", [b.id]: "primary" });
      expect(await audits("admin.department_leader_changed", dept.id)).toHaveLength(3);
    });

    it("AC-116 holds up to two ranked Backups; filling a taken slot moves the holder", async () => {
      const dept = await insertDepartment(db);
      const [p, b1, b2, c] = [await leader(), await leader(), await leader(), await leader()];
      await set(admin, dept.id, p.id, "primary");
      await set(admin, dept.id, b1.id, "backup_1");
      await set(admin, dept.id, b2.id, "backup_2");
      expect(await leadersOf(dept.id)).toEqual({
        [p.id]: "primary",
        [b1.id]: "backup_1",
        [b2.id]: "backup_2",
      });

      // Backup 2 to Backup 1 swaps the two Backups.
      await set(admin, dept.id, b2.id, "backup_1");
      expect(await leadersOf(dept.id)).toEqual({
        [p.id]: "primary",
        [b1.id]: "backup_2",
        [b2.id]: "backup_1",
      });

      // A newcomer taking Backup 2 moves the holder to Representative: never a third Backup.
      await set(admin, dept.id, c.id, "backup_2");
      expect(await leadersOf(dept.id)).toEqual({
        [p.id]: "primary",
        [b1.id]: "representative",
        [b2.id]: "backup_1",
        [c.id]: "backup_2",
      });
    });

    it("a lone Backup 2 moves up to Backup 1", async () => {
      const dept = await insertDepartment(db);
      const [b1, b2] = [await leader(), await leader()];
      await set(admin, dept.id, b2.id, "backup_2");
      expect(await leadersOf(dept.id)).toEqual({ [b2.id]: "backup_1" });

      await set(admin, dept.id, b1.id, "backup_2");
      await run((tx) => removeRepresentative(tx, admin, { departmentId: dept.id, userId: b2.id }));
      expect(await leadersOf(dept.id)).toEqual({ [b1.id]: "backup_1" });
    });

    it("the Primary can name Backup 2, but not another Primary (FR-38)", async () => {
      const dept = await insertDepartment(db);
      const [p, b2] = [await leader(), await leader()];
      await set(admin, dept.id, p.id, "primary");
      const primary: Subject = {
        id: p.id,
        roles: ["requester"],
        departments: [{ id: dept.id, name: dept.name, representativeType: "primary" }],
      };
      await set(primary, dept.id, b2.id, "backup_2");
      expect(await leadersOf(dept.id)).toEqual({ [p.id]: "primary", [b2.id]: "backup_1" });
      await expect(set(primary, dept.id, b2.id, "primary")).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("AC-117 a Primary names a Backup, the administrators are told, and the Primary stays put", async () => {
      const dept = await insertDepartment(db);
      const [p, b, other] = [await leader(), await leader(), await leader()];
      await set(admin, dept.id, p.id, "primary");
      const primary: Subject = {
        id: p.id,
        roles: ["requester"],
        departments: [{ id: dept.id, name: dept.name, representativeType: "primary" }],
      };
      await set(primary, dept.id, b.id, "backup_1");
      expect(await leadersOf(dept.id)).toEqual({ [p.id]: "primary", [b.id]: "backup_1" });
      const told = (
        await db
          .select()
          .from(emailOutbox)
          .where(eq(emailOutbox.template, "department.backup_nominated"))
      ).filter((e) => e.subject.endsWith(`Backup for ${dept.name}`));
      expect(told.map((e) => e.toUserId)).toContain(admin.id);
      expect(told.every((e) => e.status === "pending")).toBe(true);

      // Moving themselves, or someone already Primary, is the administrator's.
      await expect(set(primary, dept.id, p.id, "backup_2")).rejects.toBeInstanceOf(RuleError);
      await expect(set(primary, dept.id, other.id, "representative")).rejects.toThrow();
      expect(await leadersOf(dept.id)).toEqual({ [p.id]: "primary", [b.id]: "backup_1" });
    });

    it("AC-120 Backup 1 becomes Primary and Backup 2 moves up when the Primary leaves", async () => {
      const dept = await insertDepartment(db);
      const [p, b1, b2] = [await leader(), await leader(), await leader()];
      await set(admin, dept.id, p.id, "primary");
      await set(admin, dept.id, b1.id, "backup_1");
      await set(admin, dept.id, b2.id, "backup_2");
      await run((tx) =>
        setUserActive(tx, admin, { userId: p.id, active: false, version: p.version }),
      );
      expect(await leadersOf(dept.id)).toEqual({
        [p.id]: "representative",
        [b1.id]: "primary",
        [b2.id]: "backup_1",
      });
      const [promoted] = await audits("admin.department_backup_promoted", dept.id);
      expect(promoted.details).toMatchObject({
        before: { slot: "backup_1" },
        after: { slot: "primary" },
      });
    });

    it("replacing the Primary with someone new makes the old one a Representative", async () => {
      const dept = await insertDepartment(db);
      const [a, c] = [await leader(), await leader()];
      await run((tx) =>
        setRepresentative(tx, admin, { departmentId: dept.id, userId: a.id, type: "primary" }),
      );
      await run((tx) =>
        setRepresentative(tx, admin, { departmentId: dept.id, userId: c.id, type: "primary" }),
      );
      expect(await leadersOf(dept.id)).toEqual({ [a.id]: "representative", [c.id]: "primary" });
    });

    it("accepts only active, verified Group Leaders with the Requester role", async () => {
      const dept = await insertDepartment(db);
      const unverified = await person(["requester"]);
      const staffOnly = await person(["accountant"]);
      const gone = await leader({ active: false });
      for (const p of [unverified, staffOnly, gone]) {
        await expect(
          run((tx) =>
            setRepresentative(tx, admin, { departmentId: dept.id, userId: p.id, type: "primary" }),
          ),
        ).rejects.toBeInstanceOf(ValidationError);
      }
    });

    it("moves a waiting leader to active once they have a department", async () => {
      const dept = await insertDepartment(db);
      const waiting = await leader({ accessStatus: "pending_department" });
      expect(await loadViewer(db, waiting.id)).toEqual({ ok: false, reason: "waiting" });
      await run((tx) =>
        setRepresentative(tx, admin, {
          departmentId: dept.id,
          userId: waiting.id,
          type: "representative",
        }),
      );
      expect(await loadViewer(db, waiting.id)).toMatchObject({ ok: true });
    });

    it("promotes the Backup when the Primary is removed or deactivated", async () => {
      const deptA = await insertDepartment(db);
      const deptB = await insertDepartment(db);
      const [p1, b1, p2, b2] = [await leader(), await leader(), await leader(), await leader()];
      for (const [dept, p, b] of [
        [deptA, p1, b1],
        [deptB, p2, b2],
      ] as const) {
        await run((tx) =>
          setRepresentative(tx, admin, { departmentId: dept.id, userId: p.id, type: "primary" }),
        );
        await set(admin, dept.id, b.id, "backup_1");
      }
      await run((tx) => removeRepresentative(tx, admin, { departmentId: deptA.id, userId: p1.id }));
      expect(await leadersOf(deptA.id)).toEqual({ [b1.id]: "primary" });

      await run((tx) =>
        setUserActive(tx, admin, { userId: p2.id, active: false, version: p2.version }),
      );
      expect(await leadersOf(deptB.id)).toEqual({ [p2.id]: "representative", [b2.id]: "primary" });
      expect(await audits("admin.department_backup_promoted", deptB.id)).toHaveLength(1);
    });
  });
});

describe("budget cycles (Requirements 4)", () => {
  let fy: { id: string };

  it("creates FY2027 with the deadline in church time and the current tax rate", async () => {
    fy = await run((tx) =>
      createCycle(
        tx,
        admin,
        {
          name: "FY2027",
          budgetYear: 2027,
          startDate: "2027-01-01",
          submissionDeadline: "2026-11-30T17:00",
          boardTotal: "250,000.00",
          boardReference: "Board minutes, Oct 2026",
        },
        { now: NOW },
      ),
    );
    const [row] = await db.select().from(budgetCycles).where(eq(budgetCycles.id, fy.id));
    expect(row).toMatchObject({
      status: "draft",
      defaultTaxRate: "0.1200",
      boardTotalCents: 25_000_000,
      submissionDeadline: new Date("2026-11-30T23:00:00Z"), // 5:00 p.m. CST in Winnipeg
    });
    expect(await audits("admin.cycle_created", fy.id)).toHaveLength(1);
  });

  it("refuses a second cycle for the same year and a past deadline", async () => {
    await expect(
      run((tx) =>
        createCycle(
          tx,
          admin,
          {
            name: "Again",
            budgetYear: 2027,
            startDate: "2027-01-01",
            submissionDeadline: "2026-12-30T17:00",
          },
          { now: NOW },
        ),
      ),
    ).rejects.toMatchObject({ fieldErrors: { budgetYear: expect.any(String) } });
    await expect(
      run((tx) =>
        createCycle(
          tx,
          admin,
          {
            name: "FY2040",
            budgetYear: 2040,
            startDate: "2040-01-01",
            submissionDeadline: "2026-10-01T09:00",
          },
          { now: NOW },
        ),
      ),
    ).rejects.toMatchObject({ fieldErrors: { submissionDeadline: expect.any(String) } });
  });

  it("opens, changes the deadline with a reason, closes the year, and reopens it with a reason", async () => {
    const v = async (tx: Tx) =>
      (
        await tx
          .select({ v: budgetCycles.version })
          .from(budgetCycles)
          .where(eq(budgetCycles.id, fy.id))
      )[0].v;
    await run(async (tx) =>
      openCycle(tx, admin, { id: fy.id, version: await v(tx) }, { now: NOW }),
    );

    await expect(
      run(async (tx) =>
        changeDeadline(
          tx,
          admin,
          { id: fy.id, version: await v(tx), newDeadline: "2026-12-07T17:00", reason: "" },
          { now: NOW },
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await run(async (tx) =>
      changeDeadline(
        tx,
        admin,
        {
          id: fy.id,
          version: await v(tx),
          newDeadline: "2026-12-07T17:00",
          reason: "Board meets later",
        },
        { now: NOW },
      ),
    );
    expect((await audits("admin.cycle_deadline_changed", fy.id))[0]).toMatchObject({
      reason: "Board meets later",
      details: {
        before: { submissionDeadline: "2026-11-30T23:00:00.000Z" },
        after: { submissionDeadline: "2026-12-07T23:00:00.000Z" },
      },
    });

    // The System Administrator can't close a budget year; finance and the board do.
    await expect(
      run(async (tx) =>
        closeBudgetYear(
          tx,
          admin,
          { cycleId: fy.id, version: await v(tx), idempotencyKey: randomUUID() },
          { now: NOW },
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const accountant = await person(["accountant"]);
    await run(async (tx) =>
      closeBudgetYear(
        tx,
        accountant,
        { cycleId: fy.id, version: await v(tx), idempotencyKey: randomUUID() },
        { now: NOW },
      ),
    );
    await expect(
      run(async (tx) =>
        changeDeadline(
          tx,
          admin,
          { id: fy.id, version: await v(tx), newDeadline: "2026-12-14T17:00", reason: "x" },
          { now: NOW },
        ),
      ),
    ).rejects.toBeInstanceOf(RuleError);
    await run(async (tx) =>
      reopenBudgetYear(
        tx,
        accountant,
        { cycleId: fy.id, version: await v(tx), reason: "A cheque was missed" },
        { now: NOW },
      ),
    );
    // Reopening the year leaves the submission deadline alone.
    const [row] = await db.select().from(budgetCycles).where(eq(budgetCycles.id, fy.id));
    expect(row).toMatchObject({
      status: "open",
      spendingLockedAt: null,
      submissionDeadline: new Date("2026-12-07T23:00:00Z"),
    });
  });

  it("refuses to open a cycle whose deadline has passed", async () => {
    const draft = await insertCycle(db, admin.id, {
      budgetYear: 2035,
      status: "draft",
      submissionDeadline: new Date("2026-01-01T00:00:00Z"),
    });
    await expect(
      run((tx) => openCycle(tx, admin, { id: draft.id, version: draft.version }, { now: NOW })),
    ).rejects.toBeInstanceOf(RuleError);
  });

  it("gives one department an extension, replacing an earlier one", async () => {
    const [dept] = await db.select().from(departments).where(eq(departments.name, "Media Team"));
    await expect(
      run((tx) =>
        extendDepartment(
          tx,
          admin,
          {
            cycleId: fy.id,
            departmentId: dept.id,
            newDeadline: "2026-12-05T17:00",
            reason: "Too early",
          },
          { now: NOW },
        ),
      ),
    ).rejects.toMatchObject({ fieldErrors: { newDeadline: expect.any(String) } });

    await run((tx) =>
      extendDepartment(
        tx,
        admin,
        {
          cycleId: fy.id,
          departmentId: dept.id,
          newDeadline: "2026-12-21T17:00",
          reason: "Leader travelling",
        },
        { now: NOW },
      ),
    );
    await run((tx) =>
      extendDepartment(
        tx,
        admin,
        {
          cycleId: fy.id,
          departmentId: dept.id,
          newDeadline: "2026-12-28T17:00",
          reason: "One more week",
        },
        { now: NOW },
      ),
    );
    const rows = await db
      .select()
      .from(deadlineExtensions)
      .where(eq(deadlineExtensions.departmentId, dept.id));
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.supersededAt === null)).toHaveLength(1);
    expect(await effectiveDeadline(db, fy.id, dept.id)).toEqual(new Date("2026-12-28T23:00:00Z"));

    const [other] = await db.select().from(departments).where(eq(departments.name, "Choir Team"));
    expect(await effectiveDeadline(db, fy.id, other.id)).toEqual(new Date("2026-12-07T23:00:00Z"));
  });

  it("lets the accountant give extensions (4.3)", async () => {
    const accountant = await person(["accountant"]);
    const [dept] = await db.select().from(departments).where(eq(departments.name, "Drama Team"));
    await run((tx) =>
      extendDepartment(
        tx,
        accountant,
        {
          cycleId: fy.id,
          departmentId: dept.id,
          newDeadline: "2026-12-21T17:00",
          reason: "Asked by leader",
        },
        { now: NOW },
      ),
    );
  });
});

describe("settings", () => {
  it("changes the tax rate from a percent, audited with old and new (FR-07a)", async () => {
    const versions = await settingVersions(db, ["sales_tax_rate"]);
    expect(await run((tx) => updateTaxRate(tx, admin, { percent: "12.5", versions }))).toEqual({
      rate: "12.5%",
    });
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "sales_tax_rate"));
    expect(row.value).toBe("0.1250");
    expect((await audits("admin.tax_rate_changed")).at(-1)).toMatchObject({
      details: { before: { sales_tax_rate: "0.1200" }, after: { sales_tax_rate: "0.1250" } },
    });
    // A form opened before that change is refused.
    await expect(
      run((tx) => updateTaxRate(tx, admin, { percent: "13", versions })),
    ).rejects.toBeInstanceOf(ConflictError);
    for (const bad of ["", "abc", "101", "12.345", "-1"]) {
      await expect(
        run((tx) => updateTaxRate(tx, admin, { percent: bad, versions: {} })),
      ).rejects.toBeInstanceOf(ValidationError);
    }
    await run(async (tx) =>
      updateTaxRate(tx, admin, {
        percent: "12",
        versions: await settingVersions(tx, ["sales_tax_rate"]),
      }),
    );
  });

  it("sets the church time zone, refusing unknown zones", async () => {
    const versions = await settingVersions(db, ["church_timezone"]);
    await expect(
      run((tx) => updateTimeZone(tx, admin, { timeZone: "Mars/Base", versions })),
    ).rejects.toBeInstanceOf(ValidationError);
    await run((tx) => updateTimeZone(tx, admin, { timeZone: "America/Regina", versions }));
    await run(async (tx) =>
      updateTimeZone(tx, admin, {
        timeZone: "America/Winnipeg",
        versions: await settingVersions(tx, ["church_timezone"]),
      }),
    );
  });

  it("saves the Planning Center field, values and toggles, keeping one sign-in method", async () => {
    const keys = [
      "admin_contact_email",
      "pco_leader_field_name",
      "pco_leader_accepted_values",
      "pco_require_for_requesters",
      "pco_require_for_staff",
      "signin_planning_center_enabled",
      "signin_email_enabled",
    ] as const;
    const base = {
      adminContactEmail: "office@example.org",
      fieldName: "Ministry Leader",
      acceptedValues: "Yes\n\nYes",
      requireForRequesters: true,
      requireForStaff: false,
      departmentFieldName: "Ministry Department",
      departmentMode: "suggest",
      planningCenterEnabled: true,
      emailEnabled: true,
    };
    await expect(
      run(async (tx) =>
        updateSignInSettings(tx, admin, {
          ...base,
          planningCenterEnabled: false,
          emailEnabled: false,
          versions: await settingVersions(tx, keys),
        }),
      ),
    ).rejects.toBeInstanceOf(RuleError);
    await run(async (tx) =>
      updateSignInSettings(tx, admin, {
        ...base,
        acceptedValues: "Yes\nTrue",
        versions: await settingVersions(tx, keys),
      }),
    );
    const settings = await getSignInSettings(db);
    expect(settings).toMatchObject({
      adminContactEmail: "office@example.org",
      leader: { fieldName: "Ministry Leader", acceptedValues: ["Yes", "True"] },
    });
    const last = (await audits("admin.signin_settings_changed")).at(-1);
    expect(Object.keys((last?.details as { after: object }).after).sort()).toEqual([
      "admin_contact_email",
      "pco_leader_accepted_values",
    ]);
  });

  it("tests a person with the values on the form, before saving (AC-11)", async () => {
    const directory = new FakePlanningCenterDirectory({
      organizationId: "100",
      fields: [
        { id: "77", name: "Ministry Leader", dataType: "boolean" },
        { id: "88", name: "Ministry Role", dataType: "string" },
      ],
      people: [
        {
          id: "1",
          name: "Sam Lee",
          status: "active",
          emails: ["sam@example.org"],
          fieldValues: { "77": ["true"], "88": ["Usher"] },
        },
        {
          id: "2",
          name: "Sam Member",
          status: "active",
          emails: ["member@example.org"],
          fieldValues: { "77": ["false"] },
        },
      ],
    });
    const results = await run((tx) =>
      testPerson(tx, admin, directory, {
        query: "sam",
        fieldName: "Ministry Leader",
        acceptedValues: "Yes",
      }),
    );
    expect(results.map((r) => [r.person.name, r.check.status])).toEqual([
      ["Sam Lee", "leader"],
      ["Sam Member", "not_leader"],
    ]);
    const other = await run((tx) =>
      testPerson(tx, admin, directory, {
        query: "sam lee",
        fieldName: "Ministry Role",
        acceptedValues: "Group Leader",
      }),
    );
    expect(other[0].check).toMatchObject({ status: "not_leader", fieldValue: "Usher" });
    expect(await audits("admin.pco_person_tested")).toHaveLength(2);
    await expect(
      run((tx) =>
        testPerson(tx, admin, directory, { query: "s", fieldName: "x", acceptedValues: "Yes" }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
