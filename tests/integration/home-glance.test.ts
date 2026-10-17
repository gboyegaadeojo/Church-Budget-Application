import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db, Tx } from "@/db/types";
import { boardDecide } from "@/domain/expenses/board";
import { accountantDecide } from "@/domain/expenses/review";
import { loadExpense } from "@/domain/expenses/service";
import { atAGlance } from "@/domain/home/glance";
import type { Viewer } from "@/lib/roles";
import { createTestDb, type TestDb } from "./helpers/db";
import { expenseWorld, submitted, type ExpenseWorld } from "./helpers/expenses";

/** Home's At a glance cards (FR-37, DRD 6.0): one per role, matching the screens. */

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

const viewerOf = (p: ExpenseWorld["requester"]): Viewer => ({
  id: p.id,
  name: p.name,
  email: p.email,
  roles: p.roles,
  departments: p.departments,
});

describe("At a glance (FR-37)", () => {
  it("shows each role its summary", async () => {
    const world = await expenseWorld(db);
    const { expenseId: id } = await submitted(db, world, "expense_claim"); // $168.00

    const mine = await atAGlance(db, viewerOf(world.requester));
    const media = mine.find((c) => c.kind === "department" && c.department === world.media.name);
    expect(media).toMatchObject({
      kind: "department",
      figures: { available: 3_000_000, pending: 16_800, remaining: 3_000_000 },
      href: "/expenses/mine",
    });

    const accountant = await atAGlance(db, viewerOf(world.accountant));
    const review = accountant.find((c) => c.kind === "review");
    expect(review && review.kind === "review" && review.expenses).toBeGreaterThanOrEqual(1);
    expect(accountant.some((c) => c.kind === "department")).toBe(false);

    // Both approve; the claim is ready to pay.
    for (const [actor, decide] of [
      [world.accountant, accountantDecide],
      [world.chair, boardDecide],
    ] as const) {
      const row = await loadExpense(db, id);
      await run((tx) =>
        decide(tx, actor, {
          id,
          version: row.version,
          idempotencyKey: randomUUID(),
          decision: { kind: "approve" },
        }),
      );
    }
    const office = await atAGlance(db, viewerOf(world.office));
    const pay = office.find((c) => c.kind === "pay");
    expect(pay && pay.kind === "pay" && pay.owedCents).toBeGreaterThanOrEqual(16_800);

    const board = await atAGlance(db, viewerOf(world.chair));
    expect(board.map((c) => c.kind)).toEqual(["board"]);
  });
});
