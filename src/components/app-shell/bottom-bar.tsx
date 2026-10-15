"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Ellipsis, X } from "lucide-react";
import { copy } from "@/copy/en-CA";
import {
  areaForPath,
  FOOTER_LINKS,
  isActiveHref,
  type AreaId,
  type NavArea,
} from "@/domain/navigation";
import { cn } from "@/lib/cn";
import { AREA_STYLE, AreaIcon } from "./area-icon";
import { NavTree } from "./nav-tree";

/** The areas that get their own bottom-bar button (DRD 6.0); everything else is under More. */
const BAR_AREAS: readonly AreaId[] = ["home", "annual", "expenses", "spending"];

const tabClass =
  "group flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-center text-xs leading-tight text-fg-muted transition-colors duration-fast";

/** Phone navigation, below the md breakpoint where the side rail takes over. */
export function BottomBar({ areas }: { areas: NavArea[] }) {
  const pathname = usePathname();
  const activeArea = areaForPath(pathname);
  const barAreas = areas.filter((area) => BAR_AREAS.includes(area.id));

  return (
    <nav
      aria-label={copy.nav.mobileNavigation}
      className="fixed inset-x-0 bottom-0 z-(--z-nav) border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="flex">
        {barAreas.map((area) => {
          const active = activeArea === area.id;
          const s = AREA_STYLE[area.id];
          return (
            <li key={area.id} className="flex min-w-0 flex-1">
              <Link
                href={area.href}
                aria-current={active ? "page" : undefined}
                className={cn(tabClass, active && cn("font-medium", s.text))}
              >
                {/* The active tab's icon sits in a pill of its area's colour that grows in. */}
                <span className="relative grid h-6 w-12 place-items-center">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-0 rounded-full transition-[transform,opacity] duration-standard ease-standard",
                      s.soft,
                      active ? "scale-100 opacity-100" : "scale-50 opacity-0",
                    )}
                  />
                  <AreaIcon area={area.id} className="relative size-5" />
                </span>
                <span>{area.label}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex min-w-0 flex-1">
          <MoreSheet areas={areas} pathname={pathname} />
        </li>
      </ul>
    </nav>
  );
}

/** Every page, as the same coloured accordion as the desktop sidebar, in a bottom sheet. */
function MoreSheet({ areas, pathname }: { areas: NavArea[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  // Any link closes the sheet, including one to the page already open.
  const closeOnLink = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a")) setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={tabClass}>
        <span className="grid h-6 w-12 place-items-center">
          <Ellipsis className="size-5" aria-hidden="true" />
        </span>
        <span>{copy.nav.more}</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-(--z-overlay) bg-black/40 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-(--z-overlay) flex max-h-[85dvh] flex-col rounded-t-dialog border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] text-fg shadow-overlay data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in">
          <span
            aria-hidden="true"
            className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border-strong/50"
          />
          <div className="flex items-start justify-between gap-3 px-4 pt-2 pb-3">
            <div>
              <Dialog.Title className="text-base font-semibold">{copy.nav.allPages}</Dialog.Title>
              <Dialog.Description className="text-sm text-fg-muted">
                {copy.nav.allPagesHint}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label={copy.nav.closeMenu}
              className="grid size-11 shrink-0 place-items-center rounded-full text-fg-muted transition-colors duration-fast hover:bg-surface-hover hover:text-fg"
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto px-3 pb-4" onClick={closeOnLink}>
            <NavTree areas={areas} pathname={pathname} />
            <ul className="mt-3 flex gap-2 border-t border-border px-2 pt-3">
              {FOOTER_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={isActiveHref(pathname, link.href) ? "page" : undefined}
                    className="flex min-h-11 items-center rounded-full bg-surface-2 px-4 text-sm text-fg transition-colors duration-fast hover:bg-surface-hover"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
