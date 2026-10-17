import { randomUUID } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, budgetCycles, emailOutbox, spendingEntries } from "@/db/schema";
import type { Db } from "@/db/types";
import { RuleError, ValidationError } from "@/domain/errors";
import { budgetFigures } from "@/domain/expenses/budget";
import { correctEntry, recordEntry, voidEntry } from "@/domain/spending/service";
import { ForbiddenError } from "@/lib/authz";
import { createTestDb, type TestDb } from "./helpers/db";
import { expenseWorld, person, type ExpenseWorld } from "./helpers/expenses";
import { insertDepartment } from "./helpers/fixtures";

/** Spending entries (FR-24, FR-25, FR-28, FR-29; AC-82 to AC-90). */

let t: TestDb;
let db: Db;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t?.close();
});

const day = (world: ExpenseWorld, md = "03-15") => `${world.cycle.budgetYear}-${md}`;

function entry(world: ExpenseWorld, overrides: Record<string, unknown> = {}) {
  return {
    cycleId: world.cycle.id,
    departmentId: world.media.id,
    entryType: "expense",
    spentOn: day(world),
    payee: "Long & McQuade",
    description: "Stage monitors",
    amount: "10,000.00",
    paymentMethod: "cheque",
    referenceNumber: "",
    ...overrides,
  };
}

const record = (actor: Parameters<typeof recordEntry>[1], input: Record<string, unknown>) =>
  db.transaction((tx) => recordEntry(tx, actor, { ...input, idempotencyKey: randomUUID() }));

async function alerts(world: ExpenseWorld, kind: "near_limit" | "over_budget") {
  return db
    .select({ to: emailOutbox.toEmail })
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.template, `spending.alert.${kind}`),
        like(emailOutbox.dedupeKey, `%:${world.cycle.id}:${world.media.id}`),
      ),
    );
}

describe("recording spending (FR-24, FR-25)", () => {
  it("AC-82 AC-83: expenses and a refund update Spent and Remaining at once", async () => {
    const world = await expenseWorld(db, { budgetCents: 3_360_000 });
    await record(world.office, entry(world));
    await record(world.office, entry(world, { amount: "5000", payee: "B&H" }));
    await record(world.office, entry(world, { entryType: "refund", amount: "500.00" }));
    expect(await budgetFigures(db, world.cycle.id, world.media.id)).toMatchObject({
      spent: 1_450_000,
      remaining: 1_910_000,
    });
  });

  it("AC-85: going over budget needs an overspend note and alerts the accountant once", async () => {
    const world = await expenseWorld(db, { budgetCents: 100_000 });
    await expect(record(world.office, entry(world, { amount: "1500" }))).rejects.toThrow(
      ValidationError,
    );
    await record(world.office, entry(world, { amount: "1500", overspendNote: "Board agreed." }));
    expect((await alerts(world, "over_budget")).map((a) => a.to)).toContain(world.accountant.email);
    const before = (await alerts(world, "over_budget")).length;
    await record(
      world.office,
      entry(world, { amount: "10", payee: "Again", overspendNote: "Still over." }),
    );
    expect((await alerts(world, "over_budget")).length).toBe(before);
  });

  it("AC-86: reaching the near-limit threshold emails the accountant once per cycle", async () => {
    const world = await expenseWorld(db, { budgetCents: 100_000 });
    await record(world.office, entry(world, { amount: "850" })); // 85%
    const first = await alerts(world, "near_limit");
    expect(first.map((a) => a.to)).toContain(world.accountant.email);
    await record(world.office, entry(world, { amount: "10", payee: "More" }));
    expect((await alerts(world, "near_limit")).length).toBe(first.length);
  });

  it("warns about a duplicate and a department with no budget, and keeps to the year", async () => {
    const world = await expenseWorld(db);
    await record(world.office, entry(world, { referenceNumber: "INV-7" }));
    await expect(record(world.office, entry(world, { referenceNumber: "inv-7" }))).rejects.toThrow(
      ValidationError,
    );
    await record(world.office, entry(world, { referenceNumber: "INV-7", confirmDuplicate: true }));

    const youth = await insertDepartment(db);
    const unbudgeted = entry(world, { departmentId: youth.id });
    await expect(record(world.office, unbudgeted)).rejects.toThrow(ValidationError);
    const { entryId } = await record(world.office, { ...unbudgeted, confirmUnbudgeted: true });
    const [row] = await db.select().from(spendingEntries).where(eq(spendingEntries.id, entryId));
    expect(row.unbudgeted).toBe(true);

    const lastYear = entry(world, { spentOn: `${world.cycle.budgetYear - 1}-12-31` });
    await expect(record(world.office, lastYear)).rejects.toThrow(ValidationError);
    // Only the accountant can allow it.
    await expect(record(world.office, { ...lastYear, allowOutsideYear: true })).rejects.toThrow(
      ValidationError,
    );
    await record(world.accountant, { ...lastYear, allowOutsideYear: true });
  });
});

describe("correcting and voiding (FR-24, AC-87)", () => {
  it("keeps the previous values in the audit trail, and a void leaves Spent", async () => {
    const world = await expenseWorld(db);
    const { entryId } = await record(world.office, entry(world, { amount: "200" }));
    await db.transaction((tx) =>
      correctEntry(tx, world.office, {
        ...entry(world, { amount: "250" }),
        id: entryId,
        version: 1,
        reason: "Receipt said $250.",
      }),
    );
    const [audit] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityId, entryId),
          eq(auditEvents.eventType, "spending.entry_corrected"),
        ),
      );
    expect(audit.details).toMatchObject({
      before: { amountCents: 20_000 },
      after: { amountCents: 25_000 },
    });
    expect((await budgetFigures(db, world.cycle.id, world.media.id)).spent).toBe(25_000);

    await expect(
      db.transaction((tx) => voidEntry(tx, world.office, { id: entryId, version: 2, reason: "" })),
    ).rejects.toThrow(ValidationError);
    await db.transaction((tx) =>
      voidEntry(tx, world.office, { id: entryId, version: 2, reason: "Entered twice." }),
    );
    const [row] = await db.select().from(spendingEntries).where(eq(spendingEntries.id, entryId));
    expect(row).toMatchObject({ status: "voided", voidReason: "Entered twice." });
    expect((await budgetFigures(db, world.cycle.id, world.media.id)).spent).toBe(0);
  });

  it("AC-88: requesters and the board can't record; nobody deletes", async () => {
    const world = await expenseWorld(db);
    await expect(record(world.requester, entry(world))).rejects.toThrow(ForbiddenError);
    await expect(record(world.chair, entry(world))).rejects.toThrow(ForbiddenError);
    const { entryId } = await record(world.office, entry(world));
    await expect(
      db.delete(spendingEntries).where(eq(spendingEntries.id, entryId)),
    ).rejects.toThrow();
  });

  it("AC-90: after the spending period is locked, nothing is added, corrected or voided", async () => {
    const world = await expenseWorld(db);
    const { entryId } = await record(world.office, entry(world));
    const admin = await person(db, ["system_admin"]);
    await db
      .update(budgetCycles)
      .set({ spendingLockedAt: new Date(), spendingLockedByUserId: admin.id })
      .where(eq(budgetCycles.id, world.cycle.id));
    await expect(record(world.office, entry(world))).rejects.toThrow(RuleError);
    await expect(
      db.transaction((tx) =>
        voidEntry(tx, world.office, { id: entryId, version: 1, reason: "Too late" }),
      ),
    ).rejects.toThrow(RuleError);
  });
});
