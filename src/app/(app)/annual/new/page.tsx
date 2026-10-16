import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminSkeleton, PageHeader, PermissionDenied } from "@/components/ui/display";
import { cardClass } from "@/components/ui/styles";
import { annualCopy } from "@/copy/annual";
import { getDb } from "@/db";
import { departmentPicker, getOpenCycle } from "@/domain/annual/queries";
import { authorize } from "@/lib/authz";
import { getViewerAllowingWaiting } from "@/lib/viewer";
import { StartForm } from "./start-form";

const s = annualCopy.start;

export const metadata: Metadata = { title: s.title };

/**
 * Step 1 of the annual form (DRD 6.3): choose the department. A verified Group Leader
 * with no department yet can come here from the waiting screen (FR-03, FR-38).
 */
export default function StartPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <StartContent />
      </Suspense>
    </div>
  );
}

async function StartContent() {
  const viewer = await getViewerAllowingWaiting();
  if (!authorize(viewer, "annual.start").allowed)
    return <PermissionDenied body={annualCopy.deniedBody} />;
  const db = getDb();
  const cycle = await getOpenCycle(db);
  if (!cycle) {
    return (
      <>
        <PageHeader title={s.title} back={{ href: "/annual", label: annualCopy.dashboard.title }} />
        <div className={cardClass}>
          <h2 className="text-lg font-semibold">{s.noCycleTitle}</h2>
          <p className="text-sm text-fg-muted">{s.noCycleBody}</p>
        </div>
      </>
    );
  }
  const picker = await departmentPicker(db, viewer, cycle.id);
  const waiting = viewer.departments.length === 0;

  return (
    <>
      <PageHeader
        title={s.title}
        intro={waiting ? s.waitingNote : s.intro}
        back={waiting ? undefined : { href: "/annual", label: annualCopy.dashboard.title }}
      />
      <StartForm cycle={{ id: cycle.id, name: cycle.name }} {...picker} />
    </>
  );
}
