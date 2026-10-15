import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, signingAuthorities, userRoles, users } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { ConflictError, RuleError, ValidationError } from "@/domain/errors";
import { readSettings } from "@/domain/settings";
import { setPrimaryAccountant, settingVersions } from "@/domain/settings/service";
import {
  activeSigners,
  addSigner,
  editSigner,
  listSigners,
  removeSigner,
} from "@/domain/signers/service";
import { setUserActive, setUserRoles } from "@/domain/users/admin";
import { accountantTeam } from "@/domain/users/admin-queries";
import { ForbiddenError, type Subject } from "@/lib/authz";
import type { Role } from "@/lib/roles";
import { createTestDb, expectRejected, type TestDb } from "./helpers/db";
import { insertUser } from "./helpers/fixtures";

// 2026-10-20 at 11:00 in Winnipeg.
const NOW = new Date("2026-10-20T16:00:00Z");

let t: TestDb;
let db: Db;
let admin: Subject;

const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

async function person(roles: Role[]) {
  const row = await insertUser(db, { accessStatus: "active" });
  if (roles.length)
    await db.insert(userRoles).values(roles.map((role) => ({ userId: row.id, role })));
  return { id: row.id, roles, departments: [], version: row.version };
}

async function events(eventType: string) {
  return db.select().from(auditEvents).where(eq(auditEvents.eventType, eventType));
}

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
  admin = await person(["system_admin"]);
});

afterAll(async () => {
  await t?.close();
});

describe("cheque signing authorities (FR-53)", () => {
  it("AC-134 adds, edits and removes a signer, who stays listed but isn't offered", async () => {
    const pat = await run((tx) =>
      addSigner(tx, admin, { name: " Pat Treasurer ", email: "PAT@example.org" }, { now: NOW }),
    );
    expect(pat).toMatchObject({
      name: "Pat Treasurer",
      email: "pat@example.org",
      activeFrom: "2026-10-20",
      activeUntil: null,
    });
    const lee = await run((tx) =>
      addSigner(tx, admin, { name: "Lee Chair", activeFrom: "2026-01-01" }),
    );

    await run((tx) =>
      editSigner(tx, admin, {
        id: pat.id,
        version: pat.version,
        name: "Pat Treasurer-Lo",
        email: "",
      }),
    );
    expect((await events("admin.signer_edited"))[0].details).toMatchObject({
      before: { name: "Pat Treasurer", email: "pat@example.org" },
      after: { name: "Pat Treasurer-Lo", email: null },
    });

    expect((await activeSigners(db, "2026-10-21")).map((x) => x.name)).toEqual([
      "Lee Chair",
      "Pat Treasurer-Lo",
    ]);
    await run((tx) =>
      removeSigner(tx, admin, {
        id: lee.id,
        version: lee.version,
        removeFrom: "2026-11-01",
        reason: "Left the board",
      }),
    );
    // Active the day before the removal date, not from it.
    expect((await activeSigners(db, "2026-10-31")).map((x) => x.name)).toContain("Lee Chair");
    expect((await activeSigners(db, "2026-11-01")).map((x) => x.name)).toEqual([
      "Pat Treasurer-Lo",
    ]);
    // Not active before their start date either.
    expect((await activeSigners(db, "2026-10-19")).map((x) => x.name)).toEqual(["Lee Chair"]);

    const all = await listSigners(db);
    expect(all.find((x) => x.id === lee.id)).toMatchObject({
      name: "Lee Chair",
      activeUntil: "2026-11-01",
      removedReason: "Left the board",
    });
    expect(await events("admin.signer_removed")).toHaveLength(1);
  });

  it("never deletes a signer", async () => {
    const x = await run((tx) => addSigner(tx, admin, { name: "Sam Elder" }, { now: NOW }));
    await expectRejected(
      db.delete(signingAuthorities).where(eq(signingAuthorities.id, x.id)),
      "append-only",
    );
  });

  it("validates input, refuses a second removal and a stale form", async () => {
    await expect(
      run((tx) => addSigner(tx, admin, { name: "", email: "nope" })),
    ).rejects.toMatchObject({
      fieldErrors: { name: expect.any(String), email: expect.any(String) },
    });
    const x = await run((tx) => addSigner(tx, admin, { name: "Ana", activeFrom: "2026-10-01" }));
    await expect(
      run((tx) =>
        removeSigner(tx, admin, { id: x.id, version: x.version, removeFrom: "2026-09-01" }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await run((tx) => editSigner(tx, admin, { id: x.id, version: x.version, name: "Ana B" }));
    await expect(
      run((tx) => editSigner(tx, admin, { id: x.id, version: x.version, name: "Ana C" })),
    ).rejects.toBeInstanceOf(ConflictError);
    await run((tx) => removeSigner(tx, admin, { id: x.id, version: x.version + 1 }, { now: NOW }));
    await expect(
      run((tx) => removeSigner(tx, admin, { id: x.id, version: x.version + 2 })),
    ).rejects.toBeInstanceOf(RuleError);
  });

  it("is only for the System Administrator", async () => {
    const churchAdmin = await person(["church_admin"]);
    await expect(run((tx) => addSigner(tx, churchAdmin, { name: "X" }))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("Primary accountant (FR-33)", () => {
  it("marks one accountant as Primary; the others are backup approvers", async () => {
    const a = await person(["accountant"]);
    const b = await person(["accountant"]);
    const backup = await person(["backup_approver"]);
    const versions = await settingVersions(db, ["primary_accountant_user_id"]);
    await run((tx) => setPrimaryAccountant(tx, admin, { userId: a.id, versions }));
    expect(await readSettings(db, ["primary_accountant_user_id"])).toEqual({
      primary_accountant_user_id: a.id,
    });
    const team = await accountantTeam(db);
    expect(team.map((m) => m.id)).toEqual(expect.arrayContaining([a.id, b.id, backup.id]));
    expect(team.find((m) => m.id === backup.id)?.accountant).toBe(false);

    // Only someone with the accountant role can be Primary.
    await expect(
      run(async (tx) =>
        setPrimaryAccountant(tx, admin, {
          userId: backup.id,
          versions: await settingVersions(tx, ["primary_accountant_user_id"]),
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    // A stale form conflicts.
    await expect(
      run((tx) => setPrimaryAccountant(tx, admin, { userId: b.id, versions })),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("clears the Primary when they lose the role or are deactivated", async () => {
    const a = await person(["accountant"]);
    const set = async (userId: string) =>
      run(async (tx) =>
        setPrimaryAccountant(tx, admin, {
          userId,
          versions: await settingVersions(tx, ["primary_accountant_user_id"]),
        }),
      );
    await set(a.id);
    await run((tx) =>
      setUserRoles(tx, admin, { userId: a.id, roles: ["requester"], version: a.version }),
    );
    expect(
      (await readSettings(db, ["primary_accountant_user_id"])).primary_accountant_user_id,
    ).toBe("");

    const b = await person(["accountant"]);
    await set(b.id);
    await run((tx) =>
      setUserActive(tx, admin, { userId: b.id, active: false, version: b.version }),
    );
    expect(
      (await readSettings(db, ["primary_accountant_user_id"])).primary_accountant_user_id,
    ).toBe("");
    expect(await events("admin.primary_accountant_cleared")).toHaveLength(2);

    const [row] = await db.select().from(users).where(eq(users.id, b.id));
    expect(row.active).toBe(false);
  });
});
