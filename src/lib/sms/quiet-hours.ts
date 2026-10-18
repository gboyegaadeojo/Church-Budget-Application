import { utcToZonedLocal, zonedDate, zonedLocalToUtc } from "@/lib/time-zone";

/** Church-time hours when texts may go: from 9:00 until just before 20:00. */
export const QUIET_UNTIL_HOUR = 9;
export const QUIET_FROM_HOUR = 20;

/** The first moment at or after `now` inside the daytime sending window, in `zone`. */
export function nextSendTime(now: Date, zone: string): Date {
  const hour = Number(utcToZonedLocal(now, zone).slice(11, 13));
  if (hour >= QUIET_UNTIL_HOUR && hour < QUIET_FROM_HOUR) return now;
  const today = zonedDate(now, zone);
  let day = today;
  if (hour >= QUIET_FROM_HOUR) {
    const next = new Date(`${today}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    day = next.toISOString().slice(0, 10);
  }
  const nine = `${day}T${String(QUIET_UNTIL_HOUR).padStart(2, "0")}:00`;
  return zonedLocalToUtc(nine, zone) ?? now;
}
