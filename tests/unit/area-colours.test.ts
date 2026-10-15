import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The navigation's area colours (globals.css --area-*) are used as text and icon
 * colours on their own tints, so every pair must meet WCAG AA for text (4.5:1) in
 * both themes (DRD 9). The open group's panel is the tint at 45% over the surface.
 */
const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2].toLowerCase()]),
  );
}

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const mix = (top: Rgb, under: Rgb, alpha: number): Rgb =>
  top.map((c, i) => Math.round(c * alpha + under[i] * (1 - alpha))) as Rgb;

function luminance(c: Rgb): number {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const AREAS = ["home", "annual", "expenses", "spending", "reports", "admin"];

describe.each([
  ["light", ":root"],
  ["dark", ".dark"],
])("area colours in the %s theme", (_, selector) => {
  const t = tokens(selector);

  it("defines a colour and a tint for every area", () => {
    for (const area of AREAS) {
      expect(t[`area-${area}`], area).toMatch(/^#/);
      expect(t[`area-${area}-soft`], area).toMatch(/^#/);
    }
  });

  it.each(AREAS)("%s text reaches 4.5:1 on its tint, its panel and the surface", (area) => {
    const strong = rgb(t[`area-${area}`]);
    const soft = rgb(t[`area-${area}-soft`]);
    const surface = rgb(t.surface);
    const panel = mix(soft, surface, 0.45);
    expect(contrast(strong, soft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(strong, surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(strong, panel)).toBeGreaterThanOrEqual(4.5);
    // Pages that aren't open are muted text inside the panel.
    expect(contrast(rgb(t["fg-muted"]), panel)).toBeGreaterThanOrEqual(4.5);
  });
});
