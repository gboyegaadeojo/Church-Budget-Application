/**
 * The administrator's accent colour (FR-30, DRD 3.8). From one hex colour the app makes
 * the light and dark theme accents, their hover shades and tinted backgrounds, and checks
 * them against the DRD 3.2 rules: button text on the accent, and the accent as text on
 * every background it sits on, at 4.5:1 or more. A colour that fails is never saved; the
 * nearest passing shade is offered instead. Pure functions, used by the server (which
 * decides) and the settings form (which previews).
 */

export const DEFAULT_ACCENT = "#6d45d8";
export const MIN_CONTRAST = 4.5;

export type ThemePalette = { accent: string; hover: string; onAccent: string; soft: string };
export type AccentPalette = { light: ThemePalette; dark: ThemePalette };

/** The hand-tuned DRD 3.2 tokens, used as-is for the default colour. */
const DEFAULT_PALETTE: AccentPalette = {
  light: { accent: "#6d45d8", hover: "#5934bd", onAccent: "#ffffff", soft: "#efeafc" },
  dark: { accent: "#a78bfa", hover: "#b9a4ff", onAccent: "#08080a", soft: "#1f1933" },
};

/** The backgrounds an accent appears on, per theme (DRD 3.2: bg, surface, surface 2, hover). */
const LIGHT_BACKGROUNDS = ["#f7f7fa", "#ffffff", "#f1f2f6", "#ebecf2"];
const DARK_BACKGROUNDS = ["#08080a", "#101014", "#17171d", "#202027"];
const LIGHT_ON_ACCENT = "#ffffff";
const DARK_ON_ACCENT = "#08080a";

type Rgb = [number, number, number];
type Hsl = [number, number, number];

/** "#AbC", "abc", "#aabbcc" → "#aabbcc"; anything else → null. */
export function normaliseHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(raw)) {
    return `#${[...raw].map((c) => c + c).join("")}`;
  }
  return /^[0-9a-f]{6}$/.test(raw) ? `#${raw}` : null;
}

function toRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two hex colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function toHsl(hex: string): Hsl {
  const [r, g, b] = toRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) / 6
      : max === g
        ? ((b - r) / d + 2) / 6
        : ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function fromHsl([h, s, l]: Hsl): string {
  if (s === 0) return toHex([l * 255, l * 255, l * 255]);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return toHex([channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255]);
}

const withLightness = (hex: string, l: number) => {
  const [h, s] = toHsl(hex);
  return fromHsl([h, s, Math.min(1, Math.max(0, l))]);
};

/** `weight` of `hex` over `base` (0 to 1). */
function mix(hex: string, base: string, weight: number): string {
  const a = toRgb(hex);
  const b = toRgb(base);
  return toHex([0, 1, 2].map((i) => a[i] * weight + b[i] * (1 - weight)) as Rgb);
}

const lightSoft = (accent: string) => mix(accent, "#ffffff", 0.1);
const darkSoft = (accent: string) => mix(accent, "#08080a", 0.16);

/** The lowest contrast across what a light-theme accent must pass. */
function lightScore(accent: string): number {
  return Math.min(
    contrast(LIGHT_ON_ACCENT, accent),
    ...[...LIGHT_BACKGROUNDS, lightSoft(accent)].map((bg) => contrast(accent, bg)),
  );
}

function darkScore(accent: string): number {
  return Math.min(
    contrast(DARK_ON_ACCENT, accent),
    ...[...DARK_BACKGROUNDS, darkSoft(accent)].map((bg) => contrast(accent, bg)),
  );
}

export type AccentCheck =
  | { ok: true; hex: string; palette: AccentPalette; contrast: number }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "contrast"; hex: string; contrast: number; suggestion: string };

/** Darkens a colour in small lightness steps until it passes in the light theme. */
function nearestPassing(hex: string): string {
  const [, , l] = toHsl(hex);
  for (let step = 0; step <= 200; step++) {
    const candidate = withLightness(hex, l - step * 0.005);
    if (lightScore(candidate) >= MIN_CONTRAST) return candidate;
  }
  return "#000000";
}

/** The dark theme's accent: the same hue, lightened until it passes on the dark surfaces. */
function darkAccent(hex: string): string {
  const [, , l] = toHsl(hex);
  const start = Math.max(l, 0.6);
  for (let step = 0; step <= 100; step++) {
    const candidate = withLightness(hex, start + step * 0.005);
    if (darkScore(candidate) >= MIN_CONTRAST) return candidate;
  }
  return "#ffffff";
}

/** Every token the accent drives, for both themes. */
export function accentPalette(hex: string): AccentPalette {
  if (hex === DEFAULT_ACCENT) return DEFAULT_PALETTE;
  const [, , l] = toHsl(hex);
  const dark = darkAccent(hex);
  const [, , dl] = toHsl(dark);
  return {
    light: {
      accent: hex,
      hover: withLightness(hex, l - 0.08),
      onAccent: LIGHT_ON_ACCENT,
      soft: lightSoft(hex),
    },
    dark: {
      accent: dark,
      hover: withLightness(dark, dl + 0.06),
      onAccent: DARK_ON_ACCENT,
      soft: darkSoft(dark),
    },
  };
}

/** Checks a typed colour; a failing one comes back with the nearest passing shade. */
export function checkAccent(input: string): AccentCheck {
  const hex = normaliseHex(input);
  if (!hex) return { ok: false, reason: "invalid" };
  const score = lightScore(hex);
  const rounded = Math.floor(score * 10) / 10;
  if (score < MIN_CONTRAST) {
    return {
      ok: false,
      reason: "contrast",
      hex,
      contrast: rounded,
      suggestion: nearestPassing(hex),
    };
  }
  return { ok: true, hex, palette: accentPalette(hex), contrast: rounded };
}

/** CSS that overrides the accent tokens in globals.css. Only ever built from a checked hex. */
export function accentCss(palette: AccentPalette): string {
  const vars = (p: ThemePalette) =>
    `--accent:${p.accent};--accent-hover:${p.hover};--on-accent:${p.onAccent};--accent-soft:${p.soft};--area-home:${p.accent};--area-home-soft:${p.soft};`;
  // :root:root and :root.dark outrank globals.css's :root and .dark. Dark is screen-only,
  // like globals.css, so print always uses the light theme (DRD 6.12).
  return `:root:root{${vars(palette.light)}}@media screen{:root.dark{${vars(palette.dark)}}}`;
}
