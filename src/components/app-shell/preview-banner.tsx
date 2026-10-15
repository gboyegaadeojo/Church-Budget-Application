import { Info } from "lucide-react";
import { copy } from "@/copy/en-CA";

/** Shown until sign-in exists (docs/decisions.md, "Temporary preview user"). */
export function PreviewBanner() {
  return (
    <div
      role="note"
      className="flex items-start gap-2 border-b border-border bg-accent-soft px-4 py-2 text-sm text-fg lg:px-8"
    >
      <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
      <p>
        <span className="font-semibold">{copy.app.previewLabel}. </span>
        {copy.app.previewBanner}
      </p>
    </div>
  );
}
