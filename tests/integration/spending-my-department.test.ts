import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/types";
import { myDepartmentSpending } from "@/domain/spending/my-department";
import { recordEntry, voidEntry } from "@/domain/spending/service";
import { createTestDb, type TestDb } from "./helpers/db";
import { expenseWorld, person, type ExpenseWorld } from "./helpers/expenses";
import { insertApprovedBudget, insertDepartment, insertUser } from "./helpers/fixtures";

/** The requester's My department budget panel (FR-28, AC-89, DRD 6.2a). */

let t: TestDb;
let db: Db;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t?.close();
});

const record = (
  world: ExpenseWorld,
  departmentId: string,
  overrides: Record<string, unknown> = {},
) =>
  db.transaction((tx) =>
    recordEntry(tx, world.office, {
      cycleId: world.cycle.id,
      departmentId,
      entryType: "expense",
      spentOn: `${world.cycle.budgetYear}-03-15`,
      payee: "Long & McQuade",
      description: "Monitors",
      amount: "1000",
      paymentMethod: "cheque",
      referenceNumber: "CHQ-1001",
      idempotencyKey: randomUUID(),
      ...overrides,
    }),
  );

describe("My department budget (FR-28)", () => {
  it("AC-89 a requester sees their own department's budget, spent and remaining, and no other department's spending", async () => {
    const world = await expenseWorld(db, { budgetCents: 3_360_000 });
    const owner = await insertUser(db);
    const youth = await insertDepartment(db, { name: `Youth ${randomUUID().slice(0, 6)}` });
    await insertApprovedBudget(
      db,
      {
        cycleId: world.cycle.id,
        departmentId: youth.id,
        userId: owner.id,
        approverUserId: world.accountant.id,
      },
      500_000,
    );
    await record(world, world.media.id, { amount: "10,000.00" });
    const { entryId } = await record(world, world.media.id, { amount: "250", payee: "Typo Inc" });
    await db.transaction((tx) =>
      voidEntry(tx, world.office, { id: entryId, version: 1, reason: "Entered twice." }),
    );
    await record(world, world.media.id, { entryType: "refund", amount: "500", payee: "Refund Co" });
    await record(world, youth.id, { amount: "400", payee: "Youth Camp" });

    const view = await myDepartmentSpending(db, world.requester, world.cycle.id);
    expect(view?.cycle?.id).toBe(world.cycle.id);
    expect(view!.departments.map((d) => d.departmentId)).toEqual([world.media.id]);
    const media = view!.departments[0];
    expect(media.figures).toMatchObject({
      approved: 3_360_000,
      available: 3_360_000,
      spent: 950_000,
      remaining: 2_410_000,
    });
    expect(media.status).toBe("on_track");
    expect(media.entries.map((e) => e.payee).sort()).toEqual(
      ["Long & McQuade", "Refund Co", "Typo Inc"].sort(),
    );
    expect(media.entries.find((e) => e.payee === "Typo Inc")?.voided).toBe(true);
    expect(media.entries.find((e) => e.payee === "Refund Co")?.entryType).toBe("refund");
    // Payment method and reference numbers are never sent to requesters.
    for (const e of media.entries) {
      expect(Object.keys(e).sort()).toEqual(
        ["amountCents", "description", "entryType", "id", "payee", "spentOn", "voided"].sort(),
      );
    }
    expect(JSON.stringify(view)).not.toContain("CHQ-1001");
    expect(JSON.stringify(view)).not.toContain("Youth Camp");
  });

  it("shows a department with no approved budget as no_budget, and refuses non-requesters", async () => {
    const world = await expenseWorld(db);
    const choir = await insertDepartment(db, { name: `Choir ${randomUUID().slice(0, 6)}` });
    const leader = await person(db, ["requester"], [choir.id]);
    const view = await myDepartmentSpending(db, leader, world.cycle.id);
    expect(view!.departments[0]).toMatchObject({ status: "no_budget", entries: [] });

    expect(await myDepartmentSpending(db, world.accountant, world.cycle.id)).toBeNull();
    expect(await myDepartmentSpending(db, world.chair, world.cycle.id)).toBeNull();
    const admin = await person(db, ["system_admin"]);
    expect(await myDepartmentSpending(db, admin, world.cycle.id)).toBeNull();
  });
});
