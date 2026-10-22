import { connection } from "next/server";
import { getAppCopy as g } from "@/copy/get-app";
import { getDb } from "@/db";
import { getBrand } from "@/domain/settings/brand";

const DEFAULT_ICONS = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

/**
 * The web app manifest, so phones and computers can install Church Budget like an app
 * (docs/decisions.md 2026-10-22). The administrator's square icon (FR-30) is used when it
 * is large enough for a home screen; otherwise the default church mark.
 */
export async function GET() {
  await connection();
  const { icon } = await getBrand(getDb());
  const own =
    icon && (icon.contentType === "image/svg+xml" || (icon.width ?? 0) >= 192)
      ? [
          {
            src: icon.path,
            sizes: icon.contentType === "image/svg+xml" ? "any" : `${icon.width}x${icon.height}`,
            type: icon.contentType,
            purpose: "any",
          },
        ]
      : null;
  const manifest = {
    id: "/",
    name: g.manifest.name,
    short_name: g.manifest.shortName,
    description: g.manifest.description,
    lang: "en-CA",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f7fa",
    theme_color: "#f7f7fa",
    icons: own ?? DEFAULT_ICONS,
  };
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
