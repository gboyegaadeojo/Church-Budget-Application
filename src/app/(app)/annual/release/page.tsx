import { Suspense } from "react";
import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { desc } from "drizzle-orm";
import { CalendarClock, CheckCircle2, ChevronDown, Send } from "lucide-react";
import { ActionForm, SubmitButton, TextAreaField, TextField } from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  AdminSkeleton,
  Badge,
  EmptyState,
  PageHeader,
  PermissionDenied,
} from "@/components/ui/display";
import { cardClass, inputClass, buttonClass } from "@/components/ui/styles";
import { annualCopy } from "@/copy/annual";
import { getDb } from "@/db";
import { budgetCycles } from "@/db/schema";
import { getReleaseOverview } from "@/domain/annual/release";
import { getChurchTimeZone } from "@/domain/settings";
import { viewerAllowedTo } from "@/lib/admin-server";
import { cn } from "@/lib/cn";
import { formatDateTime, utcToZonedLocal } from "@/lib/time-zone";
import { cancelReleaseAction, releaseNowAction, scheduleReleaseAction } from "./actions";

const r = annualCopy.release;

export const metadata: Metadata = { title: r.title };

type Search = Record<string, string | string[] | undefined>;

/**
 * Decision release (FR-19a, DRD 6.7b): how the cycle's approvals and declines reach the
 * departments, where the cycle stands, who gets which email at release, and Release now
 * or Cancel schedule. The accountant and backup approver change it; the System
 * Administrator sees it read-only.
 */
export default function ReleasePage({ searchParams }: PageProps<"/annual/release">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <ReleaseContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ReleaseContent({ searchParams }: { searchParams: Promise<Search> }) {
  const viewer = await viewerAllowedTo("annual.review", "/annual/release");
  if (!viewer) return <PermissionDenied />;
  const query = await searchParams;
  const db = getDb();
  const [cycles, zone] = await Promise.all([
    db
      .select({ id: budgetCycles.id, name: budgetCycles.name, status: budgetCycles.status })
      .from(budgetCycles)
      .orderBy(desc(budgetCycles.budgetYear)),
    getChurchTimeZone(db),
  ]);
  const asked = typeof query.cycle === "string" ? query.cycle : undefined;
  const chosen =
    cycles.find((c) => c.id === asked) ?? cycles.find((c) => c.status === "open") ?? cycles[0];
  if (!chosen) {
    return (
      <>
        <PageHeader title={r.title} intro={r.intro} />
        <EmptyState>{r.noCycle}</EmptyState>
      </>
    );
  }
  const overview = await getReleaseOverview(db, viewer, chosen.id);
  if (!overview) return <PermissionDenied />;
  const { cycle, counts, held, holding } = overview;
  const when = cycle.releaseAt ? formatDateTime(cycle.releaseAt, zone) : "";
  const status = holding
    ? r.current.holding(when)
    : cycle.mode === "scheduled" && cycle.releaseAt
      ? r.current.released(when)
      : r.current.immediate;
  // After Release now or Cancel schedule, whose buttons are gone once they've worked.
  const sent = Math.max(0, Number.parseInt(String(query.sent ?? "0"), 10) || 0);
  const done =
    query.done === "released"
      ? r.released(sent)
      : query.done === "cancelled"
        ? r.switchedBack(sent)
        : null;

  return (
    <>
      <PageHeader title={r.title} intro={r.intro} />

      {done && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-control border border-success bg-success/10 p-3 text-sm"
        >
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
          {done}
        </p>
      )}

      {cycles.length > 1 && (
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label htmlFor="release-cycle" className="block text-sm font-medium">
              {r.cycle}
            </label>
            <select
              id="release-cycle"
              name="cycle"
              defaultValue={cycle.id}
              className={cn(inputClass, "w-auto")}
            >
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={buttonClass("secondary")}>
            {r.show}
          </button>
        </form>
      )}

      <section
        aria-labelledby="release-card"
        className={cn(cardClass, "space-y-5", holding && "border-warning")}
      >
        <div className="flex flex-wrap items-start gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-control",
              holding ? "bg-warning/15 text-warning" : "bg-area-annual-soft text-area-annual",
            )}
          >
            {holding ? <CalendarClock className="size-5" /> : <Send className="size-5" />}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="release-card" className="text-lg font-semibold">
                {r.cardHeading}
              </h2>
              <Badge tone={holding ? "warning" : "neutral"}>
                {holding ? r.modes.scheduled : r.modes.immediate}
              </Badge>
            </div>
            <p className="text-sm" role="status">
              {status}
            </p>
            {holding && cycle.message && (
              <p className="text-sm text-fg-muted">
                {r.message}: {cycle.message}
              </p>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={r.progress.approved} value={counts.approved} tone="text-success" />
          <Stat label={r.progress.declined} value={counts.declined} tone="text-danger" />
          <Stat label={r.progress.undecided} value={counts.undecided} tone="text-warning" />
          <Stat label={r.progress.notSubmitted} value={counts.notSubmitted} tone="text-fg-muted" />
        </dl>

        {!overview.canChange ? (
          <p className="text-sm text-fg-muted">{r.readOnly}</p>
        ) : (
          <div className="space-y-4 border-t border-border pt-5">
            {cycle.status === "open" && (
              <ActionForm
                action={scheduleReleaseAction}
                aria-label={r.modes.scheduled}
                className="space-y-4"
              >
                <input type="hidden" name="cycleId" value={cycle.id} />
                <input type="hidden" name="version" value={cycle.version} />
                {!holding && <p className="text-sm text-fg-muted">{r.modeHints.scheduled}</p>}
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    name="releaseAt"
                    type="datetime-local"
                    label={r.releaseAt}
                    hint={r.releaseAtHint(zone)}
                    defaultValue={
                      holding && cycle.releaseAt ? utcToZonedLocal(cycle.releaseAt, zone) : ""
                    }
                    required
                  />
                </div>
                <TextAreaField
                  name="message"
                  label={r.message}
                  hint={r.messageHint}
                  defaultValue={cycle.message ?? ""}
                  rows={2}
                />
                <SubmitButton tone={holding ? "secondary" : "primary"}>
                  {holding ? r.save : r.modes.scheduled}
                </SubmitButton>
              </ActionForm>
            )}

            {holding && (
              <div className="flex flex-wrap gap-3">
                <ActionForm
                  action={releaseNowAction}
                  id="release-now-form"
                  aria-label={r.releaseNow}
                >
                  <input type="hidden" name="cycleId" value={cycle.id} />
                  <input type="hidden" name="version" value={cycle.version} />
                  <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                  <ConfirmDialog
                    formId="release-now-form"
                    trigger={r.releaseNow}
                    triggerTone="primary"
                    title={r.releaseNowTitle(held.length)}
                    body={r.releaseNowBody}
                    confirmLabel={r.releaseNow}
                  />
                </ActionForm>
                <ActionForm
                  action={cancelReleaseAction}
                  id="cancel-release-form"
                  aria-label={r.cancel}
                >
                  <input type="hidden" name="cycleId" value={cycle.id} />
                  <input type="hidden" name="version" value={cycle.version} />
                  <ConfirmDialog
                    formId="cancel-release-form"
                    trigger={r.cancel}
                    title={r.cancelTitle}
                    body={r.cancelBody(held.length)}
                    confirmLabel={r.cancel}
                  />
                </ActionForm>
              </div>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="release-preview" className={cn(cardClass, "space-y-4")}>
        <h2 id="release-preview" className="text-lg font-semibold">
          {r.preview.heading}
        </h2>
        {held.length === 0 ? (
          <p className="text-sm text-fg-muted">{r.preview.none}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{r.preview.heading}</caption>
              <thead className="border-b border-border text-fg-muted">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {r.preview.department}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {r.preview.email}
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    {r.preview.to}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {held.map((h) => (
                  <tr key={h.requestId}>
                    <td className="py-2 pr-4 font-medium">{h.department}</td>
                    <td className="py-2 pr-4">
                      <Badge tone={h.decision === "approved" ? "success" : "danger"}>
                        {r.preview[h.decision]}
                      </Badge>
                    </td>
                    <td className="py-2 text-fg-muted">{r.preview.leaders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(overview.undecided.length > 0 || overview.notSubmitted.length > 0) && (
          <div className="grid gap-4 border-t border-border pt-4 text-sm sm:grid-cols-2">
            <Outstanding heading={r.outstanding.undecided} names={overview.undecided} />
            <Outstanding heading={r.outstanding.notSubmitted} names={overview.notSubmitted} />
            <p className="text-fg-muted sm:col-span-2">{r.outstanding.note}</p>
          </div>
        )}
      </section>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-control border border-border bg-surface-2 p-3">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className={cn("tabular text-2xl font-semibold", tone)}>{value}</dd>
    </div>
  );
}

/** Departments still to decide or submit, folded behind their count. */
function Outstanding({ heading, names }: { heading: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold [&::-webkit-details-marker]:hidden">
        {heading} ({names.length})
        <ChevronDown
          aria-hidden="true"
          className="size-4 text-fg-muted transition-transform group-open:rotate-180"
        />
      </summary>
      <ul className="list-disc space-y-0.5 pl-5 text-fg-muted">
        {names.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </details>
  );
}
