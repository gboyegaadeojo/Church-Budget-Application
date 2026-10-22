import { describe, expect, it, vi } from "vitest";
import { smsCopy } from "@/copy/sms";
import { pickPhone, toE164 } from "@/lib/pco";
import { twilioConfig } from "@/lib/sms/config";
import { nextSendTime } from "@/lib/sms/quiet-hours";
import { TwilioSmsSender } from "@/lib/sms/twilio";

/** Reminder texts (docs/decisions.md 2026-10-18). */

const phone = (attributes: Record<string, unknown>, id = "1") => ({
  type: "PhoneNumber",
  id,
  attributes,
});

describe("Planning Center phone numbers", () => {
  it("normalizes North American numbers to E.164 and refuses others", () => {
    expect(toE164("(204) 555-0123")).toBe("+12045550123");
    expect(toE164("1-204-555-0123")).toBe("+12045550123");
    expect(toE164("+12045550123")).toBe("+12045550123");
    expect(toE164("+44 20 7946 0958")).toBeNull();
    expect(toE164("555-0123")).toBeNull();
    expect(toE164("(104) 555-0123")).toBeNull();
    expect(toE164("")).toBeNull();
  });

  it("prefers a Mobile number, then the primary one", () => {
    expect(
      pickPhone([
        phone({ number: "204-555-0001", location: "Home", primary: true }, "1"),
        phone({ number: "204-555-0002", location: "Mobile", primary: false }, "2"),
      ]),
    ).toBe("+12045550002");
    expect(
      pickPhone([
        phone({ number: "204-555-0001", location: "Work" }, "1"),
        phone({ e164: "+12045550003", location: "Home", primary: true }, "2"),
      ]),
    ).toBe("+12045550003");
    expect(pickPhone([phone({ number: "+44 20 7946 0958", location: "Mobile" })])).toBeNull();
    expect(pickPhone([])).toBeNull();
  });
});

describe("Quiet hours (texts go 9:00 a.m. to 8:00 p.m. church time)", () => {
  // A zone that still changes clocks (Manitoba stopped on 2026-11-01, tzdata 2026e).
  const zone = "America/Chicago";
  it("sends straight away in the daytime", () => {
    const noon = new Date("2026-11-10T18:00:00Z"); // 12:00 CST
    expect(nextSendTime(noon, zone)).toEqual(noon);
  });

  it("holds a 2:15 a.m. reminder until 9:00 the same morning", () => {
    expect(nextSendTime(new Date("2026-11-10T08:15:00Z"), zone)).toEqual(
      new Date("2026-11-10T15:00:00Z"),
    );
  });

  it("holds an evening one until 9:00 the next morning, across the clock change", () => {
    // Sat Oct 31, 2026, 9:30 p.m. CDT; clocks fall back early Sunday, 9:00 CST = 15:00 UTC.
    expect(nextSendTime(new Date("2026-11-01T02:30:00Z"), zone)).toEqual(
      new Date("2026-11-01T15:00:00Z"),
    );
  });
});

describe("Reminder text copy", () => {
  const url = "https://ifc-church-budget.netlify.app/expenses/awaiting-approval";
  const bodies = [
    smsCopy.deadline(7, url),
    smsCopy.deadline(1, url),
    smsCopy.approval(12, url),
    smsCopy.approval(1, url),
    smsCopy.payment(3, url),
    smsCopy.unclaimed("EXP-2026-0001", "https://ifc-church-budget.netlify.app/expenses"),
  ];

  it("fits one 160-character segment in plain GSM-7 characters", () => {
    for (const body of bodies) {
      expect(body.length, body).toBeLessThanOrEqual(160);
      expect(body, body).toMatch(/^[A-Za-z0-9 .,:'/\-?!()]+$/);
      expect(body).toContain("Reply STOP");
    }
    expect(smsCopy.approval(1, url)).toContain("1 expense is waiting");
  });
});

describe("Twilio sender", () => {
  const config = { accountSid: "AC123", authToken: "secret", from: "+12045550000" };
  const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status, headers }));

  it("posts the text and returns Twilio's id", async () => {
    const fetchImpl = reply(201, { sid: "SM1" });
    const sender = new TwilioSmsSender(config, fetchImpl);
    const result = await sender.send({ id: "row", to: "+12045550123", body: "Hello" });
    expect(result).toEqual({ kind: "sent", providerMessageId: "SM1" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect(String(init!.body)).toBe("To=%2B12045550123&From=%2B12045550000&Body=Hello");
  });

  it("never retries a person who replied STOP", async () => {
    const sender = new TwilioSmsSender(
      config,
      reply(400, { code: 21610, message: "Attempt to send to unsubscribed recipient" }),
    );
    const result = await sender.send({ id: "row", to: "+12045550123", body: "Hello" });
    expect(result.kind).toBe("failed");
  });

  it("retries rate limits and outages", async () => {
    const limited = new TwilioSmsSender(config, reply(429, {}, { "retry-after": "30" }));
    expect(await limited.send({ id: "r", to: "+12045550123", body: "x" })).toMatchObject({
      kind: "retry",
      retryAfterSeconds: 30,
    });
    const down = new TwilioSmsSender(
      config,
      vi.fn<typeof fetch>().mockRejectedValue(new Error("x")),
    );
    expect((await down.send({ id: "r", to: "+12045550123", body: "x" })).kind).toBe("retry");
  });

  it("is configured only with all three settings", () => {
    expect(twilioConfig({})).toBeNull();
    expect(twilioConfig({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t" })).toBeNull();
    expect(
      twilioConfig({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM: "+1204" }),
    ).toEqual({ accountSid: "AC1", authToken: "t", from: "+1204" });
  });
});
