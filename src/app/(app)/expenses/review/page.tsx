import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminSkeleton, PermissionDenied } from "@/components/ui/display";
import { expensesCopy } from "@/copy/expenses";
import { getDb } from "@/db";
import { ACCOUNTANT_QUEUE, accountantQueue } from "@/domain/expenses/review-queries";
import { getViewer } from "@/lib/viewer";
import { filtersFrom, QueueView } from "./queue-view";

const r = expensesCopy.review;

export const metadata: Metadata = { title: r.queueTitle };

/** The accountant's expense review queue (6B.4 level 1, FR-48). */
export default function ReviewQueuePage({ searchParams }: PageProps<"/expenses/review">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <QueueContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function QueueContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = filtersFrom(await searchParams);
  const viewer = await getViewer();
  const queue = await accountantQueue(getDb(), viewer, filters);
  if (!queue) return <PermissionDenied />;
  return (
    <QueueView
      title={r.queueTitle}
      intro={r.queueIntro}
      queue={queue}
      filters={filters}
      statuses={ACCOUNTANT_QUEUE}
      basePath="/expenses/review"
    />
  );
}
