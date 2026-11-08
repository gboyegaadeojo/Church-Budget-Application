import { describe, expect, it } from "vitest";
import {
  browserLabel,
  deviceDescription,
  originText,
  placeFromHeaders,
} from "@/lib/request-origin";

const CHROME_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const EDGE_WIN = `${CHROME_WIN} Edg/140.0`;

const getter = (h: Record<string, string>) => (name: string) => h[name] ?? null;

describe("where a sign-in request came from", () => {
  it("names the browser and the device", () => {
    expect(browserLabel(CHROME_WIN)).toBe("Chrome");
    expect(browserLabel(EDGE_WIN)).toBe("Edge");
    expect(browserLabel(SAFARI_IPHONE)).toBe("Safari");
    expect(deviceDescription(CHROME_WIN)).toBe("Chrome on a Windows computer");
    expect(deviceDescription(SAFARI_IPHONE)).toBe("Safari on an iPhone");
    expect(deviceDescription("")).toBeNull();
  });

  it("reads the place from Vercel's headers, leaving out Canada", () => {
    expect(
      placeFromHeaders(
        getter({
          "x-vercel-ip-city": "Winnipeg",
          "x-vercel-ip-country-region": "MB",
          "x-vercel-ip-country": "CA",
        }),
      ),
    ).toBe("Winnipeg, MB");
    expect(
      placeFromHeaders(
        getter({
          "x-vercel-ip-city": "S%C3%A3o%20Paulo",
          "x-vercel-ip-country-region": "SP",
          "x-vercel-ip-country": "BR",
        }),
      ),
    ).toBe("São Paulo, SP, BR");
  });

  it("reads Netlify's header too", () => {
    const geo = Buffer.from(
      JSON.stringify({ city: "Brandon", subdivision: { code: "MB" }, country: { code: "CA" } }),
    ).toString("base64");
    expect(placeFromHeaders(getter({ "x-nf-geo": geo }))).toBe("Brandon, MB");
  });

  it("says nothing when it doesn't know, or the header isn't a plain place name", () => {
    expect(placeFromHeaders(getter({}))).toBeNull();
    expect(placeFromHeaders(getter({ "x-nf-geo": "not base64 json" }))).toBeNull();
    expect(placeFromHeaders(getter({ "x-vercel-ip-city": "<script>" }))).toBeNull();
  });

  it("puts it together", () => {
    expect(originText({ userAgent: CHROME_WIN, place: "Winnipeg, MB" })).toBe(
      "Chrome on a Windows computer, near Winnipeg, MB",
    );
    expect(originText({ userAgent: CHROME_WIN, place: null })).toBe("Chrome on a Windows computer");
    expect(originText({ userAgent: "", place: "Winnipeg, MB" })).toBe("Near Winnipeg, MB");
    expect(originText({ userAgent: "", place: null })).toBeNull();
  });
});
