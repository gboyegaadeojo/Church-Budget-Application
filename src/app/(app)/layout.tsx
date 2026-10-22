import { Suspense } from "react";
import Link from "next/link";
import { Brand } from "@/components/app-shell/live-brand";
import { Breadcrumbs } from "@/components/app-shell/breadcrumbs";
import { DemoBanner } from "@/components/app-shell/demo-banner";
import { Footer } from "@/components/app-shell/footer";
import { GlobalSearch } from "@/components/app-shell/global-search";
import {
  NotificationBell,
  NotificationBellFallback,
} from "@/components/app-shell/notification-bell";
import {
  AccountMenuFallback,
  SidebarFallback,
  ViewerAccountMenu,
  ViewerBottomBar,
  ViewerSidebar,
} from "@/components/app-shell/viewer-shell";
import { ViewerAlertsPrompt, ViewerServiceWorker } from "@/components/pwa/viewer-alerts";
import { copy } from "@/copy/en-CA";

/**
 * One application for every role (DRD 6.0, FR-37): side rail on tablets, sidebar on desktop, a bottom
 * bar on phones, header with search, the notification bell and the account menu, footer with Help and Privacy.
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
      <Suspense fallback={null}>
        <DemoBanner />
      </Suspense>
      <div className="flex min-h-dvh">
        <Suspense fallback={<SidebarFallback />}>
          <ViewerSidebar />
        </Suspense>

        <div className="flex min-w-0 flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0 print:pb-0">
          <header className="sticky top-0 z-(--z-sticky) flex h-16 items-center justify-between gap-4 border-b border-border bg-bg/90 px-4 backdrop-blur md:justify-end lg:px-8 print:hidden">
            <div className="flex min-w-0 items-center gap-3 md:hidden">
              {/* Logo only on narrow phones, where search, the bell and the account need the room. */}
              <Link href="/" className="min-w-0 rounded-control">
                <Brand compact className="sm:hidden" />
                <Brand className="hidden sm:flex" />
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <GlobalSearch />
              <Suspense fallback={<NotificationBellFallback />}>
                <NotificationBell />
              </Suspense>
              <Suspense fallback={<AccountMenuFallback />}>
                <ViewerAccountMenu />
              </Suspense>
            </div>
          </header>

          <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 outline-none lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-7xl">
              {/* Printed pages carry the church's logo and names instead of the navigation (DRD 6.12, FR-30). */}
              <div className="mb-6 hidden border-b border-border pb-4 print:block">
                <Brand />
              </div>
              <Suspense fallback={null}>
                <ViewerAlertsPrompt />
              </Suspense>
              <Suspense fallback={null}>
                <Breadcrumbs />
              </Suspense>
              {children}
            </div>
          </main>

          <Footer />
        </div>
      </div>
      <Suspense fallback={null}>
        <ViewerBottomBar />
      </Suspense>
      <Suspense fallback={null}>
        <ViewerServiceWorker />
      </Suspense>
    </>
  );
}
