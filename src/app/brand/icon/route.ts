import { connection } from "next/server";
import { getDb } from "@/db";
import { brandAssetBytes, getBrand } from "@/domain/settings/brand";

/**
 * The browser-tab and home-screen icon (FR-30, DRD 3.8): the administrator's square icon,
 * or the default one. Cached briefly, so a new icon shows within minutes. `?home` asks for
 * the home-screen icon, whose default is the full-size church mark rather than the favicon.
 */
export async function GET(request: Request) {
  await connection();
  const db = getDb();
  const { icon } = await getBrand(db);
  const asset = icon ? await brandAssetBytes(db, icon.id) : null;
  if (!asset) {
    const home = new URL(request.url).searchParams.has("home");
    return Response.redirect(
      new URL(home ? "/icons/apple-touch-icon.png" : "/favicon.ico", request.url),
      307,
    );
  }
  return new Response(new Uint8Array(asset.bytes), {
    headers: {
      "Content-Type": asset.contentType,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
