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
  /** IANA zone for showing and scheduling times (CLAUDE.md "Time zone"). */
  church_timezone: CHURCH_TIME_ZONE_DEFAULT,
  /** FR-01a: the People custom field that marks a Group Leader, and the values that count. */
  pco_leader_field_name: "Ministry Leader",
  pco_leader_accepted_values: JSON.stringify(["Yes"]),
  pco_require_for_requesters: "true",
  pco_require_for_staff: "false",
  signin_google_enabled: "true",
  signin_planning_center_enabled: "true",
  /** Shown on access-denied screens as who to contact (DRD 6.1a). */
  admin_contact_email: "",
  /** FR-33: who gets the accountant emails; other accountant-role holders are backups. */
  primary_accountant_user_id: "",
} as const;

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
  googleEnabled: boolean;
  planningCenterEnabled: boolean;
  adminContactEmail: string;
};

export async function getSignInSettings(tx: Tx): Promise<SignInSettings> {
  const s = await readSettings(tx, [
    "pco_leader_field_name",
    "pco_leader_accepted_values",
    "pco_require_for_requesters",
    "pco_require_for_staff",
    "signin_google_enabled",
    "signin_planning_center_enabled",
    "admin_contact_email",
  ]);
  return {
    leader: {
      fieldName: s.pco_leader_field_name.trim() || SETTING_DEFAULTS.pco_leader_field_name,
      acceptedValues: stringList(s.pco_leader_accepted_values),
      requireForRequesters: bool(s.pco_require_for_requesters),
      requireForStaff: bool(s.pco_require_for_staff),
    },
    googleEnabled: bool(s.signin_google_enabled),
    planningCenterEnabled: bool(s.signin_planning_center_enabled),
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
