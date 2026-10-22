import { Suspense } from "react";
import { Church } from "lucide-react";
import { currentBrandView } from "@/components/app-shell/live-brand";
import { DEFAULT_BRAND, type BrandView } from "@/components/app-shell/brand";

/**
 * Sign-in and access screens (DRD 6.1, 6.1a): no navigation, one calm card on a quiet
 * backdrop, with the church's mark above it like an app icon (redesigned 2026-10-22).
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main
      id="main"
      className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-bg px-4 py-12"
    >
      {/* A soft glow of the accent colour behind the card; decoration only. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-[36rem] max-w-3xl rounded-full bg-accent opacity-[0.10] blur-3xl dark:opacity-[0.16]"
      />
      <div className="w-full max-w-[26rem] space-y-8">
        <Suspense fallback={<AuthBrand brand={DEFAULT_BRAND} />}>
          <LoadedAuthBrand />
        </Suspense>
        <div className="rounded-[24px] border border-border/70 bg-surface/90 p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_40px_-12px_rgb(0_0_0/0.18)] backdrop-blur-xl sm:p-9">
          {children}
        </div>
      </div>
    </main>
  );
}

async function LoadedAuthBrand() {
  return <AuthBrand brand={await currentBrandView()} />;
}

/** The church's logo, or the church mark as an app-icon tile, with the church's name. */
function AuthBrand({ brand }: { brand: BrandView }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {brand.logoPath ? (
        // eslint-disable-next-line @next/next/no-img-element -- a stored upload, not a build asset
        <img src={brand.logoPath} alt="" className="h-16 w-auto max-w-48 object-contain" />
      ) : (
        <span className="grid size-16 place-items-center rounded-[18px] bg-accent text-on-accent shadow-[0_8px_24px_-8px_var(--accent)]">
          <Church className="size-8" aria-hidden="true" />
        </span>
      )}
      <span className="text-sm font-medium tracking-wide text-fg-muted">{brand.churchName}</span>
    </div>
  );
}
