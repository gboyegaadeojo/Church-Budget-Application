import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { budgetCycles, userRoles } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { getOpenCycle } from "@/domain/annual/queries";
import { saveDraft, startRequest } from "@/domain/annual/service";
import { RuleError } from "@/domain/errors";
import { expenseStartOptions } from "@/domain/expenses/queries";
import { closeBudgetYear } from "@/domain/spending/year-end";
import { annualRequesterTasks } from "@/domain/tasks/annual";
import { loadViewer } from "@/domain/users/viewer";
import type { Subject } from "@/lib/authz";
import { createTestDb, type TestDb } from "./helpers/db";
import { expenseWorld, person } from "./helpers/expenses";
import { insertCycle, insertDepartment, insertUser } from "./helpers/fixtures";

/*
 * A budget cycle is the budget year (docs/decisions.md 2026-10-18). Open means the year is
 * live: departments submit until the deadline and spend all year. Closed means it ended.
 * So two cycles can be open at once: last year being spent, next year taking budgets.
 */

let t: TestDb;
let db: Db;
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t?.close();
});

async function leader(): Promise<Subject> {
  const row = await insertUser(db, { pcoLeaderVerified: true, accessStatus: "pending_department" });
  await db.insert(userRoles).values({ userId: row.id, role: "requester" });
  return { id: row.id, roles: ["requester"], departments: [] };
}

async function viewerOf(subject: Subject) {
  const result = await loadViewer(db, subject.id);
  if (!result.ok) throw new Error(result.reason);
  return result.viewer;
}

describe("two open budget years", () => {
  it("takes budgets for the later year, refuses the earlier one past its deadline, and spends from both", async () => {
    // The spending year: open, its submission deadline long past, a budget approved.
    const world = await expenseWorld(db);
    await db
      .update(budgetCycles)
      .set({ submissionDeadline: new Date("2020-11-30T08:00:00Z") })
      .where(eq(budgetCycles.id, world.cycle.id));
    // Next year, taking submissions.
    const owner = await insertUser(db);
    const next = await insertCycle(db, owner.id, {
      budgetYear: world.cycle.budgetYear + 1,
      name: `FY${world.cycle.budgetYear + 1}`,
      submissionDeadline: new Date(Date.now() + 30 * 86_400_000),
    });

    expect((await run((tx) => getOpenCycle(tx)))!.id).toBe(next.id);

    const me = await leader();
    const dept = await insertDepartment(db);
    await expect(
      run((tx) => startRequest(tx, me, { cycleId: world.cycle.id, departmentId: dept.id })),
    ).rejects.toBeInstanceOf(RuleError);
    const started = await run((tx) =>
      startRequest(tx, me, { cycleId: next.id, departmentId: dept.id }),
    );
    expect(started.existing).toBe(false);

    // The department leading the spending year can still charge expenses to it.
    const options = await expenseStartOptions(db, world.requester);
    expect(options[0].cycles.map((c) => c.id)).toContain(world.cycle.id);
  });

  it("a draft past its deadline is no task; a closed year's draft can't be saved", async () => {
    const owner = await insertUser(db);
    const cycle = await insertCycle(db, owner.id, {
      budgetYear: 2071,
      name: "FY2071",
      submissionDeadline: new Date(Date.now() + 86_400_000),
    });
    const me = await leader();
    const dept = await insertDepartment(db);
    const { requestId } = await run((tx) =>
      startRequest(tx, me, { cycleId: cycle.id, departmentId: dept.id }),
    );
    const viewer = await viewerOf(me);
    expect((await annualRequesterTasks(db, viewer)).map((x) => x.id)).toContain(
      `annual:${requestId}:submit`,
    );
    const afterDeadline = new Date(Date.now() + 2 * 86_400_000);
    expect(await annualRequesterTasks(db, viewer, afterDeadline)).toEqual([]);

    const accountant = await person(db, ["accountant"]);
    await run((tx) =>
      closeBudgetYear(tx, accountant, {
        cycleId: cycle.id,
        version: cycle.version,
        idempotencyKey: randomUUID(),
      }),
    );
    const [row] = await db.select().from(budgetCycles).where(eq(budgetCycles.id, cycle.id));
    expect(row).toMatchObject({ status: "closed" });
    expect(row.spendingLockedAt).not.toBeNull();
    await expect(
      run((tx) =>
        saveDraft(tx, viewer, {
          id: requestId,
          version: 1,
          title: "Late",
          justification: "Late",
          lines: [],
        }),
      ),
    ).rejects.toBeInstanceOf(RuleError);
  });

  it("the database keeps Closed and the spending lock together", async () => {
    const owner = await insertUser(db);
    const cycle = await insertCycle(db, owner.id, { budgetYear: 2072, name: "FY2072" });
    await expect(
      db.update(budgetCycles).set({ status: "closed" }).where(eq(budgetCycles.id, cycle.id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(budgetCycles)
        .set({ spendingLockedAt: new Date() })
        .where(eq(budgetCycles.id, cycle.id)),
    ).rejects.toThrow();
  });
});
