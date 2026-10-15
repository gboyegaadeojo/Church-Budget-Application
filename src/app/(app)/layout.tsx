import { Suspense } from "react";
import Link from "next/link";
import { Brand } from "@/components/app-shell/brand";
import { Footer } from "@/components/app-shell/footer";
import {
  AccountMenuFallback,
  SidebarFallback,
  ViewerAccountMenu,
  ViewerBottomBar,
  ViewerSidebar,
} from "@/components/app-shell/viewer-shell";
import { copy } from "@/copy/en-CA";

/**
 * One application for every role (DRD 6.0, FR-37): side rail on tablets, sidebar on desktop, bottom bar
 * plus More on mobile, header with the account menu, footer with Help and Privacy.
 * Everything that reads the viewer streams in behind its own Suspense boundary, so
 * the rest of the shell is part of the static prerender.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-(--z-toast) rounded-control bg-surface px-4 py-2 text-fg shadow-overlay focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {copy.app.skipToContent}
      </a>
      <div className="flex min-h-dvh">
        <Suspense fallback={<SidebarFallback />}>
          <ViewerSidebar />
        </Suspense>

        <div className="flex min-w-0 flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
          <header className="sticky top-0 z-(--z-sticky) flex h-16 items-center justify-between gap-4 border-b border-border bg-bg/90 px-4 backdrop-blur md:justify-end lg:px-8">
            <Link href="/" className="rounded-control md:hidden">
              <Brand />
            </Link>
            <Suspense fallback={<AccountMenuFallback />}>
              <ViewerAccountMenu />
            </Suspense>
          </header>

          <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 outline-none lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>

          <Footer />
        </div>
      </div>
      <Suspense fallback={null}>
        <ViewerBottomBar />
      </Suspense>
    </>
  );
}
