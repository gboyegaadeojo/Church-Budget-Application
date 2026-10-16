import { Suspense } from "react";
import type { Metadata } from "next";
import { ActivityTable } from "@/components/activity-table";
import { AdminSkeleton, PageHeader } from "@/components/ui/display";
import { activityCopy as a } from "@/copy/activity";
import { annualCopy } from "@/copy/annual";
import { getDb } from "@/db";
import { listActivity } from "@/domain/analytics/activity";
import { getRequestView } from "@/domain/annual/queries";
import { getChurchTimeZone } from "@/domain/settings";
import { authorize } from "@/lib/authz";
import { getViewer } from "@/lib/viewer";
import { RequestNotFound } from "../not-found-state";

export const metadata: Metadata = { title: a.history };

/**
 * One budget's own activity (FR-52: "Each item's own History tab shows the same events
 * for that item only"). Who may open it follows the budget's own page; what it lists
 * follows the activity log's role rules.
 */
export default function RequestActivityPage({ params }: PageProps<"/annual/[id]/activity">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <Content params={params} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  const db = getDb();
  const request = await getRequestView(db, viewer, id);
  if (!request) return <RequestNotFound />;
  const [{ items }, zone] = await Promise.all([
    listActivity(db, viewer, { requestId: id }, { pageSize: 200 }),
    getChurchTimeZone(db),
  ]);
  const reviews = authorize(viewer, "annual.review").allowed && request.status !== "draft";
  return (
    <>
      <PageHeader
        title={request.title || annualCopy.dashboard.untitled}
        intro={[request.referenceNumber, request.department.name, a.historyIntro]
          .filter(Boolean)
          .join(" · ")}
        back={{
          href: reviews ? `/annual/review/${id}` : `/annual/${id}`,
          label: request.referenceNumber ?? request.title,
        }}
      />
      {items.length === 0 ? (
        <p className="text-sm text-fg-muted">{a.historyEmpty}</p>
      ) : (
        <ActivityTable
          items={items}
          viewer={viewer}
          zone={zone}
          caption={a.history}
          showItem={false}
        />
      )}
    </>
  );
}
