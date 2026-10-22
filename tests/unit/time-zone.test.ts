import { describe, expect, it } from "vitest";
import {
  CHURCH_TIME_ZONE_DEFAULT,
  fallbackTimeZone,
  formatDateTime,
  isValidTimeZone,
  utcToZonedLocal,
  zonedLocalToUtc,
} from "@/lib/time-zone";

describe("church time zone", () => {
  it("defaults to Winnipeg", () => {
    expect(CHURCH_TIME_ZONE_DEFAULT).toBe("America/Winnipeg");
    expect(fallbackTimeZone({})).toBe("America/Winnipeg");
  });

  it("uses a valid APP_TIMEZONE and ignores an invalid one", () => {
    expect(fallbackTimeZone({ APP_TIMEZONE: "America/Toronto" })).toBe("America/Toronto");
    expect(fallbackTimeZone({ APP_TIMEZONE: "Mars/Olympus" })).toBe("America/Winnipeg");
    expect(fallbackTimeZone({ APP_TIMEZONE: "  " })).toBe("America/Winnipeg");
  });

  it.each(["America/Winnipeg", "America/Vancouver", "UTC"])("accepts %s", (zone) =>
    expect(isValidTimeZone(zone)).toBe(true),
  );

  it.each(["", "Winnipeg", "CST", "America/Nowhere", "+05:00"])("rejects %j", (zone) =>
    expect(isValidTimeZone(zone)).toBe(false),
  );

  // Daylight-saving mechanics use US Central (old Winnipeg rules): Manitoba stays on
  // UTC−5 all year from 2026-11-01 (tzdata 2026e), so Winnipeg no longer changes clocks.
  it("shows church time correctly across daylight saving", () => {
    const format = (iso: string) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Chicago",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(iso));
    expect(format("2026-12-01T15:00:00Z")).toBe("09:00"); // CST, UTCâˆ’6
    expect(format("2026-07-01T14:00:00Z")).toBe("09:00"); // CDT, UTCâˆ’5
  });
});

describe("church-local times", () => {
  // A zone that still changes clocks (Manitoba stopped on 2026-11-01, tzdata 2026e).
  const WPG = "America/Chicago";

  it("converts a winter deadline (CST, UTCâˆ’6) both ways", () => {
    const utc = zonedLocalToUtc("2026-11-30T17:00", WPG);
    expect(utc?.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(utcToZonedLocal(utc!, WPG)).toBe("2026-11-30T17:00");
  });

  it("converts a summer time (CDT, UTCâˆ’5)", () => {
    expect(zonedLocalToUtc("2026-07-01T09:00", WPG)?.toISOString()).toBe(
      "2026-07-01T14:00:00.000Z",
    );
  });

  it("refuses a time skipped when clocks spring forward", () => {
    // 2027-03-14: 02:00 jumps to 03:00 in US Central.
    expect(zonedLocalToUtc("2027-03-14T02:30", WPG)).toBeNull();
    expect(zonedLocalToUtc("2027-03-14T03:30", WPG)?.toISOString()).toBe(
      "2027-03-14T08:30:00.000Z",
    );
  });

  it.each(["", "2026-11-30", "2026-11-30 17:00", "2026-13-01T10:00", "nonsense"])(
    "rejects %j",
    (value) => expect(zonedLocalToUtc(value, WPG)).toBeNull(),
  );

  it("formats in en-CA with the zone", () => {
    expect(formatDateTime(new Date("2026-11-30T23:00:00Z"), WPG)).toBe(
      "Nov 30, 2026, 5:00 p.m. CST",
    );
  });
});
