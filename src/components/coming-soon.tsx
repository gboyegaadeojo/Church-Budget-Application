import type { Metadata } from "next";
import Link from "next/link";
import { Hammer } from "lucide-react";
import { copy } from "@/copy/en-CA";
import { labelForHref } from "@/domain/navigation";

/*
 * Placeholder for a navigation link whose page is not built yet. Each placeholder is
 * its own route file so unknown paths stay real 404s; a feature replaces the file.
 */

function titleFor(href: string): string {
  const label = labelForHref(href);
  if (!label) throw new Error(`No navigation entry for ${href}`);
  return label;
}

export function comingSoonMetadata(href: string): Metadata {
  return { title: titleFor(href) };
}

export function ComingSoon({ href }: { href: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{titleFor(href)}</h1>
      <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface px-6 py-12 text-center shadow-card">
        <Hammer className="size-8 text-fg-muted" aria-hidden="true" />
        <p className="text-lg font-medium">{copy.comingSoon.title}</p>
        <p className="max-w-md text-sm text-fg-muted">{copy.comingSoon.body}</p>
        <Link
          href="/"
          className="mt-2 inline-flex min-h-11 items-center rounded-control border border-border-strong px-4 text-sm font-medium transition-colors duration-fast hover:bg-surface-hover lg:min-h-10"
        >
          {copy.comingSoon.backHome}
        </Link>
      </div>
    </div>
  );
}
