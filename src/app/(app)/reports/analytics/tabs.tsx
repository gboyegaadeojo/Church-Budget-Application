import Link from "next/link";
import { activityCopy as a } from "@/copy/activity";
import { cn } from "@/lib/cn";

type Tab = "overview" | "activity" | "access";

/**
 * The Analytics & Audit tabs (DRD 6.13). Access is the System Administrator's only, so
 * other staff don't see it at all; the server refuses it too.
 */
export function AnalyticsTabs({ current, showAccess }: { current: Tab; showAccess: boolean }) {
  const tabs: { id: Tab; href: string; label: string }[] = [
    { id: "overview", href: "/reports/analytics/overview", label: a.tabs.overview },
    { id: "activity", href: "/reports/analytics", label: a.tabs.activity },
    ...(showAccess
      ? [{ id: "access" as const, href: "/reports/analytics/access", label: a.tabs.access }]
      : []),
  ];
  return (
    // A segmented control: the current tab is a raised pill on a soft track.
    <nav
      aria-label={a.tabs.label}
      className="inline-flex max-w-full gap-1 overflow-x-auto rounded-[12px] bg-surface-2 p-1"
    >
      {tabs.map((tab) => {
        const active = tab.id === current;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center rounded-[9px] px-4 text-sm whitespace-nowrap transition-colors duration-fast lg:min-h-9",
              active
                ? "bg-surface font-semibold text-area-reports shadow-card"
                : "text-fg-muted hover:bg-surface/60 hover:text-fg",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
