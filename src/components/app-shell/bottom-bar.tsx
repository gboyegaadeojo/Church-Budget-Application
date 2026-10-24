"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, Ellipsis, X } from "lucide-react";
import { copy } from "@/copy/en-CA";
import { areaForPath, FOOTER_LINKS, isActiveHref, type NavArea } from "@/domain/navigation";
import { cn } from "@/lib/cn";
import { AREA_STYLE, AreaBadge, AreaIcon } from "./area-icon";
import { PageLink } from "./nav-tree";

const tabClass =
  "group flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-center text-xs leading-tight text-fg-muted transition-colors duration-fast";

/** Home and the person's first three areas get a button. */
const BAR_SIZE = 4;

/** Where an area's button goes: its first page that isn't a "new" form (My expenses, not New expense). */
const tabTarget = (area: NavArea) =>
  (area.items.find((i) => !i.href.endsWith("/new")) ?? area.items[0]).href;

/**
 * Phone navigation, within reach of the thumb (decided by the church 2026-10-20). The bar
 * holds Home and the person's main areas, each going straight to their first page there.
 * More opens a sheet with only the pages the bar doesn't already reach, so nothing is
 * shown twice. Below the md breakpoint; the side rail takes over from there.
 */
export function BottomBar({ areas }: { areas: NavArea[] }) {
  const pathname = usePathname();
  const activeArea = areaForPath(pathname);
  const barAreas = areas.slice(0, BAR_SIZE);
  // What More lists: every page except the ones the bar's buttons open.
  const pinned = new Set(barAreas.map(tabTarget));
  const rest = areas
    .map((area) => ({ ...area, items: area.items.filter((i) => !pinned.has(i.href)) }))
    .filter((area) => area.items.length > 0);

  return (
    <nav
      aria-label={copy.nav.mobileNavigation}
      className="fixed inset-x-0 bottom-0 z-(--z-nav) border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden"
    >
      <ul className="flex">
        {barAreas.map((area) => {
          const active = activeArea === area.id;
          const s = AREA_STYLE[area.id];
          return (
            <li key={area.id} className="flex min-w-0 flex-1">
              <Link
                href={tabTarget(area)}
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
                <span className="truncate">{area.label}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex min-w-0 flex-1">
          <MoreSheet rest={rest} pathname={pathname} />
        </li>
      </ul>
    </nav>
  );
}

/**
 * The pages the bar doesn't reach, grouped by area, plus Help and Privacy, in a bottom sheet.
 * Each area is folded to its heading (decided by the church 2026-10-24): tap one to see its
 * pages. The area of the page you're on starts open.
 */
function MoreSheet({ rest, pathname }: { rest: NavArea[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const onOpenChange = (next: boolean) => {
    if (next) {
      const current = areaForPath(pathname);
      setExpanded(new Set(current && rest.some((a) => a.id === current) ? [current] : []));
    }
    setOpen(next);
  };
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // Any link closes the sheet, including one to the page already open.
  const closeOnLink = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a")) setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
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
          <div className="flex items-center justify-between gap-3 px-4 pt-2 pb-2">
            <Dialog.Title className="text-base font-semibold">{copy.nav.morePages}</Dialog.Title>
            <Dialog.Description className="sr-only">{copy.nav.morePagesHint}</Dialog.Description>
            <Dialog.Close
              aria-label={copy.nav.closeMenu}
              className="grid size-11 shrink-0 place-items-center rounded-full text-fg-muted transition-colors duration-fast hover:bg-surface-hover hover:text-accent"
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="space-y-1 overflow-y-auto px-3 pb-4" onClick={closeOnLink}>
            {rest.map((area) => {
              const isOpen = expanded.has(area.id);
              const listId = `more-${area.id}-pages`;
              return (
                <section key={area.id} aria-labelledby={`more-${area.id}`}>
                  <h3>
                    <button
                      type="button"
                      id={`more-${area.id}`}
                      aria-expanded={isOpen}
                      aria-controls={listId}
                      onClick={() => toggle(area.id)}
                      className="flex min-h-12 w-full items-center gap-3 rounded-[12px] px-2 text-left text-[15px] font-semibold transition-colors duration-fast hover:bg-surface-hover"
                    >
                      <AreaBadge area={area.id} size="sm" />
                      <span className="flex-1">{area.label}</span>
                      <span className="text-xs font-normal text-fg-muted tabular">
                        {area.items.length}
                      </span>
                      <ChevronDown
                        aria-hidden="true"
                        className={cn(
                          "size-4 text-fg-muted transition-transform duration-fast motion-reduce:transition-none",
                          isOpen && "rotate-180",
                        )}
                      />
                    </button>
                  </h3>
                  <ul id={listId} hidden={!isOpen} className="space-y-0.5 pb-2 pl-2">
                    {area.items.map((item) => (
                      <li key={item.href}>
                        <PageLink
                          area={area.id}
                          item={item}
                          active={isActiveHref(pathname, item.href)}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
            <ul className="flex gap-2 border-t border-border px-2 pt-3">
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
