import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckCircle2, Eye, ShieldAlert } from "lucide-react";
import { DownloadButton } from "@/components/download-button";
import { EmailHistory } from "@/components/email-history";
import { ComparisonSummary, FinancialSummary } from "@/components/financial-summary";
import { AdminSkeleton, PageHeader } from "@/components/ui/display";
import { cardClass, linkClass } from "@/components/ui/styles";
import { annualCopy } from "@/copy/annual";
import { getDb } from "@/db";
import { getReviewView, type ReviewView } from "@/domain/annual/review-queries";
import { describeChange, revisionChanges } from "@/domain/annual/revision-diff";
import { isHttpUrl } from "@/domain/annual/schema";
import { requestEmails } from "@/domain/notifications/history";
import { getChurchTimeZone } from "@/domain/settings";
import { viewerAllowedTo } from "@/lib/admin-server";
import { authorize } from "@/lib/authz";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import { formatDateTime } from "@/lib/time-zone";
import { RequestNotFound } from "../../[id]/not-found-state";
import { AnnualStatusBadge } from "../../status-badge";
import { DecisionPanel, ReopenControl, StartReview } from "./decision-panel";

const r = annualCopy.review;
const f = annualCopy.form;

export const metadata: Metadata = { title: r.detailsHeading };

const comparisonLabels = {
  requested: r.requested,
  approved: r.approved,
  difference: r.difference,
  less: r.differenceLess,
  more: r.differenceMore,
  none: r.differenceNone,
};

/** The accountant review screen (FR-15 to FR-18a, DRD 6.7). */
export default function ReviewPage({ params, searchParams }: PageProps<"/annual/review/[id]">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <ReviewContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ReviewContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const viewer = await viewerAllowedTo("annual.review", `/annual/review/${id}`);
  if (!viewer) return <RequestNotFound />;
  const db = getDb();
  const [view, zone] = await Promise.all([getReviewView(db, viewer, id), getChurchTimeZone(db)]);
  if (!view) return <RequestNotFound />;
  const emails = await requestEmails(db, id);
  const done = typeof query.done === "string" ? r.done[query.done] : undefined;
  const approvedTotals = view.approval
    ? {
        subtotal: view.approval.subtotalCents,
        tax: view.approval.taxCents,
        total: view.approval.totalCents,
      }
    : null;

  return (
    <>
      {view.canDecide && (view.status === "submitted" || view.status === "updated") && (
        <StartReview id={view.id} />
      )}
      <PageHeader
        title={view.title || annualCopy.dashboard.untitled}
        intro={`${view.referenceNumber} · ${view.department.name}`}
        back={{ href: "/annual/review", label: r.back }}
      >
        <AnnualStatusBadge status={view.status} />
        {authorize(viewer, "annual.export_all").allowed && (
          <DownloadButton href={`/api/exports/annual?request=${view.id}`} />
        )}
      </PageHeader>

      {done && (
        <section
          aria-labelledby="done-heading"
          className={cn(cardClass, "flex items-start gap-3 border-success")}
        >
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" />
          <div className="space-y-1 text-sm">
            <h2 id="done-heading" className="text-lg font-semibold">
              {done}
            </h2>
            <p className="text-fg-muted">{r.emailLater}</p>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          <article className={cn(cardClass, "space-y-6")}>
            <h2 className="text-lg font-semibold">{r.detailsHeading}</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Item label={f.department}>{view.department.name}</Item>
              <Item label={f.cycle}>{view.cycle.name}</Item>
              <Item label={annualCopy.preview.requester}>{view.requesterName}</Item>
              {view.submittedAt && (
                <Item label={annualCopy.view.submittedOn}>
                  {formatDateTime(view.submittedAt, zone)}
                </Item>
              )}
              <Item label={annualCopy.view.versionLabel}>
                {annualCopy.view.version(view.versionNumber)}
              </Item>
              <Item label={r.editsLabel}>{annualCopy.view.editsLeft(view.editsRemaining)}</Item>
            </dl>
            <section className="space-y-1">
              <h3 className="text-sm font-semibold">{f.justification}</h3>
              <p className="text-sm whitespace-pre-line">{view.justification}</p>
            </section>
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">{r.linesHeading}</h3>
              <ReviewLines view={view} />
            </section>
          </article>
        </div>

        <aside className="space-y-6">
          <section aria-label={f.summary} className={cn(cardClass, "space-y-4")}>
            {approvedTotals ? (
              <>
                <h2 className="text-sm font-semibold text-fg-muted">{r.approvalHeading}</h2>
                <ComparisonSummary
                  requested={view.totals}
                  approved={approvedTotals}
                  rate={view.rate}
                  labels={comparisonLabels}
                />
                <ApprovalNote view={view} zone={zone} />
              </>
            ) : (
              <FinancialSummary totals={view.totals} rate={view.rate} heading={r.requested} />
            )}
            {view.canReopen && <ReopenControl id={view.id} version={view.version} />}
          </section>

          <div className={cardClass}>
            {view.canDecide ? (
              <DecisionPanel
                id={view.id}
                version={view.version}
                rate={view.rate}
                requested={view.totals}
                lines={view.lines.map((l) => ({
                  id: l.id,
                  name: l.name,
                  quantity: l.quantity,
                  unitPriceCents: l.unitPriceCents,
                }))}
              />
            ) : (
              <Blocked view={view} />
            )}
          </div>
        </aside>
      </div>

      {/* After the decision on a phone, so the controls come right after the request. */}
      <History view={view} zone={zone} />
      <EmailHistory emails={emails} zone={zone} />
    </>
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

/** Why there are no decision controls: conflict of interest, view only, or nothing to decide. */
function Blocked({ view }: { view: ReviewView }) {
  if (view.blockedReason === "conflict_of_interest") {
    return (
      <p className="flex items-start gap-2 text-sm">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        {r.conflict}
      </p>
    );
  }
  if (view.readOnly && view.blockedReason) {
    return (
      <p className="flex items-start gap-2 text-sm text-fg-muted">
        <Eye className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {r.readOnly}
      </p>
    );
  }
  return <p className="text-sm text-fg-muted">{r.notDecidable}</p>;
}

function ApprovalNote({ view, zone }: { view: ReviewView; zone: string }) {
  const a = view.approval!;
  return (
    <div className="space-y-1 border-t border-border pt-3 text-sm">
      <p className="text-fg-muted">
        {r.approvedBy(a.approverName, formatDateTime(a.approvedAt, zone))}
      </p>
      {a.adjustmentCents !== null && (
        <p>
          <span className="text-fg-muted">{r.adjustment}: </span>
          <span className="tabular">{formatCAD(a.adjustmentCents)}</span>
        </p>
      )}
      {a.boardReference && (
        <p>
          <span className="text-fg-muted">{r.boardReference}: </span>
          {a.boardReference}
        </p>
      )}
      {a.note && <p className="whitespace-pre-line">{a.note}</p>}
    </div>
  );
}

/**
 * Requested items, and once approved the approved values beside them. A changed value
 * shows what was asked struck through (DRD 6.7, FR-15).
 */
function ReviewLines({ view }: { view: ReviewView }) {
  const approvedById = new Map(view.approval?.lines.map((l) => [l.lineId, l]) ?? []);
  const showApproved = view.approval !== null;
  const th = "py-2 pr-4 text-xs font-medium text-fg-muted";
  return (
    <div
      className="relative -mx-1 overflow-x-auto px-1"
      tabIndex={0}
      role="region"
      aria-label={r.linesCaption}
    >
      <table className="w-full min-w-[34rem] text-left text-sm">
        <caption className="sr-only">{r.linesCaption}</caption>
        <thead className="border-b border-border">
          <tr>
            <th scope="col" className={th}>
              {r.columnsLines.item}
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              {r.columnsLines.qty}
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              {r.columnsLines.price}
            </th>
            <th scope="col" className={cn(th, "text-right")}>
              {showApproved ? `${r.requested}` : r.columnsLines.total}
            </th>
            {showApproved && (
              <th scope="col" className={cn(th, "pr-0 text-right")}>
                {r.approved}
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {view.lines.map((line) => {
            const approved = approvedById.get(line.id);
            const changed = approved && approved.lineTotalCents !== line.lineTotalCents;
            return (
              <tr key={line.id}>
                <td className="py-2 pr-4 align-top">
                  <span className="font-medium">{line.name}</span>
                  {line.link && isHttpUrl(line.link) && (
                    <a
                      href={line.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(linkClass, "block text-xs")}
                    >
                      {new URL(line.link).hostname}
                    </a>
                  )}
                  {line.notes && (
                    <span className="block text-xs whitespace-pre-line text-fg-muted">
                      {line.notes}
                    </span>
                  )}
                  {approved?.reason && (
                    <span className="block text-xs text-fg-muted">{approved.reason}</span>
                  )}
                </td>
                <td className="tabular py-2 pr-4 text-right align-top">
                  {line.quantity.toLocaleString("en-CA")}
                  {changed && approved.quantity !== null && approved.quantity !== line.quantity && (
                    <span className="block text-xs font-medium text-accent">
                      → {approved.quantity.toLocaleString("en-CA")}
                    </span>
                  )}
                </td>
                <td className="tabular py-2 pr-4 text-right align-top">
                  {formatCAD(line.unitPriceCents)}
                  {changed &&
                    approved.unitPriceCents !== null &&
                    approved.unitPriceCents !== line.unitPriceCents && (
                      <span className="block text-xs font-medium text-accent">
                        → {formatCAD(approved.unitPriceCents)}
                      </span>
                    )}
                </td>
                <td
                  className={cn(
                    "tabular py-2 pr-4 text-right align-top",
                    changed && "text-fg-muted line-through",
                  )}
                >
                  {formatCAD(line.lineTotalCents)}
                </td>
                {showApproved && (
                  <td className="tabular py-2 text-right align-top font-medium">
                    {!approved
                      ? "—"
                      : approved.lineTotalCents === 0
                        ? r.excluded
                        : formatCAD(approved.lineTotalCents)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Each submitted version with what changed from the one before, and every decision. */
function History({ view, zone }: { view: ReviewView; zone: string }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section aria-labelledby="history-heading" className={cn(cardClass, "space-y-3")}>
        <h2 id="history-heading" className="text-lg font-semibold">
          {r.historyHeading}
        </h2>
        <ol className="space-y-4">
          {view.revisions.map((rev, i) => {
            const previous = view.revisions[i + 1];
            const changes = previous ? revisionChanges(previous.snapshot, rev.snapshot) : [];
            return (
              <li key={rev.number} className="space-y-1 text-sm">
                <p className="font-medium">
                  {r.revisionBy(
                    rev.number,
                    r.revisionKinds[rev.kind],
                    rev.editedBy,
                    formatDateTime(rev.createdAt, zone),
                  )}
                </p>
                {previous && (
                  <ul className="list-inside list-disc text-fg-muted">
                    {changes.length === 0 ? (
                      <li>{r.changes.none}</li>
                    ) : (
                      changes.map((change, j) => <li key={j}>{describeChange(change)}</li>)
                    )}
                    {previous.totalCents !== rev.totalCents && (
                      <li>
                        {r.changes.total(formatCAD(previous.totalCents), formatCAD(rev.totalCents))}
                      </li>
                    )}
                  </ul>
                )}
                {!previous && <p className="tabular text-fg-muted">{formatCAD(rev.totalCents)}</p>}
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="decisions-heading" className={cn(cardClass, "space-y-3")}>
        <h2 id="decisions-heading" className="text-lg font-semibold">
          {r.decisionsHeading}
        </h2>
        {view.decisions.length === 0 ? (
          <p className="text-sm text-fg-muted">{r.noDecisions}</p>
        ) : (
          <ol className="space-y-4">
            {view.decisions.map((d) => (
              <li key={d.id} className="space-y-1 text-sm">
                <p className="font-medium">
                  {r.decisionBy(
                    r.decisionLabels[d.decision] ?? d.decision,
                    d.approverName,
                    formatDateTime(d.createdAt, zone),
                    d.revisionNumber,
                  )}
                </p>
                {d.approvedTotalCents !== null && (
                  <p className="tabular">{formatCAD(d.approvedTotalCents)}</p>
                )}
                {d.boardReference && (
                  <p className="text-fg-muted">
                    {r.boardReference}: {d.boardReference}
                  </p>
                )}
                {d.reason && <p className="whitespace-pre-line text-fg-muted">{d.reason}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
