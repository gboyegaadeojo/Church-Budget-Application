import { connection } from "next/server";
import { getDb } from "@/db";
import { brandAssetBytes } from "@/domain/settings/brand";

/**
 * The church's logo and icon files (FR-30), open without sign-in because the sign-in
 * screen and emails show them. Each upload has its own id, so a file never changes and
 * caches for a year. SVGs are served under a CSP that blocks scripts and fetches, on top
 * of the upload check (src/lib/brand-image.ts).
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const asset = await brandAssetBytes(getDb(), id);
  if (!asset) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(asset.bytes), {
    headers: {
      "Content-Type": asset.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${asset.sha256}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Content-Disposition": "inline",
    },
  });
}
