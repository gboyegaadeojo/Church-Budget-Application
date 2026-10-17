import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { appSettings } from "@/db/schema";
import type { Db } from "@/db/types";
import { DEMO_MARKER, FAKE_IDENTITIES, fakeSignInAllowed, isDemoDatabase } from "@/lib/demo";
import { createTestDb, type TestDb } from "./helpers/db";

/** The hosted demo's sign-in guard (docs/demo-site.md). */

let t: TestDb;
let db: Db;
const saved = { DEMO_MODE: process.env.DEMO_MODE, AUTH_URL: process.env.AUTH_URL };

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterEach(() => {
  process.env.DEMO_MODE = saved.DEMO_MODE;
  process.env.AUTH_URL = saved.AUTH_URL;
});

afterAll(async () => {
  await t?.close();
});

describe("demo sign-in", () => {
  const gina = FAKE_IDENTITIES.find((i) => i.name === "Gina Admin")!.subject;

  it("needs the database itself to be marked as the demo's, and a listed person", async () => {
    process.env.DEMO_MODE = "1";
    process.env.AUTH_URL = "https://demo-ifc-budget.netlify.app";
    // A real database, even with DEMO_MODE set by mistake: nobody gets in this way.
    expect(await isDemoDatabase(db)).toBe(false);
    expect(await fakeSignInAllowed(db, gina)).toBe(false);

    await db.insert(appSettings).values({ key: DEMO_MARKER, value: "true" });
    expect(await fakeSignInAllowed(db, gina)).toBe(true);
    // Only the made-up people, never an identity typed into the form.
    expect(await fakeSignInAllowed(db, "someone-typed-in")).toBe(false);
  });

  it("isn't limited on this computer (tests and local development)", async () => {
    delete process.env.DEMO_MODE;
    expect(await fakeSignInAllowed(db, "anything")).toBe(true);
  });
});
