import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminSkeleton } from "@/components/ui/display";
import { annualCopy } from "@/copy/annual";
import { ReviewDashboardView } from "../review/dashboard";

const r = annualCopy.review;

export const metadata: Metadata = { title: r.allTitle };

/** All budgets for the System Administrator: the accountant dashboard, read-only (3.5). */
export default function AllBudgetsPage({ searchParams }: PageProps<"/annual/all">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <ReviewDashboardView
          searchParams={searchParams}
          path="/annual/all"
          title={r.allTitle}
          intro={r.allIntro}
        />
      </Suspense>
    </div>
  );
}
