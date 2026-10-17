import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expensePayments, signingAuthorities, spendingEntries } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import { RuleError, ValidationError } from "@/domain/errors";
import { boardDecide } from "@/domain/expenses/board";
import { budgetFigures } from "@/domain/expenses/budget";
import { recordPayment, signerOptions, startProcessing } from "@/domain/expenses/payment";
import { readyQueue } from "@/domain/expenses/payment-queries";
import { accountantDecide } from "@/domain/expenses/review";
import { loadExpense } from "@/domain/expenses/service";
import { ForbiddenError } from "@/lib/authz";
import { createTestDb, type TestDb } from "./helpers/db";
import { CLAIM, expenseWorld, PURCHASE, submitted, type ExpenseWorld } from "./helpers/expenses";

/** Processing and payment (6B.5, AC-76, AC-77, AC-134, AC-135). */

let t: TestDb;
let db: Db;
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
const NOW = new Date("2026-11-02T18:00:00Z");

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t?.close();
});

/** Submitted, approved by the accountant and the Board Chair. */
async function approved(
  world: ExpenseWorld,
  type: "purchase_request" | "expense_claim",
  content?: Parameters<typeof submitted>[3],
) {
  const { expenseId } = await submitted(db, world, type, content);
  for (const [actor, decide] of [
    [world.accountant, accountantDecide],
    [world.chair, boardDecide],
  ] as const) {
    const row = await loadExpense(db, expenseId);
    await run((tx) =>
      decide(tx, actor, {
        id: expenseId,
        version: row.version,
        idempotencyKey: randomUUID(),
        decision: { kind: "approve" },
      }),
    );
  }
  return expenseId;
}

async function pay(
  actor: Parameters<typeof recordPayment>[1],
  id: string,
  payment: Record<string, unknown>,
) {
  const row = await loadExpense(db, id);
  return run((tx) =>
    recordPayment(
      tx,
      actor,
      { id, version: row.version, idempotencyKey: randomUUID(), payment },
      { now: NOW },
    ),
  );
}

const E_TRANSFER = {
  method: "e_transfer",
  paidOn: "2026-11-02",
  amount: "168.00",
  reference: "CA8x9",
};

describe("Ready to process (AC-77)", () => {
  it("lists approved expenses the office processes, not ones the requester buys", async () => {
    const world = await expenseWorld(db);
    const claim = await approved(world, "expense_claim");
    const selfBought = await approved(world, "purchase_request", {
      ...PURCHASE,
      howBought: "requester_claims",
    });
    const queue = await readyQueue(db, world.office, {}, NOW);
    const ids = queue!.rows.map((r) => r.id);
    expect(ids).toContain(claim);
    expect(ids).not.toContain(selfBought);
    expect(await readyQueue(db, world.requester)).toBeNull();
    await expect(
      (async () => {
        const row = await loadExpense(db, selfBought);
        return run((tx) =>
          startProcessing(tx, world.office, {
            id: selfBought,
            version: row.version,
            idempotencyKey: randomUUID(),
          }),
        );
      })(),
    ).rejects.toThrow(RuleError);
  });

  it("starts processing", async () => {
    const world = await expenseWorld(db);
    const id = await approved(world, "expense_claim");
    const row = await loadExpense(db, id);
    await run((tx) =>
      startProcessing(tx, world.office, { id, version: row.version, idempotencyKey: randomUUID() }),
    );
    expect((await loadExpense(db, id)).status).toBe("processing");
  });
});

describe("Record payment (AC-76)", () => {
  it("records an e-transfer for a claim: Paid, and the ledger shows the method", async () => {
    const world = await expenseWorld(db);
    const id = await approved(world, "expense_claim");
    const result = await pay(world.office, id, E_TRANSFER);
    expect(result.status).toBe("paid");
    const [entry] = await db
      .select()
      .from(spendingEntries)
      .where(eq(spendingEntries.expenseSubmissionId, id));
    expect(entry).toMatchObject({
      paymentMethod: "e_transfer",
      amountCents: 16_800,
      referenceNumber: "CA8x9",
    });
  });

  it("requires each method's fields", async () => {
    const world = await expenseWorld(db);
    const id = await approved(world, "expense_claim");
    const base = { paidOn: "2026-11-02", amount: "168.00" };
    for (const [payment, field] of [
      [{ ...base, method: "cheque" }, "reference"],
      [{ ...base, method: "church_card", reference: "T1", purchasedBy: "Sam" }, "cardLast4"],
      [{ ...base, method: "church_card", cardLast4: "1234", reference: "T1" }, "purchasedBy"],
      [{ ...base, method: "cash" }, "cashReceivedBy"],
      [{ ...base, method: "e_transfer" }, "reference"],
      [{ ...base, method: "supplier_eft", reference: "INV-1" }, "purchasedBy"],
      [{ ...base, method: "other" }, "methodOther"],
    ] as const) {
      await expect(pay(world.office, id, payment)).rejects.toMatchObject({
        fieldErrors: { [field]: expect.any(String) },
      });
    }
  });

  it("needs a note when the amount differs, and uses the amount paid", async () => {
    const world = await expenseWorld(db);
    const id = await approved(world, "expense_claim");
    await expect(pay(world.office, id, { ...E_TRANSFER, amount: "160.00" })).rejects.toThrow(
      ValidationError,
    );
    await pay(world.office, id, {
      ...E_TRANSFER,
      amount: "160.00",
      differenceNote: "Tape was on sale.",
    });
    expect((await budgetFigures(db, world.cycle.id, world.media.id)).spent).toBe(16_000);
  });

  it("refuses a date in the future", async () => {
    const world = await expenseWorld(db);
    const id = await approved(world, "expense_claim");
    await expect(
      pay(world.office, id, { ...E_TRANSFER, paidOn: "2026-12-01" }),
    ).rejects.toMatchObject({
      fieldErrors: { paidOn: expect.any(String) },
    });
  });

  it("closes a church-card claim: nothing was owed", async () => {
    const world = await expenseWorld(db);
    const id = await approved(world, "expense_claim", { ...CLAIM, payeeKind: "church_card" });
    const result = await pay(world.office, id, {
      method: "church_card",
      paidOn: "2026-11-02",
      amount: "168.00",
      cardLast4: "4242",
      reference: "TX-77",
      purchasedBy: "Sam Lee",
    });
    expect(result.status).toBe("closed");
    const [payment] = await db
      .select()
      .from(expensePayments)
      .where(eq(expensePayments.expenseSubmissionId, id));
    expect(payment).toMatchObject({
      reference: "Card ending 4242 · TX-77",
      purchasedBy: "Sam Lee",
    });
  });

  it("buys a purchase request on the church account: commitment becomes Spent", async () => {
    const world = await expenseWorld(db);
    const id = await approved(world, "purchase_request");
    expect((await budgetFigures(db, world.cycle.id, world.media.id)).committed).toBe(100_800);
    const result = await pay(world.office, id, {
      method: "supplier_eft",
      paidOn: "2026-11-02",
      amount: "1008.00",
      reference: "INV-5512",
      purchasedBy: "Long & McQuade",
    });
    expect(result.status).toBe("purchased");
    expect(await budgetFigures(db, world.cycle.id, world.media.id)).toMatchObject({
      committed: 0,
      spent: 100_800,
      remaining: 3_000_000 - 100_800,
    });
  });

  it("nobody records a payment to themselves", async () => {
    const world = await expenseWorld(db);
    const id = await approved(world, "expense_claim", {
      ...CLAIM,
      payeeKind: "other",
      payeeName: "Office",
      payeeEmail: world.office.email,
      paymentPreference: "e_transfer",
    });
    await expect(pay(world.office, id, E_TRANSFER)).rejects.toThrow(ForbiddenError);
  });
});

describe("cheques and signing authorities (AC-134, AC-135)", () => {
  it("blocks a cheque with fewer than two active signers, then records it with two", async () => {
    const world = await expenseWorld(db);
    const id = await approved(world, "expense_claim");
    const cheque = { method: "cheque", paidOn: "2026-11-02", amount: "168.00", reference: "1042" };
    const [a] = await db
      .insert(signingAuthorities)
      .values({
        name: "Ann Signer",
        activeFrom: "2026-01-01",
        createdByUserId: world.accountant.id,
      })
      .returning();
    await expect(
      pay(world.office, id, { ...cheque, chequeSigner1Id: a.id, chequeSigner2Id: randomUUID() }),
    ).rejects.toThrow(RuleError);

    const [b] = await db
      .insert(signingAuthorities)
      .values({
        name: "Ben Signer",
        activeFrom: "2026-01-01",
        createdByUserId: world.accountant.id,
      })
      .returning();
    const [gone] = await db
      .insert(signingAuthorities)
      .values({
        name: "Cy Former",
        activeFrom: "2026-01-01",
        activeUntil: "2026-06-01",
        removedReason: "Left the board",
        createdByUserId: world.accountant.id,
      })
      .returning();
    // A removed signer isn't offered (AC-134) and isn't accepted.
    expect((await signerOptions(db, "2026-11-02")).map((s) => s.name)).toEqual(
      expect.not.arrayContaining(["Cy Former"]),
    );
    await expect(
      pay(world.office, id, { ...cheque, chequeSigner1Id: a.id, chequeSigner2Id: gone.id }),
    ).rejects.toThrow(ValidationError);
    await expect(
      pay(world.office, id, { ...cheque, chequeSigner1Id: a.id, chequeSigner2Id: a.id }),
    ).rejects.toMatchObject({ fieldErrors: { chequeSigner2Id: expect.any(String) } });

    await pay(world.office, id, { ...cheque, chequeSigner1Id: a.id, chequeSigner2Id: b.id });
    const [payment] = await db
      .select()
      .from(expensePayments)
      .where(eq(expensePayments.expenseSubmissionId, id));
    expect(payment).toMatchObject({
      chequeSigner1Name: "Ann Signer",
      chequeSigner2Name: "Ben Signer",
      reference: "1042",
    });
  });
});
