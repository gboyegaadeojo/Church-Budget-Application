import { Church } from "lucide-react";
import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";

/** What the brand mark shows; the live values come from Settings → Branding (FR-30). */
export type BrandView = { churchName: string; appName: string; logoPath: string | null };

export const DEFAULT_BRAND: BrandView = {
  churchName: copy.app.churchName,
  appName: copy.app.appName,
  logoPath: null,
};

/**
 * Logo plus names. Without a logo, the default church mark on the accent colour. The
 * names follow as text, so the logo is decorative unless it stands alone (compact).
 */
export function BrandMark({
  brand,
  compact = false,
  className,
}: {
  brand: BrandView;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-3", className)}>
      {brand.logoPath ? (
        // eslint-disable-next-line @next/next/no-img-element -- a stored upload, not a build asset
        <img
          src={brand.logoPath}
          alt={compact ? brand.churchName : ""}
          className={cn("h-9 shrink-0 object-contain", compact ? "w-9" : "w-auto max-w-28")}
        />
      ) : (
        <span className="grid size-9 shrink-0 place-items-center rounded-control bg-accent text-on-accent">
          <Church className="size-5" aria-hidden="true" />
          {compact && <span className="sr-only">{brand.churchName}</span>}
        </span>
      )}
      {!compact && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold">{brand.appName}</span>
          <span className="block truncate text-xs text-fg-muted">{brand.churchName}</span>
        </span>
      )}
    </span>
  );
}
