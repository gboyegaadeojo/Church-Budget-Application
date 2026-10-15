"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ChevronDown, Eye } from "lucide-react";
import { copy } from "@/copy/en-CA";
import {
  areaForPath,
  isActiveHref,
  singlePage,
  type AreaId,
  type NavArea,
  type NavItem,
} from "@/domain/navigation";
import { cn } from "@/lib/cn";
import { AREA_STYLE, AreaBadge } from "./area-icon";

/**
 * The full navigation as an accordion (DRD 6.0, 5.5), used by the desktop sidebar and
 * the phone's More sheet. Areas with one page are plain links; the others open one at
 * a time, starting with the area of the current page, so the list stays short.
 */
export function NavTree({ areas, pathname }: { areas: NavArea[]; pathname: string }) {
  const activeArea = areaForPath(pathname);
  const [open, setOpen] = useState<AreaId | null>(activeArea);
  // Follow navigation: moving to another area opens it (adjusting state during render).
  const [shownFor, setShownFor] = useState(activeArea);
  if (shownFor !== activeArea) {
    setShownFor(activeArea);
    setOpen(activeArea);
  }

  return (
    <ul className="space-y-1">
      {areas.map((area) => {
        const single = singlePage(area);
        return (
          <li key={area.id}>
            {single ? (
              <AreaLink area={area.id} item={single} active={isActiveHref(pathname, single.href)} />
            ) : (
              <AreaGroup
                area={area}
                pathname={pathname}
                open={open === area.id}
                current={activeArea === area.id}
                onToggle={() => setOpen((o) => (o === area.id ? null : area.id))}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

const rowClass =
  "group flex min-h-11 w-full items-center gap-3 rounded-control px-2 text-sm font-medium transition-colors duration-fast ease-standard lg:min-h-10";

function AreaLink({ area, item, active }: { area: AreaId; item: NavItem; active: boolean }) {
  const s = AREA_STYLE[area];
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(rowClass, active ? cn(s.soft, s.text) : "text-fg hover:bg-surface-hover")}
    >
      <AreaBadge area={area} className={cn(active && "bg-surface")} />
      <span className="flex-1 truncate">{item.label}</span>
      <ViewOnly show={item.viewOnly} />
    </Link>
  );
}

function AreaGroup({
  area,
  pathname,
  open,
  current,
  onToggle,
}: {
  area: NavArea;
  pathname: string;
  open: boolean;
  current: boolean;
  onToggle: () => void;
}) {
  const id = useId();
  const s = AREA_STYLE[area.id];
  return (
    // The open group reads as one tinted panel, so its pages are clearly its own.
    <div
      className={cn(
        "rounded-card transition-colors duration-standard ease-standard",
        open && s.panel,
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className={cn(rowClass, open ? s.text : "text-fg hover:bg-surface-hover")}
      >
        <AreaBadge area={area.id} className={cn(open && "bg-surface")} />
        <span className="flex-1 truncate text-left">{area.label}</span>
        {/* A dot on a closed group that holds the current page, so it's never lost. */}
        {current && !open && (
          <span aria-hidden="true" className={cn("size-2 rounded-full", s.bar)} />
        )}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-fg-muted transition-transform duration-standard ease-standard",
            open && "rotate-180",
          )}
        />
      </button>

      {/*
        Height animates with grid rows. Closing makes the pages inert at once (out of the
        tab order while they slide shut), then invisible.
      */}
      <div
        id={id}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows,visibility] duration-standard ease-standard",
          open ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <ul
            aria-label={copy.nav.areaPages(area.label)}
            className={cn("my-1 mr-2 ml-[1.625rem] space-y-0.5 border-l-2 pb-1 pl-2", s.ring)}
          >
            {area.items.map((item, i) => (
              <li
                key={item.href}
                className={cn(open && "animate-rise-in")}
                style={open ? { animationDelay: `${i * 30}ms` } : undefined}
              >
                <PageLink area={area.id} item={item} active={isActiveHref(pathname, item.href)} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** A page inside an area: smaller, indented, with a dot that takes the area's colour. */
export function PageLink({
  area,
  item,
  active,
  className,
}: {
  area: AreaId;
  item: NavItem;
  active: boolean;
  className?: string;
}) {
  const s = AREA_STYLE[area];
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-2.5 rounded-control px-2.5 text-sm transition-colors duration-fast ease-standard lg:min-h-9",
        active
          ? cn("bg-surface font-medium shadow-card", s.text)
          : "text-fg-muted hover:bg-surface hover:text-fg",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full transition-transform duration-fast",
          active ? cn(s.bar, "scale-150") : "bg-border-strong",
        )}
      />
      <span className="flex-1 truncate">{item.label}</span>
      <ViewOnly show={item.viewOnly} />
    </Link>
  );
}

export function ViewOnly({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-1.5 py-0.5 text-xs text-fg-muted">
      <Eye className="size-3.5" aria-hidden="true" />
      <span className="sr-only">{copy.nav.viewOnly}</span>
    </span>
  );
}
