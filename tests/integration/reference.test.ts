import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nextReference } from "@/db/reference";
import type { Db } from "@/db/types";
import { createTestDb, type TestDb } from "./helpers/db";

let t: TestDb;
let db: Db;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t?.close();
});

describe("nextReference", () => {
  it("numbers annual budgets per year: IFC-{year}-0001 (AC-37)", async () => {
    expect(await nextReference(db, "annual", 2027)).toBe("IFC-2027-0001");
    expect(await nextReference(db, "annual", 2027)).toBe("IFC-2027-0002");
    expect(await nextReference(db, "annual", 2028)).toBe("IFC-2028-0001");
  });

  it("numbers expenses separately: EXP-{year}-0001", async () => {
    expect(await nextReference(db, "expense", 2027)).toBe("EXP-2027-0001");
    expect(await nextReference(db, "annual", 2027)).toBe("IFC-2027-0003");
  });

  it("gives the number back when the transaction rolls back", async () => {
    await expect(
      db.transaction(async (tx) => {
        expect(await nextReference(tx, "expense", 2030)).toBe("EXP-2030-0001");
        throw new Error("submission failed");
      }),
    ).rejects.toThrow("submission failed");
    expect(await nextReference(db, "expense", 2030)).toBe("EXP-2030-0001");
  });

  it("never repeats a number under concurrent submissions", async () => {
    const numbers = await Promise.all(
      Array.from({ length: 20 }, () => db.transaction((tx) => nextReference(tx, "annual", 2031))),
    );
    expect(new Set(numbers).size).toBe(20);
  });

  it("rejects a nonsensical year", async () => {
    await expect(nextReference(db, "annual", 27)).rejects.toThrow(RangeError);
  });
});
