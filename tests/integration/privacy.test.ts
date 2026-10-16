import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, emailOutbox, userRoles } from "@/db/schema";
import type { Db } from "@/db/types";
import { ValidationError } from "@/domain/errors";
import { requestPrivacyHelp } from "@/domain/users/privacy";
import type { Subject } from "@/lib/authz";
import type { Role } from "@/lib/roles";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertUser } from "./helpers/fixtures";

const NOW = new Date("2026-10-20T17:00:00Z");
const DAY = 86_400_000;

let t: TestDb;
let db: Db;
let adminId: string;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  adminId = (await person("system_admin")).id;
});

afterAll(async () => {
  await t?.close();
});

async function person(role: Role): Promise<Subject> {
  const row = await insertUser(db, { accessStatus: "active" });
  await db.insert(userRoles).values({ userId: row.id, role });
  return { id: row.id, roles: [role], departments: [] };
}

const ask = (who: Subject, kind: string, details: string, now = NOW) =>
  db.transaction((tx) => requestPrivacyHelp(tx, who, { kind, details }, { now }));

const requestsFrom = async (userId: string) =>
  (
    await db.select().from(emailOutbox).where(eq(emailOutbox.template, "access.privacy_request"))
  ).filter((r) => r.textBody.includes(userId));

describe("see or correct my information (FR-36)", () => {
  it("emails the administrators with the details, and audits it", async () => {
    const leader = await person("requester");
    expect(await ask(leader, "correct", "My name is spelled Adébáyọ̀.")).toEqual({ sent: true });
    const [email] = await requestsFrom(leader.id);
    expect(email).toMatchObject({ toUserId: adminId, audience: "administrator" });
    expect(email.subject).toMatch(/^Privacy request from /);
    expect(email.textBody).toContain("Correct my information");
    expect(email.textBody).toContain("My name is spelled Adébáyọ̀.");
    const [event] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.eventType, "access.privacy_requested"),
          eq(auditEvents.entityId, leader.id),
        ),
      );
    // The audit records the kind, not what they wrote.
    expect(event.details).toEqual({ kind: "correct" });
  });

  it("allows one request a day per person", async () => {
    const accountant = await person("accountant");
    expect(await ask(accountant, "see", "")).toEqual({ sent: true });
    expect(await ask(accountant, "see", "again")).toEqual({ sent: false });
    expect(await ask(accountant, "see", "", new Date(NOW.getTime() + DAY))).toEqual({ sent: true });
    expect(await requestsFrom(accountant.id)).toHaveLength(2);
  });

  it("needs a kind, details for a correction, and at most 2,000 characters", async () => {
    const who = await person("requester");
    await expect(ask(who, "delete", "")).rejects.toBeInstanceOf(ValidationError);
    await expect(ask(who, "correct", "   ")).rejects.toBeInstanceOf(ValidationError);
    await expect(ask(who, "see", "x".repeat(2001))).rejects.toBeInstanceOf(ValidationError);
  });
});
