import Link from "next/link";
import { History } from "lucide-react";
import { activityCopy as a } from "@/copy/activity";

/** The link to one budget's own activity page (FR-52 "History tab"). */
export function RequestActivityLink({ requestId }: { requestId: string }) {
  return (
    <p>
      <Link
        href={`/annual/${requestId}/activity`}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline lg:min-h-9"
      >
        <History className="size-4" aria-hidden="true" />
        {a.history}
      </Link>
    </p>
  );
}
