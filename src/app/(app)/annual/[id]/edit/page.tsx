import { Suspense } from "react";
import type { Metadata } from "next";
import { History } from "lucide-react";
import { redirect } from "next/navigation";
import { AdminSkeleton } from "@/components/ui/display";
import { annualCopy } from "@/copy/annual";
import { getDb } from "@/db";
import { getRequestView } from "@/domain/annual/queries";
import { centsToInput } from "@/domain/annual/schema";
import { canTransition } from "@/domain/annual/status";
import { getViewer } from "@/lib/viewer";
import { RequestNotFound } from "../not-found-state";
import { RequestEditor, type EditorMode } from "./request-editor";

export const metadata: Metadata = { title: annualCopy.form.titleEdit };

/**
 * Steps 1 to 3 of the annual form (DRD 6.3 to 6.5) for a draft, a revision of a
 * submitted request (FR-12) or a clarification response (FR-17).
 */
export default function EditPage({ params, searchParams }: PageProps<"/annual/[id]/edit">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <EditContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function EditContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const viewer = await getViewer();
  const request = await getRequestView(getDb(), viewer, id);
  if (!request) return <RequestNotFound />;

  // A held decision (FR-19a) has locked the request, though it still reads In Review.
  const mode: EditorMode | null =
    request.readOnly || request.heldUntil
      ? null
      : request.status === "draft"
        ? "draft"
        : request.status === "returned"
          ? "respond"
          : canTransition(request.status, "revise") && request.editsRemaining > 0
            ? "revise"
            : null;
  if (!mode) redirect(`/annual/${id}`);

  // FR-35: a draft just copied from last year's request.
  const copied = query.from === "last-year" && mode === "draft";
  return (
    <>
      {copied && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-control border border-info bg-surface p-3 text-sm"
        >
          <History aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info" />
          {annualCopy.start.copiedNote}
        </p>
      )}
      <RequestEditor
        mode={mode}
        request={{
          id: request.id,
          version: request.version,
          departmentName: request.department.name,
          departmentProposed: request.department.status === "proposed",
          cycleName: request.cycle.name,
          requesterName: request.requesterName,
          alsoEditing: request.representatives.filter((r) => r.id !== viewer.id).map((r) => r.name),
          editsRemaining: request.editsRemaining,
          rate: request.rate,
          totals: request.totals,
          question: request.decision?.kind === "returned" ? request.decision.reason : null,
        }}
        initial={{
          title: request.title,
          justification: request.justification,
          lines: request.lines.map((line) => ({
            name: line.name,
            quantity: String(line.quantity),
            unitPrice: centsToInput(line.unitPriceCents),
            link: line.link ?? "",
            notes: line.notes ?? "",
          })),
        }}
      />
    </>
  );
}
