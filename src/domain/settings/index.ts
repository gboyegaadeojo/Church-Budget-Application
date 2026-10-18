import { inArray } from "drizzle-orm";
import { appSettings } from "@/db/schema";
import type { Tx } from "@/db/types";
import { CHURCH_TIME_ZONE_DEFAULT, fallbackTimeZone, isValidTimeZone } from "@/lib/time-zone";

/**
 * Application settings (Requirements 9.6). Rows live in `app_settings` and the
 * administrator changes them in Admin → Settings (step 4). These defaults are seeded
 * by migration and also used when a row is missing, so behaviour never depends on seed order.
 */
export const SETTING_DEFAULTS = {
  sales_tax_rate: "0.1200",
  near_limit_threshold: "0.80",
  backup_escalation_days: "3",
  weekly_audit_summary: "false",
  church_name: "Immanuel Fellowship Church",
  app_name: "Church Budget",
  /** FR-30: the accent colour as a checked hex; empty means the DRD default. */
  accent_color: "",
  /** FR-30: the current brand_assets rows; empty means none (the default mark). */
  logo_asset_id: "",
  icon_asset_id: "",
  /** IANA zone for showing and scheduling times (CLAUDE.md "Time zone"). */
  church_timezone: CHURCH_TIME_ZONE_DEFAULT,
  /** FR-01a: the People custom field that marks a Group Leader, and the values that count. */
  pco_leader_field_name: "Ministry Leader",
  pco_leader_accepted_values: JSON.stringify(["Yes"]),
  pco_require_for_requesters: "true",
  pco_require_for_staff: "false",
  /**
   * The People custom field naming each leader's ministry, matched to departments, and
   * what it does: off, suggest (join matched departments) or restrict (only those).
   */
  pco_department_field_name: "Ministry Department",
  pco_department_mode: "suggest",
  signin_planning_center_enabled: "true",
  /** FR-01b: "Continue with email" (a 6-digit code emailed to an address on the allowlist). */
  signin_email_enabled: "true",
  /** Shown on access-denied screens as who to contact (DRD 6.1a). */
  admin_contact_email: "",
  /** FR-33: who gets the accountant emails; other accountant-role holders are backups. */
  primary_accountant_user_id: "",
  /**
   * FR-34: approvals at or above this approved total (incl. tax, in cents) need a second
   * accountant's sign-off. Empty: off (the default).
   */
  second_approval_threshold: "",
  /** FR-46: a claim this many days after the purchase needs an explanation. */
  claim_deadline_days: "90",
  /** FR-49 reminders: an approved purchase request not bought or claimed (requester). */
  unclaimed_purchase_reminder_days: "60",
  /** FR-49 reminders: approved but not processed (accountant, Church Administrator). */
  payment_reminder_days: "14",
  /** FR-49 reminders: an approval still needed after this many days, then daily. */
  approval_reminder_days: "5",
  /** Reminder texts sent per calendar month before the rest are held back (cost guard). */
  sms_monthly_limit: "300",
} as const;

/** A whole-number-of-days setting, or its default when the stored value is unusable. */
export async function daysSetting(
  tx: Tx,
  key:
    | "claim_deadline_days"
    | "unclaimed_purchase_reminder_days"
    | "payment_reminder_days"
    | "approval_reminder_days",
): Promise<number> {
  const { [key]: value } = await readSettings(tx, [key]);
  const days = Number.parseInt(value, 10);
  return Number.isSafeInteger(days) && days > 0 ? days : Number(SETTING_DEFAULTS[key]);
}

/** How many reminder texts may go out this calendar month (0 turns texts off). */
export async function smsMonthlyLimit(tx: Tx): Promise<number> {
  const { sms_monthly_limit: value } = await readSettings(tx, ["sms_monthly_limit"]);
  const limit = Number.parseInt(value, 10);
  return Number.isSafeInteger(limit) && limit >= 0
    ? limit
    : Number(SETTING_DEFAULTS.sms_monthly_limit);
}

/** The second-approval threshold in cents, or null when it's off (FR-34). */
export async function secondApprovalThreshold(tx: Tx): Promise<number | null> {
  const { second_approval_threshold: value } = await readSettings(tx, [
    "second_approval_threshold",
  ]);
  const cents = Number.parseInt(value, 10);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function readSettings<K extends SettingKey>(
  tx: Tx,
  keys: readonly K[],
): Promise<Record<K, string>> {
  const rows = await tx
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings)
    .where(inArray(appSettings.key, [...keys]));
  const found = new Map(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(keys.map((k) => [k, found.get(k) ?? SETTING_DEFAULTS[k]])) as Record<
    K,
    string
  >;
}

const bool = (value: string) => value.trim().toLowerCase() === "true";

function stringList(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === "string" && v.trim() !== "");
    }
  } catch {
    // fall through to the default
  }
  return JSON.parse(SETTING_DEFAULTS.pco_leader_accepted_values) as string[];
}

export type LeaderSettings = {
  fieldName: string;
  acceptedValues: string[];
  requireForRequesters: boolean;
  requireForStaff: boolean;
};

export type SignInSettings = {
  leader: LeaderSettings;
  planningCenterEnabled: boolean;
  emailEnabled: boolean;
  adminContactEmail: string;
};

export async function getSignInSettings(tx: Tx): Promise<SignInSettings> {
  const s = await readSettings(tx, [
    "pco_leader_field_name",
    "pco_leader_accepted_values",
    "pco_require_for_requesters",
    "pco_require_for_staff",
    "signin_planning_center_enabled",
    "signin_email_enabled",
    "admin_contact_email",
  ]);
  return {
    leader: {
      fieldName: s.pco_leader_field_name.trim() || SETTING_DEFAULTS.pco_leader_field_name,
      acceptedValues: stringList(s.pco_leader_accepted_values),
      requireForRequesters: bool(s.pco_require_for_requesters),
      requireForStaff: bool(s.pco_require_for_staff),
    },
    planningCenterEnabled: bool(s.signin_planning_center_enabled),
    emailEnabled: bool(s.signin_email_enabled),
    adminContactEmail: s.admin_contact_email.trim(),
  };
}

/**
 * The church time zone from Settings (default America/Winnipeg). An invalid value falls
 * back to APP_TIMEZONE, then America/Winnipeg, so times always render.
 */
export async function getChurchTimeZone(tx: Tx): Promise<string> {
  const { church_timezone } = await readSettings(tx, ["church_timezone"]);
  const zone = church_timezone.trim();
  return isValidTimeZone(zone) ? zone : fallbackTimeZone();
}

export const DEPARTMENT_FIELD_MODES = ["off", "suggest", "restrict"] as const;
export type DepartmentFieldMode = (typeof DEPARTMENT_FIELD_MODES)[number];

export type DepartmentFieldSettings = { fieldName: string; mode: DepartmentFieldMode };

/** The Ministry Department field and its mode; an unknown mode reads as the default. */
export async function getDepartmentFieldSettings(tx: Tx): Promise<DepartmentFieldSettings> {
  const s = await readSettings(tx, ["pco_department_field_name", "pco_department_mode"]);
  const mode = s.pco_department_mode.trim().toLowerCase();
  return {
    fieldName: s.pco_department_field_name.trim() || SETTING_DEFAULTS.pco_department_field_name,
    mode: DEPARTMENT_FIELD_MODES.find((m) => m === mode) ?? "suggest",
  };
}
