/**
 * The church's time zone (CLAUDE.md "Time zone"). Times are stored in UTC and shown,
 * scheduled and emailed in this zone. The church is in Winnipeg.
 */
export const CHURCH_TIME_ZONE_DEFAULT = "America/Winnipeg";

/**
 * Manitoba stopped changing clocks on 2026-11-01: it stays on UTC−5 all year (announced
 * 2026-09-17). The moment it would have fallen back was 2:00 a.m. CDT, 07:00 UTC.
 * Runtimes disagree about this (older time-zone data still falls back to UTC−6, newer
 * data calls it permanent "CDT"), so the app applies the rule itself
 * (docs/decisions.md 2026-11-13).
 */
const WINNIPEG = "America/Winnipeg";
export const MANITOBA_FIXED_FROM = new Date(Date.UTC(2026, 10, 1, 7));
/** IANA's fixed UTC−5 zone (its sign is reversed by convention). */
const FIXED_UTC_MINUS_5 = "Etc/GMT+5";
/** Manitoba's label from Nov 1, 2026: Central time, without a seasonal letter. */
const MANITOBA_LABEL = "CT";

function isManitobaFixed(at: Date | number, zone: string): boolean {
  const ms = typeof at === "number" ? at : at.getTime();
  return zone === WINNIPEG && ms >= MANITOBA_FIXED_FROM.getTime();
}

/**
 * The zone to give `Intl` when showing `at` in the church `zone`. It's the zone itself,
 * except Winnipeg from Nov 1, 2026, which is a fixed UTC−5 whatever the runtime's data.
 * Every date shown in the church zone goes through this.
 */
export function intlZone(at: Date | number, zone: string): string {
  return isManitobaFixed(at, zone) ? FIXED_UTC_MINUS_5 : zone;
}

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

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** The wall-clock reading of `at` in `zone`, as if it were UTC (milliseconds). */
function wallClockMs(at: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: intlZone(at, zone),
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
}

/** A UTC instant as the value of an `<input type="datetime-local">` in `zone`. */
export function utcToZonedLocal(date: Date, zone: string): string {
  const wall = new Date(wallClockMs(date.getTime(), zone));
  return wall.toISOString().slice(0, 16);
}

/**
 * A church-local date and time ("2026-11-30T17:00", as a datetime-local input sends it)
 * as a UTC instant. Returns null for malformed input, and for times that don't exist
 * because the clocks jump forward that night.
 */
export function zonedLocalToUtc(local: string, zone: string): Date | null {
  const m = LOCAL_PATTERN.exec(local.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  if (Number.isNaN(guess)) return null;
  const offset1 = wallClockMs(guess, zone) - guess;
  const first = guess - offset1;
  const offset2 = wallClockMs(first, zone) - first;
  const result = new Date(guess - offset2);
  return utcToZonedLocal(result, zone) === local.trim() ? result : null;
}

/** The calendar date of `at` in `zone`, as "2026-11-30". */
export function zonedDate(at: Date, zone: string): string {
  return utcToZonedLocal(at, zone).slice(0, 10);
}

/** "Nov 30, 2026" for a plain calendar date ("2026-11-30"), which has no time zone. */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", dateStyle: "medium" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** "Nov 30, 2026, 5:00 p.m. CT": a date and time in the church time zone (en-CA). */
export function formatDateTime(date: Date, zone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: intlZone(date, zone),
    dateStyle: "medium",
    timeStyle: "short",
  })
    .format(date)
    .concat(` ${zoneAbbreviation(date, zone)}`);
}

/** "Nov 30": a short day in the church time zone, for progress steps in emails. */
export function formatShortDate(date: Date, zone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: intlZone(date, zone),
    month: "short",
    day: "numeric",
  }).format(date);
}

function zoneAbbreviation(date: Date, zone: string): string {
  if (isManitobaFixed(date, zone)) return MANITOBA_LABEL;
  return (
    new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName")?.value ?? ""
  );
}
