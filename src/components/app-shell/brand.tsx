import { Church } from "lucide-react";
import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";

/** Logo mark plus names. The logo becomes administrator-managed in Stage 2 (FR-30). */
export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-3", className)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-control bg-accent text-on-accent">
        <Church className="size-5" aria-hidden="true" />
      </span>
      {!compact && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold">{copy.app.appName}</span>
          <span className="block truncate text-xs text-fg-muted">{copy.app.churchName}</span>
        </span>
      )}
    </span>
  );
}
