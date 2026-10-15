import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { adminCopy } from "@/copy/admin";
import { signingAuthorities } from "@/db/schema";
import type { Tx } from "@/db/types";
import { ConflictError, parseInput, RuleError, ValidationError } from "@/domain/errors";
import { getChurchTimeZone } from "@/domain/settings";
import { changedFields, writeAudit, type AuditActor } from "@/lib/audit";
import { assertCan, type Subject } from "@/lib/authz";
import type { Role } from "@/lib/roles";
import { zonedDate } from "@/lib/time-zone";

/**
 * Cheque signing authorities (FR-53, 9.18a), kept on Admin → Settings. A signer is
 * active on a date D when `active_from <= D` and (`active_until` is empty or
 * `D < active_until`): `active_until` is the first day they may no longer sign.
 * Signers are never deleted; Record payment (Stage 3) picks two from `activeSigners`.
 */

const s = adminCopy.settings.signers;

export type Signer = typeof signingAuthorities.$inferSelect;

const actorOf = (actor: Subject, actingRole: Role): AuditActor => ({
  kind: "user",
  userId: actor.id,
  actingRole,
});

const nameSchema = z.string().trim().min(1, s.errors.nameRequired).max(100, s.errors.nameTooLong);
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === "" || z.email().safeParse(v).success, s.errors.email)
  .transform((v) => (v === "" ? null : v));
const optionalDate = z
  .string()
  .trim()
  .refine((v) => v === "" || z.iso.date().safeParse(v).success, s.errors.date);
const versionSchema = z.coerce.number().int().positive();

async function loadSigner(tx: Tx, id: string): Promise<Signer> {
  const [row] = z.uuid().safeParse(id).success
    ? await tx.select().from(signingAuthorities).where(eq(signingAuthorities.id, id)).limit(1)
    : [];
  if (!row) throw new RuleError(adminCopy.common.notFound);
  return row;
}

async function updateSigner(
  tx: Tx,
  id: string,
  version: number,
  set: Partial<typeof signingAuthorities.$inferInsert>,
) {
  const rows = await tx
    .update(signingAuthorities)
    .set({ ...set, version: sql`${signingAuthorities.version} + 1`, updatedAt: new Date() })
    .where(and(eq(signingAuthorities.id, id), eq(signingAuthorities.version, version)))
    .returning({ id: signingAuthorities.id });
  if (rows.length === 0) throw new ConflictError({ type: "signing_authority", id });
}

export async function listSigners(tx: Tx): Promise<Signer[]> {
  return tx
    .select()
    .from(signingAuthorities)
    .orderBy(asc(signingAuthorities.name), asc(signingAuthorities.createdAt));
}

/** Signers who may sign on `onDate` ("2026-11-30"), for Record payment (AC-134). */
export async function activeSigners(tx: Tx, onDate: string): Promise<Signer[]> {
  return tx
    .select()
    .from(signingAuthorities)
    .where(
      and(
        lte(signingAuthorities.activeFrom, onDate),
        or(isNull(signingAuthorities.activeUntil), gt(signingAuthorities.activeUntil, onDate)),
      ),
    )
    .orderBy(asc(signingAuthorities.name));
}

/** Today in the church time zone, for defaults and the "fewer than two" warning. */
export async function churchToday(tx: Tx, now = new Date()): Promise<string> {
  return zonedDate(now, await getChurchTimeZone(tx));
}

export async function addSigner(
  tx: Tx,
  actor: Subject,
  input: { name: string; email?: string; activeFrom?: string },
  options: { now?: Date } = {},
): Promise<Signer> {
  const { actingRole } = assertCan(actor, "admin.settings");
  const data = parseInput(
    z.object({ name: nameSchema, email: emailSchema, activeFrom: optionalDate }),
    { name: input.name ?? "", email: input.email ?? "", activeFrom: input.activeFrom ?? "" },
  );
  const activeFrom = data.activeFrom || (await churchToday(tx, options.now));
  const [row] = await tx
    .insert(signingAuthorities)
    .values({ name: data.name, email: data.email, activeFrom, createdByUserId: actor.id })
    .returning();
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "admin",
    eventType: "admin.signer_added",
    entity: { type: "signing_authority", id: row.id },
    details: { after: { name: row.name, email: row.email, activeFrom } },
  });
  return row;
}

/** Fixes a name or email. Payments keep the name as it was when they were recorded. */
export async function editSigner(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown; name: string; email?: string },
): Promise<void> {
  const { actingRole } = assertCan(actor, "admin.settings");
  const data = parseInput(
    z.object({ name: nameSchema, email: emailSchema, version: versionSchema }),
    { name: input.name ?? "", email: input.email ?? "", version: input.version },
  );
  const signer = await loadSigner(tx, input.id);
  const changes = changedFields(
    { name: signer.name, email: signer.email },
    { name: data.name, email: data.email },
  );
  if (!changes) return;
  await updateSigner(tx, signer.id, data.version, { name: data.name, email: data.email });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "admin",
    eventType: "admin.signer_edited",
    entity: { type: "signing_authority", id: signer.id },
    details: changes,
  });
}

/** Marks a signer inactive from a date (default today); they stay on past payments. */
export async function removeSigner(
  tx: Tx,
  actor: Subject,
  input: { id: string; version: unknown; removeFrom?: string; reason?: string },
  options: { now?: Date } = {},
): Promise<void> {
  const { actingRole } = assertCan(actor, "admin.settings");
  const data = parseInput(
    z.object({
      version: versionSchema,
      removeFrom: optionalDate,
      reason: z.string().trim().max(500),
    }),
    { version: input.version, removeFrom: input.removeFrom ?? "", reason: input.reason ?? "" },
  );
  const signer = await loadSigner(tx, input.id);
  if (signer.activeUntil !== null) throw new RuleError(s.errors.alreadyRemoved);
  const removeFrom = data.removeFrom || (await churchToday(tx, options.now));
  if (removeFrom < signer.activeFrom) {
    throw new ValidationError({ removeFrom: s.errors.removeBeforeStart });
  }
  await updateSigner(tx, signer.id, data.version, {
    activeUntil: removeFrom,
    removedReason: data.reason || null,
  });
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "admin",
    eventType: "admin.signer_removed",
    entity: { type: "signing_authority", id: signer.id },
    reason: data.reason || undefined,
    details: { person: { name: signer.name }, after: { activeUntil: removeFrom } },
  });
}
