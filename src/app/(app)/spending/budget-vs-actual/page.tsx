import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminSkeleton, PermissionDenied } from "@/components/ui/display";
import { spendingCopy } from "@/copy/spending";
import { getDb } from "@/db";
import { spendingDashboard } from "@/domain/spending/dashboard";
import { getChurchTimeZone } from "@/domain/settings";
import { getViewer } from "@/lib/viewer";
import { DashboardView } from "../dashboard-view";

const d = spendingCopy.dashboard;

export const metadata: Metadata = { title: d.readOnlyTitle };

/** Budget vs actual (FR-25, DRD 6.0): the same figures as the spending dashboard, view only for the board and the System Administrator. */
export default function BudgetVsActualPage({
  searchParams,
}: PageProps<"/spending/budget-vs-actual">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <DashboardContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function DashboardContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const viewer = await getViewer();
  const db = getDb();
  const dashboard = await spendingDashboard(
    db,
    viewer,
    typeof query.cycle === "string" ? query.cycle : undefined,
  );
  if (!dashboard) return <PermissionDenied />;
  return (
    <DashboardView
      dashboard={dashboard}
      basePath="/spending/budget-vs-actual"
      title={d.readOnlyTitle}
      intro={dashboard.readOnly ? d.readOnlyIntro : d.intro}
      zone={await getChurchTimeZone(db)}
    />
  );
}
