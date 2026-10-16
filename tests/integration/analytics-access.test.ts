import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, departments, userDepartments, userRoles } from "@/db/schema";
import type { Db } from "@/db/types";
import { accessOverview } from "@/domain/analytics/access";

import { ForbiddenError, type Subject } from "@/lib/authz";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertDepartment, insertUser } from "./helpers/fixtures";

/* The Access tab of Analytics & Audit (FR-52, DRD 6.13), administrator only. */

let t: TestDb;
let db: Db;
let admin: Subject;
const NOW = new Date();

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

const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

/** An audit event at a given time (the table is append-only, so inserts are allowed). */
async function event(input: {
  eventType: string;
  area: "access" | "admin";
  at: Date;
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  departmentId?: string;
  reason?: string;
  details?: Record<string, unknown>;
}) {
  await db.insert(auditEvents).values({
    actorKind: input.actorUserId ? "user" : "system",
    actorUserId: input.actorUserId ?? null,
    area: input.area,
    eventType: input.eventType,
    entityType: input.entityType ?? "user",
    entityId: input.entityId ?? null,
    departmentId: input.departmentId ?? null,
    reason: input.reason ?? null,
    details: input.details ?? null,
    eventTimestamp: input.at,
  });
}

describe("Access tab (FR-52)", () => {
  it("is for the System Administrator only", async () => {
    const pat: Subject = { id: admin.id, roles: ["accountant"], departments: [] };
    await expect(db.transaction((tx) => accessOverview(tx, pat, NOW))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("counts sign-ins and failures, and lists access denied, suspended leaders, missing Backups and mapping problems", async () => {
    const leader = await insertUser(db, { accessStatus: "suspended_not_leader" });
    const audit = (
      eventType: string,
      area: "access" | "admin",
      at: Date,
      extra: { reason?: string; details?: Record<string, unknown> } = {},
    ) => event({ eventType, area, at, ...extra });
    await audit("access.sign_in_succeeded", "access", ago(1), { details: { method: "email" } });
    await audit("access.sign_in_succeeded", "access", ago(2), {
      details: { method: "planningcenter" },
    });
    await audit("access.sign_in_failed", "access", ago(3), {
      reason: "No account",
      details: { method: "planningcenter", email: "stranger@example.org" },
    });
    await audit("access.sign_in_code_wrong", "access", ago(30));
    await audit("access.sign_in_failed", "access", ago(24 * 9)); // too old
    await event({
      eventType: "access.denied",
      area: "access",
      at: ago(4),
      actorUserId: leader.id,
      entityType: "page",
      entityId: "/admin/settings",
    });

    // A department with a Primary but no Backup, and one mapped with a sync problem.
    const media = await insertDepartment(db);
    await db
      .insert(userDepartments)
      .values({ userId: leader.id, departmentId: media.id, representativeType: "primary" });
    const youth = await insertDepartment(db);
    await db
      .update(departments)
      .set({ pcoSourceType: "services_team", pcoSourceId: "5", pcoSourceName: "Youth" })
      .where(eq(departments.id, youth.id));
    await event({
      eventType: "admin.pco_mapping_sync_problem",
      area: "admin",
      at: ago(5),
      entityType: "department",
      entityId: youth.id,
      departmentId: youth.id,
      reason: "Gone",
    });

    const data = await db.transaction((tx) => accessOverview(tx, admin, NOW));
    expect(data.signInsByDay).toHaveLength(7);
    const totals = data.signInsByDay.reduce(
      (s, d) => ({
        pc: s.pc + d.planningCenter,
        email: s.email + d.email,
        failed: s.failed + d.failed,
      }),
      { pc: 0, email: 0, failed: 0 },
    );
    expect(totals).toEqual({ pc: 1, email: 1, failed: 2 });
    expect(data.failed).toMatchObject({ last24h: 1, last7d: 2 });
    expect(data.failed.recent[0]).toMatchObject({
      email: "stranger@example.org",
      reason: "No account",
    });
    expect(data.denied.last7d).toBe(1);
    expect(data.denied.recent[0]).toMatchObject({
      path: "/admin/settings",
      person: { id: leader.id },
    });
    expect(data.suspended.map((u) => u.id)).toContain(leader.id);
    expect(data.noBackup.find((d) => d.id === media.id)?.primary).not.toBeNull();
    expect(data.syncProblems.map((p) => p.departmentId)).toEqual([youth.id]);

    // A later successful sync clears the problem.
    await db.update(departments).set({ pcoLastSyncedAt: NOW }).where(eq(departments.id, youth.id));
    const after = await db.transaction((tx) => accessOverview(tx, admin, NOW));
    expect(after.syncProblems).toEqual([]);
  });
});
