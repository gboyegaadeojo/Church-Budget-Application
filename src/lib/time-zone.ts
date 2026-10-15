/**
 * The church's time zone (CLAUDE.md "Time zone"). Times are stored in UTC and shown,
 * scheduled and emailed in this zone. The church is in Winnipeg.
 */
export const CHURCH_TIME_ZONE_DEFAULT = "America/Winnipeg";

/** Whether `zone` is an IANA time zone this runtime knows, e.g. "America/Winnipeg". */
export function isValidTimeZone(zone: string): boolean {
  if (!zone.includes("/") && zone !== "UTC") return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The zone to use when the database setting is missing or invalid: APP_TIMEZONE if it
 * is a valid zone, otherwise America/Winnipeg.
 */
export function fallbackTimeZone(env: Record<string, string | undefined> = process.env): string {
  const fromEnv = env.APP_TIMEZONE?.trim();
  return fromEnv && isValidTimeZone(fromEnv) ? fromEnv : CHURCH_TIME_ZONE_DEFAULT;
}
