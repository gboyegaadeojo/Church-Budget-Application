"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { copy } from "@/copy/en-CA";
import type { NavArea } from "@/domain/navigation";
import { cn } from "@/lib/cn";
import { BrandMark, type BrandView } from "./brand";
import { NavRail } from "./nav-flyout";
import { NavTree } from "./nav-tree";

const STORAGE_KEY = "sidebar-collapsed";

/**
 * Side navigation (DRD 6.0). Tablets (md) get the icon rail; desktops (lg) get the
 * accordion, which can collapse to the same rail. Phones use the bottom bar instead.
 */
export function Sidebar({ areas, brand }: { areas: NavArea[]; brand: BrandView }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      // Restoring a saved browser preference after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Storage can be unavailable (private mode); the sidebar just starts expanded.
    }
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Not saved; harmless.
    }
  }

  // On a tablet the rail always shows; on a desktop only when collapsed.
  const rail = collapsed ? "flex" : "flex lg:hidden";
  const full = collapsed ? "hidden" : "hidden lg:flex";

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-standard ease-standard md:flex print:hidden",
        "md:w-[76px]",
        !collapsed && "lg:w-72",
      )}
    >
      <div className="flex h-16 shrink-0 items-center px-4">
        <BrandMark brand={brand} compact className={cn(rail, "mx-auto")} />
        <BrandMark brand={brand} className={full} />
      </div>

      <nav
        aria-label={copy.nav.mainNavigation}
        className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto pb-4"
      >
        <div className={cn(rail, "flex-col")}>
          <NavRail areas={areas} pathname={pathname} />
        </div>
        <div className={cn(full, "flex-col px-3")}>
          <NavTree areas={areas} pathname={pathname} />
        </div>
      </nav>

      <div
        className={cn("hidden border-t border-border p-3 lg:flex", collapsed && "justify-center")}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? copy.nav.expandSidebar : copy.nav.collapseSidebar}
          aria-expanded={!collapsed}
          className="flex min-h-10 items-center gap-2 rounded-control px-2 text-sm text-fg-muted transition-colors duration-fast hover:bg-surface-hover hover:text-accent"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-5" aria-hidden="true" />
          ) : (
            <>
              <PanelLeftClose className="size-5" aria-hidden="true" />
              {copy.nav.collapseSidebar}
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
