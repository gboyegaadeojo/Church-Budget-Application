import { eq } from "drizzle-orm";
import { z } from "zod";
import { brandAssets } from "@/db/schema";
import type { Tx } from "@/db/types";
import { checkAccent, type AccentPalette } from "@/lib/brand-colour";
import { readSettings } from "./index";

/**
 * The church's branding as shown (FR-30, DRD 3.8): logo, square icon, church and
 * application names, and the accent colour. Pages read it per request, so a change shows
 * for everyone at once. Changes go through ./brand-service.ts.
 */

export type BrandKind = "logo" | "icon";

export type BrandImage = {
  id: string;
  contentType: string;
  width: number | null;
  height: number | null;
  /** Served by /brand/asset/{id}; the id changes with every upload, so it caches forever. */
  path: string;
};

export type Brand = {
  churchName: string;
  appName: string;
  /** The checked accent hex, or null for the DRD default. */
  accent: string | null;
  palette: AccentPalette | null;
  logo: BrandImage | null;
  icon: BrandImage | null;
};

async function imageRow(tx: Tx, id: string): Promise<BrandImage | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await tx
    .select({
      id: brandAssets.id,
      contentType: brandAssets.contentType,
      width: brandAssets.width,
      height: brandAssets.height,
    })
    .from(brandAssets)
    .where(eq(brandAssets.id, id))
    .limit(1);
  return row ? { ...row, path: `/brand/asset/${row.id}` } : null;
}

export async function getBrand(tx: Tx): Promise<Brand> {
  const s = await readSettings(tx, [
    "church_name",
    "app_name",
    "accent_color",
    "logo_asset_id",
    "icon_asset_id",
  ]);
  const checked = s.accent_color ? checkAccent(s.accent_color) : null;
  const [logo, icon] = await Promise.all([
    imageRow(tx, s.logo_asset_id),
    imageRow(tx, s.icon_asset_id),
  ]);
  return {
    churchName: s.church_name,
    appName: s.app_name,
    accent: checked?.ok ? checked.hex : null,
    palette: checked?.ok ? checked.palette : null,
    logo,
    icon,
  };
}

/** One stored asset's bytes, for /brand/asset/{id} and the Excel header. */
export async function brandAssetBytes(
  tx: Tx,
  id: string,
): Promise<{ contentType: string; bytes: Uint8Array; sha256: string } | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await tx
    .select({
      contentType: brandAssets.contentType,
      bytes: brandAssets.bytes,
      sha256: brandAssets.sha256,
    })
    .from(brandAssets)
    .where(eq(brandAssets.id, id))
    .limit(1);
  return row ?? null;
}

/** The current logo's bytes when it's a PNG or JPEG (Excel and email can't show SVG). */
export async function rasterLogo(
  tx: Tx,
  brand: Brand,
): Promise<{ extension: "png" | "jpeg"; bytes: Uint8Array; width: number; height: number } | null> {
  const logo = brand.logo;
  if (!logo || !logo.width || !logo.height) return null;
  if (logo.contentType !== "image/png" && logo.contentType !== "image/jpeg") return null;
  const asset = await brandAssetBytes(tx, logo.id);
  if (!asset) return null;
  return {
    extension: logo.contentType === "image/png" ? "png" : "jpeg",
    bytes: asset.bytes,
    width: logo.width,
    height: logo.height,
  };
}
