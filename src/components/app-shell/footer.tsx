import { Suspense } from "react";
import Link from "next/link";
import { copy } from "@/copy/en-CA";
import { FOOTER_LINKS } from "@/domain/navigation";
import { currentBrandView } from "./live-brand";

async function ChurchName() {
  return (await currentBrandView()).churchName;
}

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border px-4 py-6 text-sm text-fg-muted lg:px-8 print:hidden">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>
          <Suspense fallback={copy.app.churchName}>
            <ChurchName />
          </Suspense>{" "}
          · {copy.app.footerNote}
        </p>
        <nav aria-label={copy.nav.footerNavigation}>
          <ul className="flex gap-1">
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-11 items-center rounded-control px-3 text-fg underline-offset-4 hover:underline lg:min-h-9"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
