import { describe, expect, it } from "vitest";
import { checkImage, MAX_LOGO_BYTES } from "@/lib/brand-image";

/* Logo and icon uploads (FR-30, DRD 3.8). */

const svg = (s: string) => new TextEncoder().encode(s);

/** A minimal PNG header: signature, then IHDR with width and height. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** SOI, an APP0 segment, then SOF0 with height and width. */
function jpeg(width: number, height: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00];
  const sof = [
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    1,
    1,
    0x11,
    0,
  ];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, 0xff, 0xd9]);
}

describe("checkImage", () => {
  it("reads a PNG's and a JPEG's type and size from the bytes", () => {
    expect(checkImage(png(400, 120))).toEqual({
      ok: true,
      image: { contentType: "image/png", width: 400, height: 120 },
    });
    expect(checkImage(jpeg(640, 480))).toEqual({
      ok: true,
      image: { contentType: "image/jpeg", width: 640, height: 480 },
    });
  });

  it("accepts a plain SVG, with a declaration, doctype and internal links", () => {
    const result = checkImage(
      svg(
        '<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd">\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"><defs><linearGradient id="g"/></defs><rect fill="url(#g)" width="10" height="10"/><use href="#g"/></svg>',
      ),
    );
    expect(result).toEqual({
      ok: true,
      image: { contentType: "image/svg+xml", width: 200, height: 50 },
    });
  });

  it.each([
    ["<svg><script>alert(1)</script></svg>"],
    ['<svg onload="alert(1)"></svg>'],
    ['<svg><a href="javascript:alert(1)"><text>x</text></a></svg>'],
    ['<svg><image href="https://tracker.example/p.png"/></svg>'],
    ["<svg><foreignObject><div>x</div></foreignObject></svg>"],
    ["<svg><style>@import url(https://x.example/a.css);</style></svg>"],
    ['<svg><rect style="fill:url(https://x.example/a)"/></svg>'],
  ])("refuses an SVG that can run or fetch: %s", (text) => {
    expect(checkImage(svg(text))).toEqual({ ok: false, problem: "unsafe_svg" });
  });

  it("refuses anything else, empty files and files over 1 MB", () => {
    expect(checkImage(svg('<!DOCTYPE svg [<!ENTITY a "b">]><svg>&a;</svg>')).ok).toBe(false);
    expect(checkImage(svg("GIF89a"))).toEqual({ ok: false, problem: "type" });
    expect(checkImage(svg("<html><svg></svg></html>"))).toEqual({ ok: false, problem: "type" });
    expect(checkImage(new Uint8Array([0x47, 0x49, 0x46, 0xff, 0xfe]))).toEqual({
      ok: false,
      problem: "type",
    });
    expect(checkImage(new Uint8Array())).toEqual({ ok: false, problem: "empty" });
    const big = new Uint8Array(MAX_LOGO_BYTES + 1);
    big.set(png(1, 1));
    expect(checkImage(big)).toEqual({ ok: false, problem: "too_large" });
  });
});
