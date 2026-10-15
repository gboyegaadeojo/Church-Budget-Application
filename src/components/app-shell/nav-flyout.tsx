"use client";

import Link from "next/link";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { areaForPath, isActiveHref, singlePage, type NavArea } from "@/domain/navigation";
import { cn } from "@/lib/cn";
import { AREA_STYLE, AreaBadge } from "./area-icon";
import { ViewOnly } from "./nav-tree";

/**
 * The icon rail: tablets, and the collapsed desktop sidebar (DRD 6.0). Each area is
 * one coloured icon; areas with several pages open a flyout listing them.
 */
export function NavRail({ areas, pathname }: { areas: NavArea[]; pathname: string }) {
  const activeArea = areaForPath(pathname);
  return (
    <ul className="space-y-2">
      {areas.map((area) => {
        const active = activeArea === area.id;
        const single = singlePage(area);
        return (
          <li key={area.id} className="relative flex justify-center">
            {/* The active area's bar grows in at the rail's edge. */}
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-1/2 left-0 h-7 w-1 -translate-y-1/2 rounded-r-full transition-transform duration-standard ease-standard",
                AREA_STYLE[area.id].bar,
                active ? "scale-y-100" : "scale-y-0",
              )}
            />
            {single ? (
              <Link
                href={single.href}
                aria-label={single.label}
                title={single.label}
                aria-current={isActiveHref(pathname, single.href) ? "page" : undefined}
                className={railButton(active)}
              >
                <AreaBadge area={area.id} />
              </Link>
            ) : (
              <Flyout area={area} pathname={pathname} active={active} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function railButton(active: boolean) {
  return cn(
    "group grid size-12 place-items-center rounded-card transition-colors duration-fast ease-standard hover:bg-surface-hover",
    active && "bg-surface-2",
  );
}

function Flyout({ area, pathname, active }: { area: NavArea; pathname: string; active: boolean }) {
  const s = AREA_STYLE[area.id];
  return (
    // Non-modal, like the other menus: a modal menu aria-hides the page around it.
    <Menu.Root modal={false}>
      <Menu.Trigger
        aria-label={area.label}
        title={area.label}
        aria-current={active ? "true" : undefined}
        className={railButton(active)}
      >
        <AreaBadge area={area.id} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          side="right"
          align="start"
          sideOffset={12}
          collisionPadding={16}
          className="z-(--z-overlay) w-64 origin-(--radix-dropdown-menu-content-transform-origin) animate-pop-in overflow-hidden rounded-card border border-border bg-surface text-fg shadow-overlay"
        >
          <Menu.Label
            className={cn(
              "flex items-center gap-3 px-3 py-3 text-sm font-semibold",
              s.soft,
              s.text,
            )}
          >
            <AreaBadge area={area.id} size="sm" className="bg-surface" />
            {area.label}
          </Menu.Label>
          <div className={cn("m-2 ml-4 space-y-0.5 border-l-2 pl-2", s.ring)}>
            {area.items.map((item) => {
              const current = isActiveHref(pathname, item.href);
              return (
                <Menu.Item key={item.href} asChild>
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-2.5 rounded-control px-2.5 text-sm outline-none data-[highlighted]:bg-surface-hover lg:min-h-9",
                      current ? cn("font-medium", s.text) : "text-fg",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        current ? cn(s.bar, "scale-150") : "bg-border-strong",
                      )}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    <ViewOnly show={item.viewOnly} />
                  </Link>
                </Menu.Item>
              );
            })}
          </div>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
