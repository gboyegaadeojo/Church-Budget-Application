import { describe, expect, it } from "vitest";
import {
  accentCss,
  accentPalette,
  checkAccent,
  contrast,
  DEFAULT_ACCENT,
  MIN_CONTRAST,
  normaliseHex,
} from "@/lib/brand-colour";

/* The administrator's accent colour (FR-30, DRD 3.8, AC-100). */

const LIGHT = ["#f7f7fa", "#ffffff", "#f1f2f6", "#ebecf2"];
const DARK = ["#08080a", "#101014", "#17171d", "#202027"];

describe("normaliseHex", () => {
  it("accepts 3 and 6 digit colours, with or without #, in any case", () => {
    expect(normaliseHex("#ABC")).toBe("#aabbcc");
    expect(normaliseHex(" 2860C0 ")).toBe("#2860c0");
    expect(normaliseHex("#12345")).toBeNull();
    expect(normaliseHex("red")).toBeNull();
    expect(normaliseHex("#2860c0;}body{")).toBeNull();
  });
});

describe("contrast", () => {
  it("matches WCAG", () => {
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrast("#6d45d8", "#ffffff")).toBeCloseTo(6.0, 1);
  });
});

describe("checkAccent", () => {
  it("keeps the default DRD tokens exactly", () => {
    const result = checkAccent(DEFAULT_ACCENT);
    expect(result.ok).toBe(true);
    expect(accentPalette(DEFAULT_ACCENT).dark.accent).toBe("#a78bfa");
  });

  it("refuses something that isn't a colour", () => {
    expect(checkAccent("purple")).toEqual({ ok: false, reason: "invalid" });
  });

  it.each(["#ffd400", "#7fdbff", "#ff99cc", "#cccccc"])(
    "AC-100 refuses %s and suggests a passing shade",
    (hex) => {
      const result = checkAccent(hex);
      expect(result).toMatchObject({ ok: false, reason: "contrast" });
      if (result.ok || result.reason !== "contrast") return;
      expect(result.contrast).toBeLessThan(MIN_CONTRAST);
      expect(checkAccent(result.suggestion).ok).toBe(true);
    },
  );

  it.each(["#2860c0", "#0f766e", "#b91c1c", "#1e3a8a", "#000000", "#985a06"])(
    "every token made from %s passes in both themes",
    (hex) => {
      const result = checkAccent(hex);
      expect(result.ok).toBe(true);
      const { light, dark } = accentPalette(normaliseHex(hex)!);
      expect(contrast(light.onAccent, light.accent)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      expect(contrast(dark.onAccent, dark.accent)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      for (const bg of [...LIGHT, light.soft]) {
        expect(contrast(light.accent, bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
      for (const bg of [...DARK, dark.soft]) {
        expect(contrast(dark.accent, bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
    },
  );
});

describe("accentCss", () => {
  it("overrides the tokens for both themes", () => {
    const css = accentCss(accentPalette("#2860c0"));
    expect(css).toContain(":root:root{--accent:#2860c0;");
    expect(css).toMatch(/@media screen\{:root\.dark\{--accent:#[0-9a-f]{6};/);
  });
});
