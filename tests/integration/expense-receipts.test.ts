import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditEvents, expenseReceiptFiles, expenseSubmissions } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { RuleError, ValidationError } from "@/domain/errors";
import {
  addReceipt,
  listReceipts,
  prepareReceiptUpload,
  receiptForViewing,
  removeReceipt,
  sniffReceiptType,
  uploadToken,
} from "@/domain/expenses/receipts";
import { startExpense } from "@/domain/expenses/service";
import { ForbiddenError } from "@/lib/authz";
import { createTestDb, type TestDb } from "./helpers/db";
import { expenseWorld, person, submitted, type ExpenseWorld } from "./helpers/expenses";

/** Receipts on expense claims (6B.9, AC-81). */

let t: TestDb;
let db: Db;
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const PDF = new TextEncoder().encode("%PDF-1.7 receipt");
const GIF = new TextEncoder().encode("GIF89a....");

beforeAll(async () => {
  process.env.AUTH_SECRET ??= "test-secret";
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t?.close();
});

async function claimDraft(world: ExpenseWorld) {
  const { expenseId } = await run((tx) =>
    startExpense(tx, world.requester, {
      type: "expense_claim",
      departmentId: world.media.id,
      cycleId: world.cycle.id,
    }),
  );
  return expenseId;
}

async function attach(world: ExpenseWorld, expenseId: string, bytes: Uint8Array, name = "r.jpg") {
  const prepared = await run((tx) =>
    prepareReceiptUpload(tx, world.requester, {
      expenseId,
      fileName: name,
      size: bytes.byteLength,
      contentType: "image/jpeg",
    }),
  );
  return run((tx) =>
    addReceipt(tx, world.requester, { expenseId, ...prepared, fileName: name, bytes }),
  );
}

describe("file checks", () => {
  it("knows JPG, PNG and PDF by their first bytes, and nothing else", () => {
    expect(sniffReceiptType(JPEG)).toBe("image/jpeg");
    expect(sniffReceiptType(PNG)).toBe("image/png");
    expect(sniffReceiptType(PDF)).toBe("application/pdf");
    expect(sniffReceiptType(GIF)).toBeNull();
  });
});

describe("adding receipts (AC-81)", () => {
  it("records a checked file with its real type, audited", async () => {
    const world = await expenseWorld(db);
    const expenseId = await claimDraft(world);
    const { id } = await attach(world, expenseId, PDF, "receipt.jpg");
    const [file] = await db
      .select()
      .from(expenseReceiptFiles)
      .where(eq(expenseReceiptFiles.id, id));
    expect(file).toMatchObject({ contentType: "application/pdf", sizeBytes: PDF.byteLength });
    const events = await db
      .select({ type: auditEvents.eventType })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, expenseId));
    expect(events.map((e) => e.type)).toContain("expenses.receipt_added");
  });

  it("refuses other file types, whatever the browser said", async () => {
    const world = await expenseWorld(db);
    const expenseId = await claimDraft(world);
    await expect(attach(world, expenseId, GIF)).rejects.toThrow(ValidationError);
  });

  it("refuses files over 10 MB, before and after upload", async () => {
    const world = await expenseWorld(db);
    const expenseId = await claimDraft(world);
    await expect(
      run((tx) =>
        prepareReceiptUpload(tx, world.requester, {
          expenseId,
          fileName: "big.jpg",
          size: 10 * 1024 * 1024 + 1,
          contentType: "image/jpeg",
        }),
      ),
    ).rejects.toThrow(ValidationError);
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(JPEG);
    await expect(attach(world, expenseId, big)).rejects.toThrow(ValidationError);
  });

  it("allows up to 5 files", async () => {
    const world = await expenseWorld(db);
    const expenseId = await claimDraft(world);
    for (let i = 0; i < 5; i++) await attach(world, expenseId, JPEG, `r${i}.jpg`);
    await expect(attach(world, expenseId, JPEG)).rejects.toThrow(RuleError);
  });

  it("refuses a forged or expired upload token", async () => {
    const world = await expenseWorld(db);
    const expenseId = await claimDraft(world);
    const key = `receipts/${expenseId}/forged`;
    await expect(
      run((tx) =>
        addReceipt(tx, world.requester, {
          expenseId,
          key,
          token: uploadToken(key, expenseId, world.requester.id, 1),
          fileName: "r.jpg",
          bytes: JPEG,
        }),
      ),
    ).rejects.toThrow(RuleError);
  });

  it("only on claims, and only by the department", async () => {
    const world = await expenseWorld(db);
    const expenseId = await claimDraft(world);
    const stranger = await person(db, ["requester"]);
    await expect(
      run((tx) =>
        prepareReceiptUpload(tx, stranger, {
          expenseId,
          fileName: "r.jpg",
          size: 10,
          contentType: "image/jpeg",
        }),
      ),
    ).rejects.toThrow(ForbiddenError);
    const { expenseId: purchase } = await run((tx) =>
      startExpense(tx, world.requester, {
        type: "purchase_request",
        departmentId: world.media.id,
        cycleId: world.cycle.id,
      }),
    );
    await expect(
      run((tx) =>
        prepareReceiptUpload(tx, world.requester, {
          expenseId: purchase,
          fileName: "r.jpg",
          size: 10,
          contentType: "image/jpeg",
        }),
      ),
    ).rejects.toThrow(RuleError);
  });

  it("counts a receipt for submission instead of a no-receipt reason", async () => {
    const world = await expenseWorld(db);
    const result = await submitted(db, world, "expense_claim", {
      title: "Cables",
      justification: "Needed.",
      lines: [{ date: "2026-10-10", vendor: "Staples", description: "Tape", amount: "5.00" }],
      payeeKind: "church_card",
    }).catch((e: unknown) => e);
    expect(result).toBeInstanceOf(ValidationError);
  });
});

describe("removing and seeing receipts", () => {
  it("removes a file from the claim but keeps it", async () => {
    const world = await expenseWorld(db);
    const expenseId = await claimDraft(world);
    const { id } = await attach(world, expenseId, JPEG);
    await run((tx) => removeReceipt(tx, world.requester, { expenseId, fileId: id }));
    expect(await listReceipts(db, world.requester, expenseId)).toEqual([]);
    const [kept] = await db
      .select()
      .from(expenseReceiptFiles)
      .where(eq(expenseReceiptFiles.id, id));
    expect(kept.removedAt).not.toBeNull();
  });

  it("AC-81: only the department, approvers and the office see them", async () => {
    const world = await expenseWorld(db);
    const expenseId = await claimDraft(world);
    const { id } = await attach(world, expenseId, JPEG);
    const stranger = await person(db, ["requester"]);
    const admin = await person(db, ["system_admin"]);
    const see = (who: Parameters<typeof receiptForViewing>[1]) =>
      receiptForViewing(db, who, { expenseId, fileId: id });

    // A draft's receipts stay with the department (and the System Administrator).
    expect(await see(world.requester)).not.toBeNull();
    expect(await see(world.accountant)).toBeNull();
    expect(await see(admin)).not.toBeNull();

    await db
      .update(expenseSubmissions)
      .set({
        status: "submitted",
        referenceNumber: `EXP-${world.cycle.budgetYear}-9999`,
        totalCents: 500,
        subtotalCents: 500,
        taxCents: 0,
        submittedAt: new Date(),
      })
      .where(eq(expenseSubmissions.id, expenseId));
    expect(await see(world.accountant)).not.toBeNull();
    expect(await see(world.office)).not.toBeNull();
    // The Board Chair is asked at submission, alongside the accountant (AC-142).
    expect(await see(world.chair)).not.toBeNull();
    expect(await see(stranger)).toBeNull();

    await db
      .update(expenseSubmissions)
      .set({ status: "awaiting_board" })
      .where(eq(expenseSubmissions.id, expenseId));
    expect(await see(world.chair)).not.toBeNull();
  });
});
