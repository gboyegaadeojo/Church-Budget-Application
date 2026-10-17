import { FlaskConical } from "lucide-react";
import { copy } from "@/copy/en-CA";
import { demoMode } from "@/lib/auth-mode";
import { cn } from "@/lib/cn";

/** On the demo site only: a band on every page so nobody mistakes it for the real app. */
export function DemoBanner({ className }: { className?: string }) {
  if (!demoMode()) return null;
  return (
    <div
      role="note"
      className={cn(
        "flex items-center justify-center gap-2 border-b border-border bg-area-spending-soft px-4 py-1.5 text-center text-sm font-medium text-area-spending",
        className,
      )}
    >
      <FlaskConical className="size-4 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-bold">{copy.demo.bannerLabel}:</span> {copy.demo.banner}
      </span>
    </div>
  );
}
