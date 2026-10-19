import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * No file uploads (FR-23, AC-25, CLAUDE.md constraint 5). The edge proxy can't read form
 * bodies (src/proxy.ts), so the guarantee is here: no server action reads a file's
 * contents, except the logo and icon upload on Settings → Branding (FR-30). Reading a
 * file takes one of these calls; a form field read as text (form.text, form.all) never
 * returns a file.
 */

const ALLOWED = [path.join("src", "app", "(app)", "admin", "settings", "branding", "actions.ts")];
const FILE_READS = /instanceof\s+(File|Blob)\b|\.arrayBuffer\(|\.stream\(\)|\.bytes\(\)/;

function serverActionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return serverActionFiles(full);
    if (!/\.tsx?$/.test(name)) return [];
    return /^\s*["']use server["']/m.test(readFileSync(full, "utf8")) ? [full] : [];
  });
}

describe("no file uploads outside Settings → Branding (AC-25)", () => {
  const files = serverActionFiles("src").map((f) => path.relative(process.cwd(), f));

  it("finds the server actions", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files).toContain(ALLOWED[0]);
  });

  it("no server action reads a file's contents, except the logo upload", () => {
    const readers = files.filter(
      (f) => !ALLOWED.includes(f) && FILE_READS.test(readFileSync(f, "utf8")),
    );
    expect(readers).toEqual([]);
  });
});
