import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents } from "@/db/schema";
import type { Db } from "@/db/types";
import { ValidationError } from "@/domain/errors";
import { myTours, recordTour } from "@/domain/tours/service";
import { ForbiddenError, type Subject } from "@/lib/authz";
import { createTestDb, type TestDb } from "./helpers/db";
import { insertUser } from "./helpers/fixtures";

/* Guided tours (decided 2026-11-12): who is offered which tour, and remembering the answer. */

let t: TestDb;
let db: Db;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t?.close();
});

async function person(subject: Omit<Subject, "id">): Promise<Subject> {
  const row = await insertUser(db, { accessStatus: "active" });
  return { id: row!.id, ...subject };
}

describe("guided tours", () => {
  it("offers a requester both tours until they answer, and remembers each answer", async () => {
    const leader = await person({ roles: ["requester"], departments: [] });
    expect(await myTours(db, leader)).toEqual([
      { tour: "annual", outcome: null },
      { tour: "expense", outcome: null },
    ]);

    await db.transaction((tx) => recordTour(tx, leader, { tour: "annual", outcome: "dismissed" }));
    await db.transaction((tx) => recordTour(tx, leader, { tour: "expense", outcome: "finished" }));
    expect(await myTours(db, leader)).toEqual([
      { tour: "annual", outcome: "dismissed" },
      { tour: "expense", outcome: "finished" },
    ]);

    // Taking it again and finishing replaces "Not now"; a later "Not now" never undoes finished.
    await db.transaction((tx) => recordTour(tx, leader, { tour: "annual", outcome: "finished" }));
    await db.transaction((tx) => recordTour(tx, leader, { tour: "annual", outcome: "dismissed" }));
    expect((await myTours(db, leader))[0]).toEqual({ tour: "annual", outcome: "finished" });
  });

  it("offers staff no tour, and refuses to record one for them", async () => {
    const accountant = await person({ roles: ["accountant"], departments: [] });
    expect(await myTours(db, accountant)).toEqual([]);
    await expect(
      db.transaction((tx) => recordTour(tx, accountant, { tour: "annual", outcome: "finished" })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("offers an Expense submitter of any role only the new expense tour", async () => {
    const office = await person({
      roles: ["church_admin"],
      departments: [],
      expenseDepartments: [{ id: "media", name: "Media" }],
    });
    expect(await myTours(db, office)).toEqual([{ tour: "expense", outcome: null }]);
  });

  it("rejects a tour or answer it doesn't know", async () => {
    const leader = await person({ roles: ["requester"], departments: [] });
    await expect(
      db.transaction((tx) => recordTour(tx, leader, { tour: "payroll", outcome: "finished" })),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      db.transaction((tx) => recordTour(tx, leader, { tour: "annual", outcome: "skipped" })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("keeps tour answers out of the activity log", async () => {
    const before = (await db.select().from(auditEvents)).length;
    const leader = await person({ roles: ["requester"], departments: [] });
    await db.transaction((tx) => recordTour(tx, leader, { tour: "annual", outcome: "finished" }));
    expect((await db.select().from(auditEvents)).length).toBe(before);
  });
});
