"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { copy } from "@/copy/en-CA";
import { breadcrumbsFor } from "@/domain/navigation";

/** Breadcrumbs above the page heading (DRD 6.0), from the address. */
export function Breadcrumbs() {
  const crumbs = breadcrumbsFor(usePathname());
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label={copy.nav.breadcrumbs} className="mb-4 text-sm text-fg-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {crumbs.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5" aria-hidden="true" />}
            {c.href ? (
              <Link
                href={c.href}
                className="inline-flex min-h-11 items-center underline-offset-4 hover:text-fg hover:underline lg:min-h-0"
              >
                {c.label}
              </Link>
            ) : (
              <span>{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
