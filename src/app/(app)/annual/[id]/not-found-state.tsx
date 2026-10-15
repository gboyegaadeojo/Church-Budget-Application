import Link from "next/link";
import { SearchX } from "lucide-react";
import { buttonClass, cardClass } from "@/components/ui/styles";
import { annualCopy } from "@/copy/annual";
import { cn } from "@/lib/cn";

/**
 * A request that doesn't exist and one the viewer may not see look the same, so the
 * page never confirms that a request exists (AC-3).
 */
export function RequestNotFound() {
  return (
    <div className={cn(cardClass, "flex items-start gap-3")}>
      <SearchX className="mt-1 size-6 shrink-0 text-fg-muted" aria-hidden="true" />
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">{annualCopy.errors.notFound}</h1>
        <Link href="/annual" className={buttonClass("secondary")}>
          {annualCopy.confirmation.backToDashboard}
        </Link>
      </div>
    </div>
  );
}
