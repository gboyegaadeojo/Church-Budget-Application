import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { accountCopy } from "@/copy/account";
import { departments, userDepartments, userPreferences, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { ConflictError, parseInput, RuleError, ValidationError } from "@/domain/errors";
import { getChurchTimeZone } from "@/domain/settings";
import { writeAudit, type AuditActor } from "@/lib/audit";
import { assertCan, type Subject } from "@/lib/authz";
import type { Role } from "@/lib/roles";
import { zonedDate, zonedLocalToUtc } from "@/lib/time-zone";

/**
 * Away (FR-33 for approvers, FR-38 for a department's Primary). Dates are whole church-
 * local days: Away from the start of the first day until the start of the day back
 * (open-ended when no day back is given). While the Primary accountant is away,
 * accountant emails go to the backup approvers; while a department's Primary is away,
 * the Backups get the Primary's reminders. Setting and clearing Away are audited.
 */

const e = accountCopy.errors;
export type AwayWindow = { from: Date | null; until: Date | null };

/** Away right now: started, and not back yet. */
export function isAwayAt(w: AwayWindow | null | undefined, now: Date = new Date()): boolean {
  if (!w?.from) return false;
  return w.from.getTime() <= now.getTime() && (!w.until || now.getTime() < w.until.getTime());
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The form's days as a window: from today if none is given; the day back is optional. */
async function windowFrom(
  tx: Tx,
  input: { from?: unknown; until?: unknown },
  now: Date,
): Promise<{ from: Date; until: Date | null }> {
  const zone = await getChurchTimeZone(tx);
  const today = zonedDate(now, zone);
  const fromDay = typeof input.from === "string" && input.from.trim() ? input.from.trim() : today;
  if (!day.safeParse(fromDay).success) throw new ValidationError({ from: e.fromInvalid });
  const from = zonedLocalToUtc(`${fromDay}T00:00`, zone);
  if (!from) throw new ValidationError({ from: e.fromInvalid });
  const untilDay = typeof input.until === "string" ? input.until.trim() : "";
  if (!untilDay) return { from, until: null };
  if (!day.safeParse(untilDay).success) throw new ValidationError({ until: e.untilInvalid });
  const until = zonedLocalToUtc(`${untilDay}T00:00`, zone);
  if (!until) throw new ValidationError({ until: e.untilInvalid });
  if (until.getTime() <= from.getTime()) throw new ValidationError({ until: e.untilAfterFrom });
  if (until.getTime() <= now.getTime()) throw new ValidationError({ until: e.untilPast });
  return { from, until };
}

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const userActor = (actor: Subject, actingRole: Role): AuditActor => ({
  kind: "user",
  userId: actor.id,
  actingRole,
});

// ---------------------------------------------------------------- approvers (FR-33)

export type MyAway = AwayWindow & { version: number; active: boolean };

export async function getMyAway(tx: Tx, userId: string, now = new Date()): Promise<MyAway> {
  const [row] = await tx.select().from(userPreferences).where(eq(userPreferences.userId, userId));
  const w = { from: row?.awayFrom ?? null, until: row?.awayUntil ?? null };
  return { ...w, version: row?.version ?? 0, active: isAwayAt(w, now) };
}

/** Saves the window, checking the version the form was shown with (0: no row yet). */
async function saveWindow(tx: Tx, userId: string, version: number, w: AwayWindow) {
  if (version === 0) {
    const inserted = await tx
      .insert(userPreferences)
      .values({ userId, awayFrom: w.from, awayUntil: w.until })
      .onConflictDoNothing()
      .returning({ userId: userPreferences.userId });
    if (inserted.length === 0) throw new ConflictError({ type: "user_preferences", id: userId });
    return;
  }
  const updated = await tx
    .update(userPreferences)
    .set({
      awayFrom: w.from,
      awayUntil: w.until,
      version: sql`${userPreferences.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.version, version)))
    .returning({ userId: userPreferences.userId });
  if (updated.length === 0) throw new ConflictError({ type: "user_preferences", id: userId });
}

const versionSchema = z.coerce.number().int().min(0);

export async function setMyAway(
  tx: Tx,
  actor: Subject,
  input: { from?: unknown; until?: unknown; version: unknown },
  { now = new Date() }: { now?: Date } = {},
): Promise<void> {
  const { actingRole } = assertCan(actor, "account.away");
  const { version } = parseInput(z.object({ version: versionSchema }), input);
  const before = await getMyAway(tx, actor.id, now);
  const w = await windowFrom(tx, input, now);
  await saveWindow(tx, actor.id, version, w);
  await writeAudit(tx, {
    actor: userActor(actor, actingRole),
    area: "admin",
    eventType: "user.away_set",
    entity: { type: "user", id: actor.id },
    details: {
      before: { awayFrom: iso(before.from), awayUntil: iso(before.until) },
      after: { awayFrom: iso(w.from), awayUntil: iso(w.until) },
    },
  });
}

export async function clearMyAway(
  tx: Tx,
  actor: Subject,
  input: { version: unknown },
): Promise<void> {
  const { actingRole } = assertCan(actor, "account.away");
  const { version } = parseInput(z.object({ version: versionSchema }), input);
  const before = await getMyAway(tx, actor.id);
  if (!before.from) return;
  await saveWindow(tx, actor.id, version, { from: null, until: null });
  await writeAudit(tx, {
    actor: userActor(actor, actingRole),
    area: "admin",
    eventType: "user.away_cleared",
    entity: { type: "user", id: actor.id },
    details: { before: { awayFrom: iso(before.from), awayUntil: iso(before.until) } },
  });
}

/** Of these people, who is away right now. */
export async function awayNow(tx: Tx, userIds: string[], now = new Date()): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await tx
    .select()
    .from(userPreferences)
    .where(inArray(userPreferences.userId, userIds));
  return new Set(
    rows
      .filter((r) => isAwayAt({ from: r.awayFrom, until: r.awayUntil }, now))
      .map((r) => r.userId),
  );
}

// ---------------------------------------------------------------- a department's Primary (FR-38)

export type DepartmentCover = {
  primary: { userId: string; name: string } | null;
  window: AwayWindow;
  away: boolean;
  backups: { userId: string; name: string }[];
};

/** Who leads the department, whether the Primary is away, and the Backups who cover. */
export async function departmentCover(
  tx: Tx,
  departmentId: string,
  now = new Date(),
): Promise<DepartmentCover> {
  const rows = await tx
    .select({
      userId: users.id,
      name: users.displayName,
      type: userDepartments.representativeType,
      rank: userDepartments.backupRank,
      awayFrom: userDepartments.awayFrom,
      awayUntil: userDepartments.awayUntil,
    })
    .from(userDepartments)
    .innerJoin(users, eq(users.id, userDepartments.userId))
    .where(
      and(
        eq(userDepartments.departmentId, departmentId),
        eq(users.active, true),
        eq(users.accessStatus, "active"),
      ),
    );
  const primary = rows.find((r) => r.type === "primary") ?? null;
  const window = { from: primary?.awayFrom ?? null, until: primary?.awayUntil ?? null };
  return {
    primary: primary ? { userId: primary.userId, name: primary.name } : null,
    window,
    away: isAwayAt(window, now),
    backups: rows
      .filter((r) => r.type === "backup")
      .sort((a, b) => (a.rank ?? 9) - (b.rank ?? 9))
      .map((r) => ({ userId: r.userId, name: r.name })),
  };
}

async function primaryRow(tx: Tx, departmentId: string) {
  const [row] = await tx
    .select()
    .from(userDepartments)
    .where(
      and(
        eq(userDepartments.departmentId, departmentId),
        eq(userDepartments.representativeType, "primary"),
      ),
    )
    .for("update");
  return row ?? null;
}

/** The Primary (or the administrator for them) sets the department's Primary Away. */
export async function setDepartmentAway(
  tx: Tx,
  actor: Subject,
  input: { departmentId: string; from?: unknown; until?: unknown },
  { now = new Date() }: { now?: Date } = {},
): Promise<void> {
  if (!z.uuid().safeParse(input.departmentId).success) throw new RuleError(e.notPrimary);
  const { actingRole } = assertCan(actor, "department.away", { departmentId: input.departmentId });
  const row = await primaryRow(tx, input.departmentId);
  if (!row) throw new RuleError(e.notPrimary);
  const cover = await departmentCover(tx, input.departmentId, now);
  if (cover.backups.length === 0) throw new RuleError(accountCopy.department.noBackup);
  const w = await windowFrom(tx, input, now);
  await tx
    .update(userDepartments)
    .set({
      awayFrom: w.from,
      awayUntil: w.until,
      version: sql`${userDepartments.version} + 1`,
    })
    .where(eq(userDepartments.id, row.id));
  const [department] = await tx
    .select({ name: departments.name })
    .from(departments)
    .where(eq(departments.id, input.departmentId));
  await writeAudit(tx, {
    actor: userActor(actor, actingRole),
    area: "admin",
    eventType: "department.away_set",
    entity: { type: "department", id: input.departmentId },
    departmentId: input.departmentId,
    details: {
      department: department?.name,
      primaryUserId: row.userId,
      before: { awayFrom: iso(row.awayFrom), awayUntil: iso(row.awayUntil) },
      after: { awayFrom: iso(w.from), awayUntil: iso(w.until) },
    },
  });
}

export async function clearDepartmentAway(
  tx: Tx,
  actor: Subject,
  input: { departmentId: string },
): Promise<void> {
  if (!z.uuid().safeParse(input.departmentId).success) throw new RuleError(e.notPrimary);
  const { actingRole } = assertCan(actor, "department.away", { departmentId: input.departmentId });
  const row = await primaryRow(tx, input.departmentId);
  if (!row?.awayFrom) return;
  await tx
    .update(userDepartments)
    .set({
      awayFrom: null,
      awayUntil: null,
      version: sql`${userDepartments.version} + 1`,
    })
    .where(eq(userDepartments.id, row.id));
  await writeAudit(tx, {
    actor: userActor(actor, actingRole),
    area: "admin",
    eventType: "department.away_cleared",
    entity: { type: "department", id: input.departmentId },
    departmentId: input.departmentId,
    details: {
      primaryUserId: row.userId,
      before: { awayFrom: iso(row.awayFrom), awayUntil: iso(row.awayUntil) },
    },
  });
}
