import "server-only";
import { cache, Suspense } from "react";
import { connection } from "next/server";
import { getDb } from "@/db";
import { getBrand, type Brand } from "@/domain/settings/brand";
import { accentCss } from "@/lib/brand-colour";
import { BrandMark, DEFAULT_BRAND, type BrandView } from "./brand";

/** The church's branding, read once per request (FR-30). Defaults if the database is out. */
export const currentBrand = cache(async (): Promise<Brand | null> => {
  await connection();
  try {
    return await getBrand(getDb());
  } catch {
    return null;
  }
});

export async function currentBrandView(): Promise<BrandView> {
  const brand = await currentBrand();
  if (!brand) return DEFAULT_BRAND;
  return {
    churchName: brand.churchName,
    appName: brand.appName,
    logoPath: brand.logo?.path ?? null,
  };
}

async function LoadedBrand(props: { compact?: boolean; className?: string }) {
  return <BrandMark brand={await currentBrandView()} {...props} />;
}

/** The brand mark for server layouts: the defaults first, then the live branding. */
export function Brand(props: { compact?: boolean; className?: string }) {
  return (
    <Suspense fallback={<BrandMark brand={DEFAULT_BRAND} {...props} />}>
      <LoadedBrand {...props} />
    </Suspense>
  );
}

async function LoadedStyle() {
  const brand = await currentBrand();
  if (!brand?.palette) return null;
  // Built only from a checked hex (src/lib/brand-colour.ts), so nothing typed reaches CSS.
  return <style id="brand-accent">{accentCss(brand.palette)}</style>;
}

/** Overrides the accent tokens with the administrator's colour, for every page. */
export function BrandStyle() {
  return (
    <Suspense fallback={null}>
      <LoadedStyle />
    </Suspense>
  );
}
