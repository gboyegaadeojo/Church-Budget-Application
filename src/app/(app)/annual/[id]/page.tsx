import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { ComparisonSummary, FinancialSummary } from "@/components/financial-summary";
import { AdminSkeleton, PageHeader } from "@/components/ui/display";
import { buttonClass, cardClass } from "@/components/ui/styles";
import { annualCopy } from "@/copy/annual";
import { copy } from "@/copy/en-CA";
import { getDb } from "@/db";
import { getRequestView, type RequestView } from "@/domain/annual/queries";
import { formatCAD, lineTotal } from "@/lib/money";
import { canTransition } from "@/domain/annual/status";
import { getChurchTimeZone } from "@/domain/settings";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";
import { LinesTable } from "../lines-table";
import { AnnualStatusBadge, statusExplanation } from "../status-badge";
import { RequestNotFound } from "./not-found-state";

const v = annualCopy.view;
const c = annualCopy.confirmation;
const f = annualCopy.form;

export const metadata: Metadata = { title: f.titleEdit };

const DONE = ["submitted", "revised", "responded"] as const;
type Done = (typeof DONE)[number];

/** One request, read-only, with the confirmation after submitting or changing it (DRD 6.3). */
export default function RequestPage({ params, searchParams }: PageProps<"/annual/[id]">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <RequestContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function RequestContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const viewer = await getViewer();
  const db = getDb();
  const [request, zone] = await Promise.all([
    getRequestView(db, viewer, id),
    getChurchTimeZone(db),
  ]);
  if (!request) return <RequestNotFound />;
  const done = DONE.find((d) => d === query.done);

  return (
    <>
      <PageHeader
        title={request.title || annualCopy.dashboard.untitled}
        back={{ href: "/annual", label: annualCopy.dashboard.title }}
      >
        <AnnualStatusBadge status={request.status} />
      </PageHeader>

      {done && <Confirmation done={done} request={request} zone={zone} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <article className={cn(cardClass, "min-w-0 space-y-6")}>
          <p className="text-sm text-fg-muted">
            {statusExplanation(request.status, request.editsRemaining)}
          </p>
          {request.decision && <DecisionNote request={request} />}
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Item label={f.department}>
              {request.department.name}
              {request.department.status === "proposed" && (
                <span className="block text-xs font-normal text-fg-muted">{f.proposedLabel}</span>
              )}
            </Item>
            <Item label={f.cycle}>{request.cycle.name}</Item>
            <Item label={annualCopy.preview.requester}>{request.requesterName}</Item>
            {request.referenceNumber && <Item label={v.reference}>{request.referenceNumber}</Item>}
            {request.submittedAt && (
              <Item label={v.submittedOn}>{formatDateTime(request.submittedAt, zone)}</Item>
            )}
            {request.versionNumber > 0 && (
              <Item label={v.versionLabel}>{v.version(request.versionNumber)}</Item>
            )}
          </dl>
          {request.justification && (
            <section className="space-y-1">
              <h2 className="text-sm font-semibold">{f.justification}</h2>
              <p className="text-sm whitespace-pre-line">{request.justification}</p>
            </section>
          )}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">{v.lines}</h2>
            {request.lines.length === 0 ? (
              <p className="text-sm text-fg-muted">{v.noLines}</p>
            ) : (
              <LinesTable
                caption={v.lines}
                lines={request.lines.map((l) => ({
                  name: l.name,
                  quantity: l.quantity.toLocaleString("en-CA"),
                  unitPriceCents: l.unitPriceCents,
                  totalCents: lineTotal(l.quantity, l.unitPriceCents),
                  link: l.link,
                  notes: l.notes,
                }))}
              />
            )}
          </section>
        </article>

        <aside aria-label={f.summary} className={cn(cardClass, "space-y-4 lg:sticky lg:top-20")}>
          <FinancialSummary totals={request.totals} rate={request.rate} heading={f.summary} />
          <Actions request={request} />
        </aside>
      </div>
    </>
  );
}

/**
 * What the accountant decided, for the department (FR-17, FR-18, FR-19): the question,
 * the decline reason, or the approved amounts beside what was asked.
 */
function DecisionNote({ request }: { request: RequestView }) {
  const decision = request.decision!;
  const r = annualCopy.review;
  return (
    <section
      aria-labelledby="decision-heading"
      className={cn(
        "space-y-2 rounded-control border p-4",
        decision.kind === "returned" && "border-warning",
        decision.kind === "declined" && "border-danger",
        decision.kind === "approved" && "border-success",
      )}
    >
      <h2 id="decision-heading" className="text-sm font-semibold">
        {v.decisionHeading[decision.kind]}
      </h2>
      {decision.kind === "approved" && decision.approved && (
        <ComparisonSummary
          requested={request.totals}
          approved={decision.approved}
          rate={request.rate}
          labels={{
            requested: r.requested,
            approved: r.approved,
            difference: r.difference,
            less: r.differenceLess,
            more: r.differenceMore,
            none: r.differenceNone,
          }}
        />
      )}
      {decision.reason && (
        <p className="text-sm whitespace-pre-line">
          {decision.kind === "approved" && (
            <span className="text-fg-muted">{v.accountantNote}: </span>
          )}
          {decision.reason}
        </p>
      )}
      {decision.boardReference && (
        <p className="text-sm text-fg-muted">
          {r.boardReference}: {decision.boardReference}
        </p>
      )}
    </section>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/** What the department can do next, if anything (FR-05, FR-12, FR-17). */
function Actions({ request }: { request: RequestView }) {
  if (request.readOnly) return <p className="text-sm text-fg-muted">{v.readOnly}</p>;
  const edit = `/annual/${request.id}/edit`;
  if (request.status === "draft") {
    return (
      <Link href={edit} className={buttonClass("primary", "w-full")}>
        {v.continueDraft}
      </Link>
    );
  }
  if (request.status === "returned") {
    return (
      <Link href={edit} className={buttonClass("primary", "w-full")}>
        {v.respond}
      </Link>
    );
  }
  if (!canTransition(request.status, "revise")) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm text-fg-muted">
        {request.editsRemaining > 0 ? v.editsLeft(request.editsRemaining) : v.noEditsLeft}
      </p>
      {request.editsRemaining > 0 && (
        <Link href={edit} className={buttonClass("secondary", "w-full")}>
          {v.edit}
        </Link>
      )}
    </div>
  );
}

function Confirmation({ done, request, zone }: { done: Done; request: RequestView; zone: string }) {
  return (
    <section
      aria-labelledby="confirmation-heading"
      className={cn(cardClass, "flex items-start gap-3 border-success")}
    >
      <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" />
      <div className="space-y-1 text-sm">
        <h2 id="confirmation-heading" className="text-lg font-semibold">
          {c[done]}
        </h2>
        {request.referenceNumber && (
          <p>
            {v.reference}: <span className="font-medium">{request.referenceNumber}</span>
          </p>
        )}
        {done === "submitted" && request.submittedAt && (
          <p className="text-fg-muted">{formatDateTime(request.submittedAt, zone)}</p>
        )}
        <p>
          {copy.money.total}:{" "}
          <span className="tabular font-semibold">{formatCAD(request.totals.total)}</span>
        </p>
        <p>{c.receipt}</p>
        <p className="text-fg-muted">{c.editsRemaining(request.editsRemaining)}</p>
      </div>
    </section>
  );
}
