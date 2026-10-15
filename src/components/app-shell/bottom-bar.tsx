"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Ellipsis, Eye } from "lucide-react";
import { copy } from "@/copy/en-CA";
import {
  areaForPath,
  FOOTER_LINKS,
  isActiveHref,
  type AreaId,
  type NavArea,
} from "@/domain/navigation";
import { cn } from "@/lib/cn";
import { AreaIcon } from "./area-icon";

/** The areas that get their own bottom-bar button (DRD 6.0); everything else is under More. */
const BAR_AREAS: readonly AreaId[] = ["home", "annual", "expenses", "spending"];

const tabClass =
  "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-center text-xs leading-tight text-fg-muted transition-colors duration-fast";

/** Mobile and tablet navigation, below the lg breakpoint where the sidebar takes over. */
export function BottomBar({ areas }: { areas: NavArea[] }) {
  const pathname = usePathname();
  const activeArea = areaForPath(pathname);
  const barAreas = areas.filter((area) => BAR_AREAS.includes(area.id));

  return (
    <nav
      aria-label={copy.nav.mobileNavigation}
      className="fixed inset-x-0 bottom-0 z-(--z-nav) border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="flex">
        {barAreas.map((area) => {
          const active = activeArea === area.id;
          return (
            <li key={area.id} className="flex min-w-0 flex-1">
              <Link
                href={area.href}
                aria-current={active ? "page" : undefined}
                className={cn(tabClass, active && "font-medium text-accent")}
              >
                <AreaIcon area={area.id} className="size-5" />
                <span>{area.label}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex min-w-0 flex-1">
          <MoreMenu areas={areas} pathname={pathname} />
        </li>
      </ul>
    </nav>
  );
}

function MoreMenu({ areas, pathname }: { areas: NavArea[]; pathname: string }) {
  return (
    // Non-modal: a modal menu aria-hides the page while its links stay focusable (axe aria-hidden-focus).
    <Menu.Root modal={false}>
      <Menu.Trigger className={tabClass}>
        <Ellipsis className="size-5" aria-hidden="true" />
        <span>{copy.nav.more}</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={16}
          className="z-(--z-overlay) max-h-[calc(100dvh-6rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-card border border-border bg-surface p-2 text-fg shadow-overlay"
        >
          {areas.map((area, index) => (
            <Menu.Group key={area.id}>
              {index > 0 && <Menu.Separator className="my-1 h-px bg-border" />}
              <Menu.Label className="flex items-center gap-2 px-3 pt-2 pb-1 text-xs font-medium text-fg-muted">
                <AreaIcon area={area.id} className="size-4" />
                {area.label}
              </Menu.Label>
              {area.items.map((item) => (
                <MenuLink
                  key={item.href}
                  href={item.href}
                  active={isActiveHref(pathname, item.href)}
                >
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.viewOnly && (
                    <span className="flex items-center gap-1 text-xs text-fg-muted">
                      <Eye className="size-3.5" aria-hidden="true" />
                      {copy.nav.viewOnly}
                    </span>
                  )}
                </MenuLink>
              ))}
            </Menu.Group>
          ))}
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Group>
            {FOOTER_LINKS.map((link) => (
              <MenuLink key={link.href} href={link.href} active={isActiveHref(pathname, link.href)}>
                {link.label}
              </MenuLink>
            ))}
          </Menu.Group>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

function MenuLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Menu.Item asChild>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 items-center gap-2 rounded-control px-3 text-sm outline-none data-[highlighted]:bg-surface-hover",
          active && "bg-accent-soft font-medium text-accent",
        )}
      >
        {children}
      </Link>
    </Menu.Item>
  );
}
