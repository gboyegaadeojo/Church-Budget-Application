import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, emailOutbox, expenseDecisions, spendingEntries } from "@/db/schema";
import type { Db } from "@/db/types";
import { RuleError, ValidationError } from "@/domain/errors";
import { boardDecide } from "@/domain/expenses/board";
import { loadExpense } from "@/domain/expenses/service";
import { recordVerbalApproval, verbalApprovers } from "@/domain/expenses/verbal";
import { correctEntry, recordEntry, voidEntry } from "@/domain/spending/service";
import { ForbiddenError } from "@/lib/authz";
import { createTestDb, type TestDb } from "./helpers/db";
import { expenseWorld, person, submitted, type ExpenseWorld } from "./helpers/expenses";

/**
 * Verbal approvals recorded by the Church Administrator, and emails for every spending
 * entry recorded by hand (decided by the church 2026-10-24).
 */

let t: TestDb;
let db: Db;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t?.close();
});

type Actor = Parameters<typeof recordVerbalApproval>[1];

async function verbal(
  actor: Actor,
  id: string,
  approval: Record<string, unknown>,
  key = randomUUID(),
) {
  const row = await loadExpense(db, id);
  return db.transaction((tx) =>
    recordVerbalApproval(tx, actor, {
      id,
      version: row.version,
      idempotencyKey: key,
      approval: { kind: "approve", how: "By phone, Oct 24", confirmed: true, ...approval },
    }),
  );
}

const forAccountant = (world: ExpenseWorld) => ({
  level: "accountant",
  approverUserId: world.accountant.id,
});
const forChair = (world: ExpenseWorld) => ({ level: "board", approverUserId: world.chair.id });

async function templatesFor(expenseId: string) {
  const rows = await db
    .select({ template: emailOutbox.template, to: emailOutbox.toEmail })
    .from(emailOutbox)
    .where(eq(emailOutbox.expenseSubmissionId, expenseId));
  const out = new Map<string, string[]>();
  for (const r of rows) out.set(r.template, [...(out.get(r.template) ?? []), r.to].sort());
  return out;
}

describe("recording verbal approvals", () => {
  it("both approvals recorded verbally approve the claim and charge the budget", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "expense_claim");

    const first = await verbal(world.office, expenseId, forAccountant(world));
    expect(first.status).toBe("awaiting_board");
    const second = await verbal(world.office, expenseId, forChair(world));
    expect(second.status).toBe("approved");

    const decisions = await db
      .select()
      .from(expenseDecisions)
      .where(eq(expenseDecisions.expenseSubmissionId, expenseId));
    expect(decisions).toHaveLength(2);
    for (const d of decisions) {
      expect(d).toMatchObject({
        channel: "verbal",
        recordedByUserId: world.office.id,
        recordedNote: "By phone, Oct 24",
      });
    }
    expect(decisions.find((d) => d.level === "accountant")).toMatchObject({
      decidedByUserId: world.accountant.id,
      actingRole: "accountant",
    });
    expect(decisions.find((d) => d.level === "board")).toMatchObject({
      decidedByUserId: world.chair.id,
      actingRole: "board_chair",
    });

    // FR-42: the approved claim is in the ledger, as with approvals given in the app.
    const entries = await db
      .select()
      .from(spendingEntries)
      .where(eq(spendingEntries.expenseSubmissionId, expenseId));
    expect(entries).toHaveLength(1);
  });

  it("audits the Church Administrator as the actor, naming whose approval it was", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    await verbal(world.office, expenseId, forAccountant(world));
    const [event] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityId, expenseId),
          eq(auditEvents.eventType, "expenses.verbal_approval_recorded"),
        ),
      );
    expect(event).toMatchObject({ actorUserId: world.office.id, actingRole: "church_admin" });
    expect(event.details).toMatchObject({
      channel: "verbal",
      onBehalfOfUserId: world.accountant.id,
      onBehalfOfRole: "accountant",
      how: "By phone, Oct 24",
    });
  });

  it("emails the approver it was recorded for, and the office; not the in-app note", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    await verbal(world.office, expenseId, forAccountant(world));
    const sent = await templatesFor(expenseId);
    expect(sent.get("expenses.verbal_recorded.accountant")).toEqual([world.accountant.email]);
    expect(sent.get("expenses.verbal_recorded.church_admin")).toContain(world.office.email);
    expect(sent.has("expenses.approved_one.accountant")).toBe(false);

    const [body] = await db
      .select({ text: emailOutbox.textBody })
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.expenseSubmissionId, expenseId),
          eq(emailOutbox.template, "expenses.verbal_recorded.accountant"),
        ),
      );
    expect(body.text).toContain("verbally");
    expect(body.text).toContain(world.office.name);
    expect(body.text).toContain("By phone, Oct 24");
  });

  it("the final approval email says it was verbal and who recorded it", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    await verbal(world.office, expenseId, forAccountant(world));
    await verbal(world.office, expenseId, forChair(world));
    const [body] = await db
      .select({ text: emailOutbox.textBody })
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.expenseSubmissionId, expenseId),
          eq(emailOutbox.template, "expenses.final_approved"),
        ),
      );
    expect(body.text).toContain(`${world.chair.name} (Board Chair), verbally`);
    expect(body.text).toContain(`recorded by ${world.office.name}`);
  });

  it("mixes with an approval in the app; the lower amount wins", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    await verbal(world.office, expenseId, {
      ...forAccountant(world),
      kind: "approve_smaller",
      amount: "500.00",
      note: "One microphone this year",
    });
    const row = await loadExpense(db, expenseId);
    await db.transaction((tx) =>
      boardDecide(tx, world.chair, {
        id: expenseId,
        version: row.version,
        idempotencyKey: randomUUID(),
        decision: { kind: "approve" },
      }),
    );
    expect(await loadExpense(db, expenseId)).toMatchObject({
      status: "approved",
      approvedTotalCents: 50_000,
    });
  });

  it("is idempotent: the same key twice records one approval", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    const key = randomUUID();
    const first = await verbal(world.office, expenseId, forAccountant(world), key);
    const again = await verbal(world.office, expenseId, forAccountant(world), key);
    expect(again).toEqual(first);
    const decisions = await db
      .select()
      .from(expenseDecisions)
      .where(eq(expenseDecisions.expenseSubmissionId, expenseId));
    expect(decisions).toHaveLength(1);
  });

  it("lists who can give each approval still needed", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    const choices = await verbalApprovers(db, await loadExpense(db, expenseId));
    expect(choices.accountant?.map((c) => c.userId)).toContain(world.accountant.id);
    expect(choices.board?.map((c) => c.userId)).toContain(world.chair.id);
    // The Vice-Chair only while the Chair is Away or conflicted.
    expect(choices.board?.map((c) => c.userId)).not.toContain(world.vice.id);
  });
});

describe("what can't be recorded", () => {
  it("needs the confirmation and how it was given", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    await expect(
      verbal(world.office, expenseId, { ...forAccountant(world), confirmed: false }),
    ).rejects.toThrow(ValidationError);
    await expect(
      verbal(world.office, expenseId, { ...forAccountant(world), how: "  " }),
    ).rejects.toThrow(ValidationError);
  });

  it("approvals only: never a return or a decline", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    await expect(
      verbal(world.office, expenseId, { ...forAccountant(world), kind: "decline", note: "No" }),
    ).rejects.toThrow(ValidationError);
  });

  it("never more than was asked", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    await expect(
      verbal(world.office, expenseId, {
        ...forAccountant(world),
        kind: "approve_smaller",
        amount: "5000.00",
        note: "More",
      }),
    ).rejects.toThrow(RuleError);
  });

  it("the named approver must be able to approve it themselves", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    // The Vice-Chair while the Chair is available.
    await expect(
      verbal(world.office, expenseId, { level: "board", approverUserId: world.vice.id }),
    ).rejects.toThrow(ValidationError);
    // An accountant who leads the department.
    const leader = await person(db, ["accountant", "requester"], [world.media.id]);
    await expect(
      verbal(world.office, expenseId, { level: "accountant", approverUserId: leader.id }),
    ).rejects.toThrow(ValidationError);
    // Someone without the role.
    await expect(
      verbal(world.office, expenseId, { level: "accountant", approverUserId: world.chair.id }),
    ).rejects.toThrow(ValidationError);
  });

  it("only the approval still needed", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    await verbal(world.office, expenseId, forAccountant(world));
    await expect(verbal(world.office, expenseId, forAccountant(world))).rejects.toThrow(RuleError);
  });

  it("only the Church Administrator, and never on their own claim", async () => {
    const world = await expenseWorld(db);
    const { expenseId } = await submitted(db, world, "purchase_request");
    await expect(verbal(world.accountant, expenseId, forChair(world))).rejects.toThrow(
      ForbiddenError,
    );
    await expect(verbal(world.requester, expenseId, forAccountant(world))).rejects.toThrow(
      ForbiddenError,
    );
  });
});

describe("spending entries email the Church Administrator", () => {
  async function entryEmails(template: string) {
    return db
      .select({ to: emailOutbox.toEmail, text: emailOutbox.textBody })
      .from(emailOutbox)
      .where(eq(emailOutbox.template, template));
  }

  it("when spending is recorded, corrected and voided by hand", async () => {
    const world = await expenseWorld(db);
    const { entryId } = await db.transaction((tx) =>
      recordEntry(tx, world.office, {
        cycleId: world.cycle.id,
        departmentId: world.media.id,
        entryType: "expense",
        spentOn: `${world.cycle.budgetYear}-03-15`,
        payee: "Verbal Test Supplier",
        description: "Cables",
        amount: "123.45",
        paymentMethod: "cheque",
        idempotencyKey: randomUUID(),
      }),
    );
    const recorded = (await entryEmails("spending.entry_recorded")).filter((r) =>
      r.text.includes("Verbal Test Supplier"),
    );
    expect(recorded.map((r) => r.to)).toContain(world.office.email);
    expect(recorded[0].text).toContain("$123.45");

    await db.transaction((tx) =>
      correctEntry(tx, world.accountant, {
        id: entryId,
        version: 1,
        reason: "Typo in the amount.",
        entryType: "expense",
        spentOn: `${world.cycle.budgetYear}-03-15`,
        payee: "Verbal Test Supplier",
        description: "Cables",
        amount: "132.45",
        paymentMethod: "cheque",
      }),
    );
    const corrected = (await entryEmails("spending.entry_corrected")).filter((r) =>
      r.text.includes("Verbal Test Supplier"),
    );
    expect(corrected.map((r) => r.to)).toContain(world.office.email);
    expect(corrected[0].text).toContain("Typo in the amount.");

    await db.transaction((tx) =>
      voidEntry(tx, world.office, { id: entryId, version: 2, reason: "Entered twice." }),
    );
    const voided = (await entryEmails("spending.entry_voided")).filter((r) =>
      r.text.includes("Verbal Test Supplier"),
    );
    expect(voided.map((r) => r.to)).toContain(world.office.email);
  });
});
