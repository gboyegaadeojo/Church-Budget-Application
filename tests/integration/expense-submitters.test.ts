import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { userRoles, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { RuleError } from "@/domain/errors";
import { expenseStartOptions, getExpenseView, listMyExpenses } from "@/domain/expenses/queries";
import { addExpenseSubmitter, removeExpenseSubmitter } from "@/domain/users/expense-submitters";
import { loadViewer } from "@/domain/users/viewer";
import { authzContextOf, loadExpense } from "@/domain/expenses/service";
import { authorize, ForbiddenError } from "@/lib/authz";
import type { Viewer } from "@/lib/roles";
import { createTestDb, type TestDb } from "./helpers/db";
import { expenseWorld, person, submitted } from "./helpers/expenses";
import { insertDepartment, insertUser } from "./helpers/fixtures";

/** The Expense submitter permission (6B.2). */

let t: TestDb;
let db: Db;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t?.close();
});

async function viewerOf(userId: string): Promise<Viewer> {
  const result = await loadViewer(db, userId);
  if (!result.ok) throw new Error(`No viewer: ${result.reason}`);
  return result.viewer;
}

/** A verified volunteer with the Requester role and no department yet. */
async function volunteer() {
  const row = await insertUser(db, { pcoLeaderVerified: true, accessStatus: "pending_department" });
  await db.insert(userRoles).values({ userId: row.id, role: "requester" });
  return row;
}

describe("Expense submitter (6B.2)", () => {
  it("submits only for the departments given, and sees only their own", async () => {
    const world = await expenseWorld(db);
    const admin = await person(db, ["system_admin"]);
    const vol = await volunteer();
    // Waiting for a department until the administrator gives one.
    expect(await loadViewer(db, vol.id)).toEqual({ ok: false, reason: "waiting" });

    const result = await db.transaction((tx) =>
      addExpenseSubmitter(tx, admin, { userId: vol.id, departmentId: world.media.id }),
    );
    expect(result.department).toBe(world.media.name);
    const [stored] = await db.select().from(users).where(eq(users.id, vol.id));
    expect(stored.accessStatus).toBe("active");

    const me = await viewerOf(vol.id);
    expect(me.departments).toEqual([]);
    expect(me.expenseDepartments?.map((d) => d.id)).toEqual([world.media.id]);
    const options = await expenseStartOptions(db, me);
    expect(options.map((o) => o.id)).toEqual([world.media.id]);

    // Their own claim: theirs to see and change.
    const mine = await submitted(db, { ...world, requester: me }, "expense_claim");
    const view = await getExpenseView(db, me, mine.expenseId);
    expect(view?.canEdit).toBe(true);

    // The leader's expense in the same department isn't theirs.
    const leaders = await submitted(db, world, "purchase_request");
    expect(await getExpenseView(db, me, leaders.expenseId)).toBeNull();
    expect((await listMyExpenses(db, me)).map((r) => r.id)).toEqual([mine.expenseId]);

    // The leader still sees the volunteer's claim (it's their department's).
    expect(await getExpenseView(db, world.requester, mine.expenseId)).not.toBeNull();

    // Removed: can't start another, but what they submitted stays.
    await db.transaction((tx) =>
      removeExpenseSubmitter(tx, admin, { userId: vol.id, departmentId: world.media.id }),
    );
    const after = await viewerOf(vol.id).catch(() => null);
    expect(after).toBeNull(); // back to waiting: no department
  });

  it("needs the Requester role, an active department, and isn't for leaders", async () => {
    const world = await expenseWorld(db);
    const admin = await person(db, ["system_admin"]);
    const board = await insertUser(db, { accessStatus: "active" });
    await db.insert(userRoles).values({ userId: board.id, role: "board_chair" });
    await expect(
      db.transaction((tx) =>
        addExpenseSubmitter(tx, admin, { userId: board.id, departmentId: world.media.id }),
      ),
    ).rejects.toThrow(RuleError);
    await expect(
      db.transaction((tx) =>
        addExpenseSubmitter(tx, admin, {
          userId: world.requester.id,
          departmentId: world.media.id,
        }),
      ),
    ).rejects.toThrow(RuleError);
    const closed = await insertDepartment(db, { status: "inactive" });
    const vol = await volunteer();
    await expect(
      db.transaction((tx) =>
        addExpenseSubmitter(tx, admin, { userId: vol.id, departmentId: closed.id }),
      ),
    ).rejects.toThrow(RuleError);
    // Only the System Administrator gives it.
    await expect(
      db.transaction((tx) =>
        addExpenseSubmitter(tx, world.accountant, { userId: vol.id, departmentId: world.media.id }),
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("lets the Church Administrator submit for a department, but not pay their own", async () => {
    const world = await expenseWorld(db);
    const admin = await person(db, ["system_admin"]);
    const office = await insertUser(db, { accessStatus: "active" });
    await db.insert(userRoles).values({ userId: office.id, role: "church_admin" });
    await db.transaction((tx) =>
      addExpenseSubmitter(tx, admin, { userId: office.id, departmentId: world.media.id }),
    );
    const me = await viewerOf(office.id);
    expect(me.expenseDepartments?.map((d) => d.id)).toEqual([world.media.id]);
    expect((await expenseStartOptions(db, me)).map((o) => o.id)).toEqual([world.media.id]);

    const { expenseId } = await submitted(db, { ...world, requester: me }, "expense_claim");
    const row = await loadExpense(db, expenseId);
    // FR-47: they don't record a payment for an expense they submitted.
    expect(authorize(me, "expense.pay", authzContextOf(row)).allowed).toBe(false);
    expect(authorize(world.office, "expense.pay", authzContextOf(row)).allowed).toBe(true);
  });
});
