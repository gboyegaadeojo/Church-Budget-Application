import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminSkeleton, PermissionDenied } from "@/components/ui/display";
import { expensesCopy } from "@/copy/expenses";
import { getDb } from "@/db";
import { boardQueue } from "@/domain/expenses/review-queries";
import { getViewer } from "@/lib/viewer";
import { filtersFrom, QueueView } from "../review/queue-view";

const r = expensesCopy.review;

export const metadata: Metadata = { title: r.boardTitle };

/** "Awaiting my approval" for the Board Chair and Vice-Chair (6B.4 level 2). */
export default function BoardQueuePage({ searchParams }: PageProps<"/expenses/awaiting-approval">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <BoardQueueContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function BoardQueueContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = filtersFrom(await searchParams);
  const viewer = await getViewer();
  const queue = await boardQueue(getDb(), viewer, filters);
  if (!queue) return <PermissionDenied />;
  return (
    <QueueView
      title={r.boardTitle}
      intro={r.boardIntro}
      queue={queue}
      filters={filters}
      statuses={["awaiting_board"]}
      basePath="/expenses/awaiting-approval"
    />
  );
}
