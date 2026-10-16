/**
 * Checks an uploaded logo or icon (FR-30, DRD 3.8): PNG, JPG or SVG, at most 1 MB. The
 * type comes from the file's own bytes, never from its name or the browser's claim. An
 * SVG is accepted only when it is plain drawing: anything that can run or fetch
 * (scripts, event handlers, links, embedded HTML, external references) is refused rather
 * than rewritten, so what's stored is exactly what was checked. Logos are shown only
 * through <img>, which never runs SVG scripts, and served with a locked-down CSP too.
 */

export const MAX_LOGO_BYTES = 1_048_576;

export type ImageType = "image/png" | "image/jpeg" | "image/svg+xml";

export type CheckedImage = {
  contentType: ImageType;
  width: number | null;
  height: number | null;
};

export type ImageProblem = "empty" | "too_large" | "type" | "unsafe_svg" | "unreadable";

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((b, i) => bytes[i] === b);

function pngSize(bytes: Uint8Array): [number, number] | null {
  if (bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
}

/** Walks the JPEG markers to the first start-of-frame, which holds the size. */
function jpegSize(bytes: Uint8Array): [number, number] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const length = view.getUint16(i + 2);
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) return [view.getUint16(i + 7), view.getUint16(i + 5)];
    i += 2 + length;
  }
  return null;
}

/** Patterns that make an SVG more than a picture. */
const UNSAFE_SVG = [
  /<script/i,
  /<foreignobject/i,
  /<iframe|<embed|<object|<audio|<video|<image/i,
  /<!entity/i,
  /<!doctype[^>]*\[/i,
  /\son[a-z]+\s*=/i,
  /javascript:|vbscript:|data:text\/html/i,
  // Links and references are allowed only to the file's own #fragments.
  /\bhref\s*=\s*(?!["']?\s*#)/i,
  /url\(\s*(?!["']?\s*#)/i,
  /@import/i,
  /<\?xml-stylesheet/i,
];

function svgSize(text: string): [number, number] | null {
  const root = /<svg\b[^>]*>/i.exec(text)?.[0] ?? "";
  const viewBox = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(
    root,
  );
  if (viewBox) return [Math.round(Number(viewBox[1])), Math.round(Number(viewBox[2]))];
  const w = /\bwidth\s*=\s*["']\s*([\d.]+)/i.exec(root);
  const h = /\bheight\s*=\s*["']\s*([\d.]+)/i.exec(root);
  return w && h ? [Math.round(Number(w[1])), Math.round(Number(h[1]))] : null;
}

export function checkImage(
  bytes: Uint8Array,
): { ok: true; image: CheckedImage } | { ok: false; problem: ImageProblem } {
  if (bytes.length === 0) return { ok: false, problem: "empty" };
  if (bytes.length > MAX_LOGO_BYTES) return { ok: false, problem: "too_large" };

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    const size = pngSize(bytes);
    if (!size) return { ok: false, problem: "unreadable" };
    return { ok: true, image: { contentType: "image/png", width: size[0], height: size[1] } };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    const size = jpegSize(bytes);
    if (!size) return { ok: false, problem: "unreadable" };
    return { ok: true, image: { contentType: "image/jpeg", width: size[0], height: size[1] } };
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, problem: "type" };
  }
  // An SVG: optional BOM, XML declaration and comments, then <svg.
  const body = text.replace(/^﻿/, "");
  if (
    !/^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*|<!doctype[^>]*>\s*)*<svg[\s>]/i.test(body)
  ) {
    return { ok: false, problem: "type" };
  }
  if (UNSAFE_SVG.some((pattern) => pattern.test(body))) return { ok: false, problem: "unsafe_svg" };
  const size = svgSize(body);
  return {
    ok: true,
    image: { contentType: "image/svg+xml", width: size?.[0] ?? null, height: size?.[1] ?? null },
  };
}
