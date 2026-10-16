import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { adminCopy } from "@/copy/admin";
import { appSettings, userRoles, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { ConflictError, parseInput, RuleError, ValidationError } from "@/domain/errors";
import { checkLeader, type LeaderCheck } from "@/domain/users/leader-check";
import { changedFields, writeAudit, type AuditActor } from "@/lib/audit";
import { assertCan, type Subject } from "@/lib/authz";
import { formatTaxRate, percentToTaxRate } from "@/lib/money";
import type { PcoPerson, PlanningCenterDirectory } from "@/lib/pco";
import { isValidTimeZone } from "@/lib/time-zone";
import { DEPARTMENT_FIELD_MODES, readSettings, SETTING_DEFAULTS, type SettingKey } from "./index";
import { emailPrimaryAccountantCleared } from "@/domain/users/emails";

/**
 * Admin → Settings: sales tax rate (FR-07a), church time zone, and sign-in and
 * Planning Center (FR-01a). Every change is audited with old and new values. Each
 * setting row has its own version, so two administrators can't silently overwrite
 * each other (DRD 11.2).
 */

const s = adminCopy.settings;

/** The version of each setting row, as the form read them. Missing rows count as 0. */
export async function settingVersions<K extends SettingKey>(
  tx: Tx,
  keys: readonly K[],
): Promise<Record<K, number>> {
  const rows = await tx
    .select({ key: appSettings.key, version: appSettings.version })
    .from(appSettings)
    .where(inArray(appSettings.key, [...keys]));
  const found = new Map(rows.map((r) => [r.key, r.version]));
  return Object.fromEntries(keys.map((k) => [k, found.get(k) ?? 0])) as Record<K, number>;
}

/** Writes the settings that changed, refusing if any was changed since it was read. */
async function writeSettings(
  tx: Tx,
  actor: Subject,
  values: Partial<Record<SettingKey, string>>,
  versions: Record<string, unknown>,
  eventType: string,
): Promise<boolean> {
  const { actingRole } = assertCan(actor, "admin.settings");
  const keys = Object.keys(values) as SettingKey[];
  const before = await readSettings(tx, keys);
  const changes = changedFields(before as Record<string, string>, values);
  if (!changes) return false;

  for (const key of Object.keys(changes.after) as SettingKey[]) {
    const expected = Number(versions[key] ?? 0);
    const value = values[key]!;
    if (expected === 0) {
      const inserted = await tx
        .insert(appSettings)
        .values({ key, value, updatedByUserId: actor.id })
        .onConflictDoNothing()
        .returning({ key: appSettings.key });
      if (inserted.length === 0) throw new ConflictError({ type: "setting", id: key });
      continue;
    }
    const rows = await tx
      .update(appSettings)
      .set({
        value,
        updatedByUserId: actor.id,
        updatedAt: new Date(),
        version: sql`${appSettings.version} + 1`,
      })
      .where(and(eq(appSettings.key, key), eq(appSettings.version, expected)))
      .returning({ key: appSettings.key });
    if (rows.length === 0) throw new ConflictError({ type: "setting", id: key });
  }

  await writeAudit(tx, {
    actor: { kind: "user", userId: actor.id, actingRole },
    area: "admin",
    eventType,
    entity: { type: "setting", id: Object.keys(changes.after).join(",") },
    details: changes,
  });
  return true;
}

// ---------------------------------------------------------------- sales tax (FR-07a)

export async function updateTaxRate(
  tx: Tx,
  actor: Subject,
  input: { percent: string; versions: Record<string, unknown> },
): Promise<{ rate: string } | null> {
  assertCan(actor, "admin.settings");
  const rate = percentToTaxRate(input.percent ?? "");
  if (!rate) throw new ValidationError({ percent: s.errors.taxRate });
  const changed = await writeSettings(
    tx,
    actor,
    { sales_tax_rate: rate },
    input.versions,
    "admin.tax_rate_changed",
  );
  return changed ? { rate: formatTaxRate(rate) } : null;
}

// ---------------------------------------------------------------- time zone

export async function updateTimeZone(
  tx: Tx,
  actor: Subject,
  input: { timeZone: string; versions: Record<string, unknown> },
): Promise<void> {
  assertCan(actor, "admin.settings");
  const zone = (input.timeZone ?? "").trim();
  if (!isValidTimeZone(zone)) throw new ValidationError({ timeZone: s.errors.timeZone });
  await writeSettings(
    tx,
    actor,
    { church_timezone: zone },
    input.versions,
    "admin.settings_changed",
  );
}

// ---------------------------------------------------------------- sign-in and Planning Center (FR-01a)

const lines = (text: string) => [
  ...new Set(
    text
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean),
  ),
];

const signInSchema = z.object({
  adminContactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || z.email().safeParse(v).success, s.errors.email),
  fieldName: z.string().trim().min(1, s.errors.fieldName).max(100, s.errors.fieldName),
  acceptedValues: z
    .string()
    .transform(lines)
    .pipe(z.array(z.string().max(100)).min(1, s.errors.acceptedValues).max(20)),
  requireForRequesters: z.boolean(),
  requireForStaff: z.boolean(),
  departmentFieldName: z
    .string()
    .trim()
    .min(1, s.errors.departmentFieldName)
    .max(100, s.errors.departmentFieldName),
  departmentMode: z
    .string()
    .pipe(z.enum(DEPARTMENT_FIELD_MODES, { error: s.errors.departmentMode })),
  googleEnabled: z.boolean(),
  planningCenterEnabled: z.boolean(),
  emailEnabled: z.boolean(),
});

export type SignInSettingsInput = z.input<typeof signInSchema> & {
  versions: Record<string, unknown>;
};

export async function updateSignInSettings(
  tx: Tx,
  actor: Subject,
  input: SignInSettingsInput,
): Promise<void> {
  assertCan(actor, "admin.settings");
  const data = parseInput(signInSchema, input);
  if (!data.googleEnabled && !data.planningCenterEnabled && !data.emailEnabled) {
    throw new RuleError(s.errors.signInMethod);
  }
  const flag = (b: boolean) => (b ? "true" : "false");
  await writeSettings(
    tx,
    actor,
    {
      admin_contact_email: data.adminContactEmail,
      pco_leader_field_name: data.fieldName,
      pco_leader_accepted_values: JSON.stringify(data.acceptedValues),
      pco_require_for_requesters: flag(data.requireForRequesters),
      pco_require_for_staff: flag(data.requireForStaff),
      pco_department_field_name: data.departmentFieldName,
      pco_department_mode: data.departmentMode,
      signin_google_enabled: flag(data.googleEnabled),
      signin_planning_center_enabled: flag(data.planningCenterEnabled),
      signin_email_enabled: flag(data.emailEnabled),
    },
    input.versions,
    "admin.signin_settings_changed",
  );
}

// ---------------------------------------------------------------- Primary accountant (FR-33)

/** Marks one accountant as Primary; everyone else with an accountant role is a backup. */
export async function setPrimaryAccountant(
  tx: Tx,
  actor: Subject,
  input: { userId: string; versions: Record<string, unknown> },
): Promise<void> {
  assertCan(actor, "admin.settings");
  const userId = (input.userId ?? "").trim();
  const [person] = z.uuid().safeParse(userId).success
    ? await tx
        .select({ id: users.id, active: users.active, status: users.accessStatus })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .where(and(eq(users.id, userId), eq(userRoles.role, "accountant")))
        .limit(1)
    : [];
  if (!person || !person.active || person.status === "inactive") {
    throw new ValidationError({ userId: s.accountants.errors.notAccountant });
  }
  await writeSettings(
    tx,
    actor,
    { primary_accountant_user_id: userId },
    input.versions,
    "admin.primary_accountant_changed",
  );
}

/**
 * Clears the Primary accountant when that person loses the accountant role or is
 * deactivated, so emails never go to someone who can't act. Audited as automatic.
 */
export async function clearPrimaryAccountantIf(
  tx: Tx,
  userId: string,
  actor: AuditActor,
  why: string,
): Promise<void> {
  const { primary_accountant_user_id } = await readSettings(tx, ["primary_accountant_user_id"]);
  if (primary_accountant_user_id !== userId) return;
  await tx
    .update(appSettings)
    .set({ value: "", updatedAt: new Date(), version: sql`${appSettings.version} + 1` })
    .where(eq(appSettings.key, "primary_accountant_user_id"));
  await writeAudit(tx, {
    actor,
    area: "admin",
    eventType: "admin.primary_accountant_cleared",
    entity: { type: "setting", id: "primary_accountant_user_id" },
    reason: `Automatic: ${why}`,
    details: {
      before: { primary_accountant_user_id: userId },
      after: { primary_accountant_user_id: "" },
    },
  });
  await emailPrimaryAccountantCleared(tx, userId);
}

// ---------------------------------------------------------------- test a person

export type TestPersonResult = { person: PcoPerson; check: LeaderCheck };

/**
 * "Test a person" (FR-01a, AC-11): searches Planning Center and checks each match with
 * the field and values typed on the form, before they're saved. Audited, because it
 * looks up personal information.
 */
export async function testPerson(
  tx: Tx,
  actor: Subject,
  directory: PlanningCenterDirectory,
  input: { query: string; fieldName: string; acceptedValues: string },
): Promise<TestPersonResult[]> {
  const { actingRole } = assertCan(actor, "admin.settings");
  const query = (input.query ?? "").trim();
  if (query.length < 2) throw new ValidationError({ query: s.errors.query });
  const fieldName = (input.fieldName ?? "").trim() || SETTING_DEFAULTS.pco_leader_field_name;
  const acceptedValues = lines(input.acceptedValues ?? "");
  if (acceptedValues.length === 0)
    throw new ValidationError({ acceptedValues: s.errors.acceptedValues });

  const people = (await directory.searchPeople(query)).slice(0, 5);
  const results: TestPersonResult[] = [];
  for (const person of people) {
    results.push({
      person,
      check: await checkLeader(
        directory,
        { fieldName, acceptedValues },
        { pcoPersonId: person.id },
      ),
    });
  }
  await writeAudit(tx, {
    actor: { kind: "user", userId: actor.id, actingRole },
    area: "admin",
    eventType: "admin.pco_person_tested",
    entity: { type: "setting", id: "pco_leader_field_name" },
    details: {
      query,
      fieldName,
      acceptedValues,
      results: results.map((r) => ({ pcoPersonId: r.person.id, result: r.check.status })),
    },
  });
  return results;
}
