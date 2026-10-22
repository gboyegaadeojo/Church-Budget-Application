/**
 * Draws the default home-screen icons in public/icons (the installed app, docs/decisions.md
 * 2026-10-22): the church mark from the header on the accent colour. Run once with
 * `node scripts/make-app-icons.mjs` after changing the mark; the PNGs are committed.
 */
import sharp from "sharp";

const ACCENT = "#6d45d8";
// Lucide "church", the mark BrandMark shows when no logo is uploaded.
const MARK = `<path d="M10 9h4"/><path d="M12 7v5"/><path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="m18 9 3.52 2.147a1 1 0 0 1 .48.854V19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6.999a1 1 0 0 1 .48-.854L6 9"/><path d="M6 21V7a1 1 0 0 1 .376-.782l5-3.999a1 1 0 0 1 1.249.001l5 4A1 1 0 0 1 18 7v14"/>`;

/** The mark at `scale` of the canvas, centred; `background` null leaves it transparent. */
function svg(size, scale, background) {
  const glyph = size * scale;
  const offset = (size - glyph) / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      (background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : "") +
      `<g transform="translate(${offset} ${offset}) scale(${glyph / 24})" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${MARK}</g></svg>`,
  );
}

const icons = [
  // Square and full-bleed: Android masks it to its own shape, so the mark stays in the safe zone.
  { file: "icon-192.png", size: 192, scale: 0.5, background: ACCENT },
  { file: "icon-512.png", size: 512, scale: 0.5, background: ACCENT },
  { file: "apple-touch-icon.png", size: 180, scale: 0.56, background: ACCENT },
  // Android's status bar shows only the shape, in white.
  { file: "badge-96.png", size: 96, scale: 0.8, background: null },
];

for (const icon of icons) {
  await sharp(svg(icon.size, icon.scale, icon.background))
    .png()
    .toFile(`public/icons/${icon.file}`);
  console.log(`public/icons/${icon.file}`);
}
