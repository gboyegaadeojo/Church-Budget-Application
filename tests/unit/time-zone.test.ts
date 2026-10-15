import { describe, expect, it } from "vitest";
import { CHURCH_TIME_ZONE_DEFAULT, fallbackTimeZone, isValidTimeZone } from "@/lib/time-zone";

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

  it("shows Winnipeg time correctly across daylight saving", () => {
    const format = (iso: string) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: CHURCH_TIME_ZONE_DEFAULT,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(iso));
    expect(format("2026-12-01T15:00:00Z")).toBe("09:00"); // CST, UTC−6
    expect(format("2026-07-01T14:00:00Z")).toBe("09:00"); // CDT, UTC−5
  });
});
