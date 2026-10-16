import Link from "next/link";
import { activityCopy as a } from "@/copy/activity";
import { cn } from "@/lib/cn";

type Tab = "activity" | "access";

/**
 * The Analytics & Audit tabs (DRD 6.13). Access is the System Administrator's only, so
 * other staff don't see it at all; the server refuses it too.
 */
export function AnalyticsTabs({ current, showAccess }: { current: Tab; showAccess: boolean }) {
  const tabs: { id: Tab; href: string; label: string }[] = [
    { id: "activity", href: "/reports/analytics", label: a.tabs.activity },
    ...(showAccess
      ? [{ id: "access" as const, href: "/reports/analytics/access", label: a.tabs.access }]
      : []),
  ];
  return (
    <nav aria-label={a.tabs.label} className="flex gap-1 border-b border-border">
      {tabs.map((tab) => {
        const active = tab.id === current;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm lg:min-h-9",
              active
                ? "border-area-reports font-semibold text-area-reports"
                : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
