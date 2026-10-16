import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, emailOutbox, userRoles } from "@/db/schema";
import type { Db } from "@/db/types";
import { RuleError } from "@/domain/errors";
import { getEmailLog, retryFailedEmails } from "@/domain/notifications/admin";
import { ForbiddenError, type Subject } from "@/lib/authz";
import type { Role } from "@/lib/roles";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertUser } from "./helpers/fixtures";

const NOW = new Date("2026-10-20T17:00:00Z");

let t: TestDb;
let db: Db;
let admin: Subject;
let accountant: Subject;

async function person(role: Role): Promise<Subject> {
  const row = await insertUser(db, { accessStatus: "active" });
  await db.insert(userRoles).values({ userId: row.id, role });
  return { id: row.id, roles: [role], departments: [] };
}

async function email(
  status: "pending" | "sent" | "failed",
  subject: string,
  toEmail = "x@example.org",
) {
  const [row] = await db
    .insert(emailOutbox)
    .values({
      template: "annual.submitted.receipt",
      audience: "requester",
      toEmail,
      subject,
      textBody: "t",
      htmlBody: "h",
      status,
      attempts: status === "failed" ? 10 : 1,
      sentAt: status === "sent" ? NOW : null,
      lastError: status === "failed" ? "Resend 422 validation_error" : null,
    })
    .returning();
  return row;
}

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  admin = await person("system_admin");
  accountant = await person("accountant");
});

afterAll(async () => {
  await t?.close();
});

describe("Admin → Notifications & Audit (FR-21)", () => {
  it("lists emails with counts, filters by status and searches subject or address", async () => {
    await email("sent", "Budget received: Choir FY2027");
    await email("failed", "Budget approved: Youth FY2027", "youth.lead@example.org");
    await email("pending", "Your budget is being reviewed: Choir FY2027");

    const all = await getEmailLog(db, admin);
    expect(all.counts).toEqual({ pending: 1, sending: 0, sent: 1, failed: 1 });
    expect(all.items).toHaveLength(3);

    const failed = await getEmailLog(db, admin, { status: "failed" });
    expect(failed.items.map((e) => e.subject)).toEqual(["Budget approved: Youth FY2027"]);
    expect(failed.items[0].lastError).toContain("422");

    expect((await getEmailLog(db, admin, { q: "choir" })).items).toHaveLength(2);
    expect((await getEmailLog(db, admin, { q: "youth.lead@" })).items).toHaveLength(1);
    // Wildcards are searched for literally.
    expect((await getEmailLog(db, admin, { q: "%" })).items).toHaveLength(0);
  });

  it("only the System Administrator sees it", async () => {
    await expect(getEmailLog(db, accountant)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      db.transaction((tx) => retryFailedEmails(tx, accountant, { all: true })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("sends a failed email again with fresh retries, never a sent one, and audits it", async () => {
    const failed = await email("failed", "Budget declined: Ushers FY2027");
    const sent = await email("sent", "Budget received: Ushers FY2027");

    expect(
      await db.transaction((tx) =>
        retryFailedEmails(tx, admin, { ids: [failed.id, sent.id] }, { now: NOW }),
      ),
    ).toBe(1);
    const [again] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, failed.id));
    expect(again).toMatchObject({ status: "pending", attempts: 0, nextAttemptAt: NOW });
    const [still] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, sent.id));
    expect(still.status).toBe("sent");

    const [audit] = await db
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.eventType, "admin.emails_retried"), eq(auditEvents.entityId, failed.id)),
      );
    expect(audit.details).toMatchObject({ count: 1 });
  });

  it("sends every failed email again at once, and says when there is nothing to send", async () => {
    await email("failed", "One");
    await email("failed", "Two");
    const n = await db.transaction((tx) =>
      retryFailedEmails(tx, admin, { all: true }, { now: NOW }),
    );
    expect(n).toBeGreaterThanOrEqual(2);
    expect((await getEmailLog(db, admin)).counts.failed).toBe(0);
    await expect(
      db.transaction((tx) => retryFailedEmails(tx, admin, { all: true })),
    ).rejects.toBeInstanceOf(RuleError);
    await expect(
      db.transaction((tx) => retryFailedEmails(tx, admin, { ids: ["not-a-uuid"] })),
    ).rejects.toBeInstanceOf(RuleError);
  });
});
