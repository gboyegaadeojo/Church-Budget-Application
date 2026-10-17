import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deadlineExtensions } from "@/db/schema";
import type { Db } from "@/db/types";
import { departmentsOverview } from "@/domain/annual/departments-overview";
import { createTestDb, type TestDb } from "./helpers/db";
import { expenseWorld, person } from "./helpers/expenses";

/** Annual Budget → Departments: leaders, budget status and extensions (DRD 6.0). */

let t: TestDb;
let db: Db;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t?.close();
});

describe("the accountant's Departments page", () => {
  it("lists each department's leaders, budget, remaining and any extension", async () => {
    const world = await expenseWorld(db, { budgetCents: 3_360_000 });
    const second = await person(db, ["requester"], [world.media.id]);
    const extended = new Date("2099-12-01T23:00:00Z");
    await db.insert(deadlineExtensions).values({
      cycleId: world.cycle.id,
      departmentId: world.media.id,
      newDeadline: extended,
      reason: "Leader travelling",
      grantedByUserId: world.accountant.id,
    });

    const view = await departmentsOverview(db, world.accountant, world.cycle.id);
    expect(view?.cycle?.id).toBe(world.cycle.id);
    const media = view!.rows.find((r) => r.id === world.media.id)!;
    expect(media).toMatchObject({
      primary: { email: world.requester.email },
      backups: [],
      representatives: 1,
      progress: "approved",
      approvedCents: 3_360_000,
      remainingCents: 3_360_000,
      extendedTo: extended,
      away: null,
    });
    expect(second.email).not.toBe(world.requester.email);
  });

  it("is for the people who review budgets", async () => {
    const world = await expenseWorld(db);
    expect(await departmentsOverview(db, world.requester, world.cycle.id)).toBeNull();
    expect(await departmentsOverview(db, world.office, world.cycle.id)).toBeNull();
    expect(await departmentsOverview(db, world.chair, world.cycle.id)).toBeNull();
    const admin = await person(db, ["system_admin"]);
    expect(await departmentsOverview(db, admin, world.cycle.id)).not.toBeNull();
  });
});
