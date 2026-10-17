import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { expensesCopy } from "@/copy/expenses";
import { expenseReceiptFiles, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { actorOf } from "@/domain/annual/service";
import { parseInput, RuleError, ValidationError } from "@/domain/errors";
import { writeAudit } from "@/lib/audit";
import { authorize, type Subject } from "@/lib/authz";
import { hasRole } from "@/lib/roles";
import { auditBase, authzContextOf, canOn, loadExpense, type ExpenseRow } from "./service";
import { isExpenseEditable } from "./status";

/**
 * Receipt files on expense claims (6B.9): up to 5 per claim, 10 MB each, JPG, PNG or
 * PDF (HEIC photos are converted to JPG in the browser first). The browser uploads to
 * private storage through a signed link; the server then reads the file, checks its
 * real type from its first bytes and its size, and records it. Files are never deleted:
 * removing one marks it removed, and it's kept for the retention period.
 */

const e = expensesCopy.errors;
export const RECEIPT_LIMITS = { files: 5, bytes: 10 * 1024 * 1024, nameLength: 200 } as const;
export const RECEIPT_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;
export type ReceiptType = (typeof RECEIPT_TYPES)[number];
/** Minutes an upload link and its token stay valid. */
const UPLOAD_MINUTES = 15;

/** The file's real type from its first bytes, whatever its name or the browser said. */
export function sniffReceiptType(bytes: Uint8Array): ReceiptType | null {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  return null;
}

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(`receipt-upload\n${payload}`).digest("hex");
}

/** A token tying an upload link to one expense, one person and a time limit. */
export function uploadToken(key: string, expenseId: string, userId: string, expires: number) {
  return `${expires}.${sign(`${key}\n${expenseId}\n${userId}\n${expires}`)}`;
}

export function verifyUploadToken(
  token: string,
  key: string,
  expenseId: string,
  userId: string,
  now: Date = new Date(),
): boolean {
  const [expiresText, signature = ""] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires) || expires < now.getTime() / 1000) return false;
  if (!key.startsWith(`receipts/${expenseId}/`)) return false;
  const expected = Buffer.from(sign(`${key}\n${expenseId}\n${userId}\n${expires}`));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

async function activeFiles(tx: Tx, expenseId: string) {
  return tx
    .select()
    .from(expenseReceiptFiles)
    .where(
      and(
        eq(expenseReceiptFiles.expenseSubmissionId, expenseId),
        isNull(expenseReceiptFiles.removedAt),
      ),
    )
    .orderBy(asc(expenseReceiptFiles.uploadedAt));
}

/** The department may change a claim's receipts while it may change the claim (FR-44). */
function assertAttachable(actor: Subject, row: ExpenseRow) {
  const { actingRole } = canOn(actor, "expense.submit", row);
  if (row.type !== "expense_claim") throw new RuleError(e.receiptsClaimsOnly);
  if (!isExpenseEditable(row.status)) throw new RuleError(e.notEditable);
  return actingRole;
}

const prepareSchema = z.object({
  fileName: z.string().trim().min(1, e.receiptFileName).max(RECEIPT_LIMITS.nameLength),
  size: z.coerce
    .number()
    .int()
    .positive(e.receiptEmpty)
    .max(RECEIPT_LIMITS.bytes, e.receiptTooLarge),
  contentType: z.enum(RECEIPT_TYPES, { error: e.receiptType }),
});

export type PreparedUpload = { key: string; token: string };

/** Step 1 of an upload: checks what the browser says it will send, and names the file. */
export async function prepareReceiptUpload(
  tx: Tx,
  actor: Subject,
  input: { expenseId: string; fileName: unknown; size: unknown; contentType: unknown },
  now: Date = new Date(),
): Promise<PreparedUpload> {
  const row = await loadExpense(tx, input.expenseId);
  assertAttachable(actor, row);
  parseInput(prepareSchema, input);
  if ((await activeFiles(tx, row.id)).length >= RECEIPT_LIMITS.files) {
    throw new RuleError(e.receiptTooMany);
  }
  const key = `receipts/${row.id}/${randomUUID()}`;
  const expires = Math.floor(now.getTime() / 1000) + UPLOAD_MINUTES * 60;
  return { key, token: uploadToken(key, row.id, actor.id, expires) };
}

export type ReceiptFileView = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: Date;
  /** The same file is on another claim (FR-47 warning). */
  duplicateOf: string | null;
};

/**
 * Step 2: records an uploaded file after checking its bytes (AC-81). The caller reads
 * the bytes from storage and removes the file if this refuses it.
 */
export async function addReceipt(
  tx: Tx,
  actor: Subject,
  input: { expenseId: string; key: string; token: string; fileName: string; bytes: Uint8Array },
  now: Date = new Date(),
): Promise<{ id: string }> {
  const row = await loadExpense(tx, input.expenseId, true);
  const actingRole = assertAttachable(actor, row);
  if (!verifyUploadToken(input.token, input.key, row.id, actor.id, now)) {
    throw new RuleError(e.receiptUploadExpired);
  }
  const { fileName } = parseInput(prepareSchema.pick({ fileName: true }), {
    fileName: input.fileName,
  });
  if (input.bytes.byteLength === 0) throw new ValidationError({ receipts: e.receiptEmpty });
  if (input.bytes.byteLength > RECEIPT_LIMITS.bytes) {
    throw new ValidationError({ receipts: e.receiptTooLarge });
  }
  const contentType = sniffReceiptType(input.bytes);
  if (!contentType) throw new ValidationError({ receipts: e.receiptType });
  if ((await activeFiles(tx, row.id)).length >= RECEIPT_LIMITS.files) {
    throw new RuleError(e.receiptTooMany);
  }
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const [created] = await tx
    .insert(expenseReceiptFiles)
    .values({
      expenseSubmissionId: row.id,
      storageKey: input.key,
      fileName,
      contentType,
      sizeBytes: input.bytes.byteLength,
      sha256,
      uploadedByUserId: actor.id,
      uploadedAt: now,
    })
    .onConflictDoNothing({ target: expenseReceiptFiles.storageKey })
    .returning({ id: expenseReceiptFiles.id });
  // The same upload confirmed twice (a double click) is recorded once.
  if (!created) {
    const [existing] = await tx
      .select({ id: expenseReceiptFiles.id })
      .from(expenseReceiptFiles)
      .where(eq(expenseReceiptFiles.storageKey, input.key));
    return existing;
  }
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "expenses",
    eventType: "expenses.receipt_added",
    ...auditBase(row),
    details: { fileId: created.id, fileName, contentType, sizeBytes: input.bytes.byteLength },
  });
  return created;
}

/** Removes a receipt from the claim; the file itself is kept (constraint 6). */
export async function removeReceipt(
  tx: Tx,
  actor: Subject,
  input: { expenseId: string; fileId: string },
  now: Date = new Date(),
): Promise<void> {
  const row = await loadExpense(tx, input.expenseId, true);
  const actingRole = assertAttachable(actor, row);
  if (!z.uuid().safeParse(input.fileId).success) throw new RuleError(e.receiptNotFound);
  const [file] = await tx
    .update(expenseReceiptFiles)
    .set({ removedAt: now, removedByUserId: actor.id })
    .where(
      and(
        eq(expenseReceiptFiles.id, input.fileId),
        eq(expenseReceiptFiles.expenseSubmissionId, row.id),
        isNull(expenseReceiptFiles.removedAt),
      ),
    )
    .returning();
  if (!file) throw new RuleError(e.receiptNotFound);
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "expenses",
    eventType: "expenses.receipt_removed",
    ...auditBase(row),
    details: { fileId: file.id, fileName: file.fileName },
  });
}

/**
 * Who may see a claim's receipts (6B.9, AC-81): its department's representatives, the
 * approvers (the board once it reaches them), the Church Administrator and the System
 * Administrator. A draft's receipts stay with the department.
 */
export function canSeeReceipts(viewer: Subject, row: ExpenseRow): boolean {
  if (!authorize(viewer, "expense.view", authzContextOf(row)).allowed) return false;
  const represents = viewer.departments.some((d) => d.id === row.departmentId);
  const theirs = row.requesterUserId === viewer.id;
  return row.status !== "draft" || represents || theirs || hasRole(viewer, "system_admin");
}

/** The claim's current receipt files, for someone allowed to see them. */
export async function listReceipts(
  tx: Tx,
  viewer: Subject,
  expenseId: string,
): Promise<ReceiptFileView[]> {
  const row = await loadExpense(tx, expenseId).catch(() => null);
  if (!row || !canSeeReceipts(viewer, row)) return [];
  const rows = await tx
    .select({ file: expenseReceiptFiles, name: users.displayName })
    .from(expenseReceiptFiles)
    .innerJoin(users, eq(users.id, expenseReceiptFiles.uploadedByUserId))
    .where(
      and(
        eq(expenseReceiptFiles.expenseSubmissionId, expenseId),
        isNull(expenseReceiptFiles.removedAt),
      ),
    )
    .orderBy(asc(expenseReceiptFiles.uploadedAt));
  const out: ReceiptFileView[] = [];
  for (const { file, name } of rows) {
    const [other] = await tx
      .select({ expenseId: expenseReceiptFiles.expenseSubmissionId })
      .from(expenseReceiptFiles)
      .where(
        and(eq(expenseReceiptFiles.sha256, file.sha256), isNull(expenseReceiptFiles.removedAt)),
      )
      .limit(2)
      .then((r) => r.filter((x) => x.expenseId !== expenseId));
    out.push({
      id: file.id,
      fileName: file.fileName,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      uploadedBy: name,
      uploadedAt: file.uploadedAt,
      duplicateOf: other?.expenseId ?? null,
    });
  }
  return out;
}

/** One receipt for viewing, if the viewer may see it. */
export async function receiptForViewing(
  tx: Tx,
  viewer: Subject,
  input: { expenseId: string; fileId: string },
): Promise<{ storageKey: string; fileName: string; contentType: string } | null> {
  if (!z.uuid().safeParse(input.fileId).success) return null;
  const row = await loadExpense(tx, input.expenseId).catch(() => null);
  if (!row || !canSeeReceipts(viewer, row)) return null;
  const [file] = await tx
    .select()
    .from(expenseReceiptFiles)
    .where(
      and(
        eq(expenseReceiptFiles.id, input.fileId),
        eq(expenseReceiptFiles.expenseSubmissionId, row.id),
      ),
    );
  return file
    ? { storageKey: file.storageKey, fileName: file.fileName, contentType: file.contentType }
    : null;
}
