import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, departments } from "@/db/schema";
import type { Db } from "@/db/types";
import { changedFields, writeAudit } from "@/lib/audit";
import { createTestDb, expectRejected, type TestDb } from "./helpers/db";
import { insertDepartment, insertUser } from "./helpers/fixtures";

let t: TestDb;
let db: Db;
let userId: string;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  userId = (await insertUser(db)).id;
});

afterAll(async () => {
  await t?.close();
});

describe("writeAudit (FR-22)", () => {
  it("records who did what, in which role, area and department", async () => {
    const department = await insertDepartment(db, { name: "Ushering Team" });
    const id = await writeAudit(db, {
      actor: { kind: "user", userId, actingRole: "system_admin" },
      area: "admin",
      eventType: "admin.department_renamed",
      entity: { type: "department", id: department.id },
      departmentId: department.id,
      reason: "  Matches the bulletin  ",
      details: { before: { name: "Ushers" }, after: { name: "Ushering Team" } },
    });

    const [row] = await db.select().from(auditEvents).where(eq(auditEvents.id, id));
    expect(row).toMatchObject({
      actorKind: "user",
      actorUserId: userId,
      actingRole: "system_admin",
      area: "admin",
      eventType: "admin.department_renamed",
      entityType: "department",
      entityId: department.id,
      departmentId: department.id,
      reason: "Matches the bulletin",
      details: { before: { name: "Ushers" }, after: { name: "Ushering Team" } },
    });
    expect(row.eventTimestamp).toBeInstanceOf(Date);
  });

  it("records system and job events without a person", async () => {
    const id = await writeAudit(db, {
      actor: { kind: "job" },
      area: "access",
      eventType: "access.pco_verification_run",
      entity: { type: "job" },
      details: { summary: "12 checked, 0 suspended" },
    });
    const [row] = await db.select().from(auditEvents).where(eq(auditEvents.id, id));
    expect(row).toMatchObject({ actorKind: "job", actorUserId: null, actingRole: null });
  });

  it("rejects badly named event types", async () => {
    for (const eventType of ["Submitted", "annual", "annual.Submitted", "annual submitted"]) {
      await expect(
        writeAudit(db, {
          actor: { kind: "system" },
          area: "annual",
          eventType,
          entity: { type: "budget_request" },
        }),
      ).rejects.toThrow(TypeError);
    }
  });

  it("commits and rolls back with the change it records", async () => {
    await expect(
      db.transaction(async (tx) => {
        const [department] = await tx
          .insert(departments)
          .values({ name: "Drama Team" })
          .returning();
        await writeAudit(tx, {
          actor: { kind: "user", userId, actingRole: "system_admin" },
          area: "admin",
          eventType: "admin.department_added",
          entity: { type: "department", id: department.id },
        });
        throw new Error("something later failed");
      }),
    ).rejects.toThrow("something later failed");

    const left = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "admin.department_added"));
    expect(left).toEqual([]);
    expect(await db.select().from(departments).where(eq(departments.name, "Drama Team"))).toEqual(
      [],
    );
  });

  it("can never be edited, deleted or truncated", async () => {
    const id = await writeAudit(db, {
      actor: { kind: "system" },
      area: "admin",
      eventType: "admin.settings_changed",
      entity: { type: "setting", id: "sales_tax_rate" },
      details: { before: { value: "0.1200" }, after: { value: "0.1300" } },
    });
    await expectRejected(
      db.update(auditEvents).set({ reason: "covering tracks" }).where(eq(auditEvents.id, id)),
      "append-only",
    );
    await expectRejected(db.delete(auditEvents).where(eq(auditEvents.id, id)), "append-only");
    await expectRejected(db.execute(sql`truncate audit_events`), "append-only");
  });

  it("requires a person for user events", async () => {
    await expectRejected(
      db.insert(auditEvents).values({
        actorKind: "user",
        area: "annual",
        eventType: "annual.submitted",
        entityType: "budget_request",
      }),
      "audit_events_user_has_actor",
    );
  });
});

describe("changedFields", () => {
  it("keeps only what changed", () => {
    expect(
      changedFields(
        { name: "Media", status: "active", description: null },
        { name: "Media Team", status: "active" },
      ),
    ).toEqual({ before: { name: "Media" }, after: { name: "Media Team" } });
  });

  it("returns null when nothing changed", () => {
    expect(changedFields({ rate: "0.1200" }, { rate: "0.1200" })).toBeNull();
  });

  it("compares dates and nested values by content", () => {
    const at = "2026-11-30T08:00:00.000Z";
    expect(changedFields({ deadline: new Date(at) }, { deadline: new Date(at) })).toBeNull();
    expect(changedFields({ tags: ["a"] }, { tags: ["a", "b"] })).toEqual({
      before: { tags: ["a"] },
      after: { tags: ["a", "b"] },
    });
  });
});
