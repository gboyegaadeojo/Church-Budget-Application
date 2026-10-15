"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Eye, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { copy } from "@/copy/en-CA";
import { areaForPath, isActiveHref, type NavArea } from "@/domain/navigation";
import { cn } from "@/lib/cn";
import { AreaIcon } from "./area-icon";
import { Brand } from "./brand";

const STORAGE_KEY = "sidebar-collapsed";

/** Desktop sidebar, collapsible to icons (DRD 6.0). Hidden below the lg breakpoint. */
export function Sidebar({ areas }: { areas: NavArea[] }) {
  const pathname = usePathname();
  const activeArea = areaForPath(pathname);
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

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-standard ease-standard lg:flex",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      <div className={cn("flex h-16 items-center px-4", collapsed && "justify-center px-0")}>
        <Brand compact={collapsed} />
      </div>

      <nav aria-label={copy.nav.mainNavigation} className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="space-y-4">
          {areas.map((area) => (
            <li key={area.id}>
              {collapsed ? (
                <Link
                  href={area.href}
                  aria-label={area.label}
                  title={area.label}
                  aria-current={activeArea === area.id ? "true" : undefined}
                  className={cn(
                    "mx-auto grid size-11 place-items-center rounded-control text-fg-muted transition-colors duration-fast hover:bg-surface-hover hover:text-fg",
                    activeArea === area.id &&
                      "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent",
                  )}
                >
                  <AreaIcon area={area.id} className="size-5" />
                </Link>
              ) : (
                <>
                  <p
                    className={cn(
                      "mb-1 flex items-center gap-2 px-2 text-xs font-medium text-fg-muted",
                      activeArea === area.id && "text-fg",
                    )}
                  >
                    <AreaIcon area={area.id} className="size-4" />
                    {area.label}
                  </p>
                  <ul className="space-y-0.5">
                    {area.items.map((item) => {
                      const active = isActiveHref(pathname, item.href);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "flex min-h-9 items-center justify-between gap-2 rounded-control px-2 py-1.5 text-sm text-fg transition-colors duration-fast hover:bg-surface-hover",
                              active &&
                                "bg-accent-soft font-medium text-accent hover:bg-accent-soft",
                            )}
                          >
                            <span className="truncate">{item.label}</span>
                            {item.viewOnly && (
                              <span className="flex shrink-0 items-center gap-1 text-xs text-fg-muted">
                                <Eye className="size-3.5" aria-hidden="true" />
                                <span className="sr-only">{copy.nav.viewOnly}</span>
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <div className={cn("border-t border-border p-3", collapsed && "flex justify-center")}>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? copy.nav.expandSidebar : copy.nav.collapseSidebar}
          aria-expanded={!collapsed}
          className="flex min-h-9 items-center gap-2 rounded-control px-2 text-sm text-fg-muted transition-colors duration-fast hover:bg-surface-hover hover:text-fg"
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
