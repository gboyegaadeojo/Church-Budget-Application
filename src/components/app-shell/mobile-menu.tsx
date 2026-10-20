"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { copy } from "@/copy/en-CA";
import { FOOTER_LINKS, isActiveHref, type NavArea } from "@/domain/navigation";
import { NavTree } from "./nav-tree";

/**
 * Phone navigation, below the md breakpoint where the side rail takes over: one Menu
 * button in the header that opens every page as the same coloured accordion as the
 * desktop sidebar, in a sheet. There is no bottom bar, so nothing is shown twice
 * (decided by the church 2026-10-19).
 */
export function MobileMenu({ areas }: { areas: NavArea[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Any link closes the sheet, including one to the page already open.
  const closeOnLink = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a")) setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label={copy.nav.openMenu}
        className="grid size-11 shrink-0 place-items-center rounded-control border border-border bg-surface text-fg transition-colors duration-fast hover:bg-surface-hover hover:text-accent md:hidden print:hidden"
      >
        <Menu className="size-5" aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-(--z-overlay) bg-black/40 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-(--z-overlay) flex max-h-[85dvh] flex-col rounded-t-dialog border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] text-fg shadow-overlay data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in">
          <span
            aria-hidden="true"
            className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border-strong/50"
          />
          <div className="flex items-center justify-between gap-3 px-4 pt-2 pb-3">
            <Dialog.Title className="text-base font-semibold">{copy.nav.menu}</Dialog.Title>
            <Dialog.Description className="sr-only">{copy.nav.allPagesHint}</Dialog.Description>
            <Dialog.Close
              aria-label={copy.nav.closeMenu}
              className="grid size-11 shrink-0 place-items-center rounded-full text-fg-muted transition-colors duration-fast hover:bg-surface-hover hover:text-accent"
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <nav
            aria-label={copy.nav.mobileNavigation}
            className="overflow-y-auto px-3 pb-4"
            onClick={closeOnLink}
          >
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
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
