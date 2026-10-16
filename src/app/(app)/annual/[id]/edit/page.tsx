import { Suspense } from "react";
import type { Metadata } from "next";
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
export default function EditPage({ params }: PageProps<"/annual/[id]/edit">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <EditContent params={params} />
      </Suspense>
    </div>
  );
}

async function EditContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  const request = await getRequestView(getDb(), viewer, id);
  if (!request) return <RequestNotFound />;

  const mode: EditorMode | null = request.readOnly
    ? null
    : request.status === "draft"
      ? "draft"
      : request.status === "returned"
        ? "respond"
        : canTransition(request.status, "revise") && request.editsRemaining > 0
          ? "revise"
          : null;
  if (!mode) redirect(`/annual/${id}`);

  return (
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
  );
}
