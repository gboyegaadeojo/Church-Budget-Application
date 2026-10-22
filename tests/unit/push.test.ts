import { describe, expect, it } from "vitest";
import { deviceLabel, isPushEndpoint } from "@/domain/notifications/push";

describe("phone alerts: push endpoints (decided 2026-10-22)", () => {
  it("accepts the browsers' own push services", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/abc:def",
      "https://web.push.apple.com/QGx1",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAA",
      "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
    ]) {
      expect(isPushEndpoint(url), url).toBe(true);
    }
  });

  it("refuses anything else, since the app posts to the address", () => {
    for (const url of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/fcm/send/abc",
      "https://evil.example/fcm.googleapis.com",
      "https://fcm.googleapis.com.evil.example/x",
      "https://user@fcm.googleapis.com/x",
      "https://localhost/push",
      "https://169.254.169.254/latest",
      "not a url",
    ]) {
      expect(isPushEndpoint(url), url).toBe(false);
    }
  });
});

describe("phone alerts: device names", () => {
  it("names the device plainly", () => {
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("iPhone");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 15; Pixel 8) Mobile Safari")).toBe(
      "Android phone",
    );
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140")).toBe(
      "Windows computer",
    );
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("Mac");
    expect(deviceLabel("")).toBe("Device");
  });
});
