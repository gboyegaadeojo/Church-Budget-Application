import { describe, expect, it } from "vitest";
import {
  CHURCH_TIME_ZONE_DEFAULT,
  fallbackTimeZone,
  formatDateTime,
  intlZone,
  isValidTimeZone,
  utcToZonedLocal,
  zonedDate,
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

// Manitoba stays on UTC−5 from 2026-11-01 07:00 UTC. The app applies this itself, so these
// pass on old time-zone data (which falls back to UTC−6) and new (which says "CDT").
describe("Winnipeg from Nov 1, 2026", () => {
  const W = "America/Winnipeg";

  it("is UTC−5 all winter, labelled CT", () => {
    expect(formatDateTime(new Date("2026-11-30T22:00:00Z"), W)).toBe("Nov 30, 2026, 5:00 p.m. CT");
    expect(formatDateTime(new Date("2027-01-15T14:00:00Z"), W)).toBe("Jan 15, 2027, 9:00 a.m. CT");
  });

  it("keeps the old rules before the change", () => {
    expect(formatDateTime(new Date("2026-07-01T14:00:00Z"), W)).toBe("Jul 1, 2026, 9:00 a.m. CDT");
    expect(formatDateTime(new Date("2026-01-15T15:00:00Z"), W)).toBe("Jan 15, 2026, 9:00 a.m. CST");
  });

  it("doesn't repeat or skip an hour on Nov 1", () => {
    expect(utcToZonedLocal(new Date("2026-11-01T06:59:00Z"), W)).toBe("2026-11-01T01:59");
    expect(utcToZonedLocal(new Date("2026-11-01T07:00:00Z"), W)).toBe("2026-11-01T02:00");
  });

  it("converts a winter deadline both ways at UTC−5", () => {
    const utc = zonedLocalToUtc("2026-11-30T17:00", W);
    expect(utc?.toISOString()).toBe("2026-11-30T22:00:00.000Z");
    expect(utcToZonedLocal(utc!, W)).toBe("2026-11-30T17:00");
  });

  it("has no spring-forward gap in 2027", () => {
    expect(zonedLocalToUtc("2027-03-14T02:30", W)?.toISOString()).toBe("2027-03-14T07:30:00.000Z");
  });

  it("shows the day and the zone to Intl", () => {
    expect(zonedDate(new Date("2026-12-01T04:30:00Z"), W)).toBe("2026-11-30");
    expect(intlZone(new Date("2026-12-01T00:00:00Z"), W)).toBe("Etc/GMT+5");
    expect(intlZone(new Date("2026-10-01T00:00:00Z"), W)).toBe(W);
    expect(intlZone(new Date("2026-12-01T00:00:00Z"), "America/Chicago")).toBe("America/Chicago");
  });
});
