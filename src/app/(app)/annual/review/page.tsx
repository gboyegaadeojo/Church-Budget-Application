import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminSkeleton } from "@/components/ui/display";
import { annualCopy } from "@/copy/annual";
import { ReviewDashboardView } from "./dashboard";

const r = annualCopy.review;

export const metadata: Metadata = { title: r.title };

/** Accountant dashboard (FR-13, FR-14, DRD 6.6). */
export default function ReviewDashboardPage({ searchParams }: PageProps<"/annual/review">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <ReviewDashboardView
          searchParams={searchParams}
          path="/annual/review"
          title={r.title}
          intro={r.intro}
        />
      </Suspense>
    </div>
  );
}
