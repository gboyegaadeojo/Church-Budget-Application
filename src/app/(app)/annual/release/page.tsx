import { Suspense } from "react";
import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { desc } from "drizzle-orm";
import { CalendarClock, CheckCircle2, ChevronDown, Send, ListChecks } from "lucide-react";
import { ActionForm, SubmitButton, TextAreaField, TextField } from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  AdminSkeleton,
  Badge,
  EmptyState,
  PageHeader,
  PermissionDenied,
  IconChip,
} from "@/components/ui/display";
import { TONE, type Tone } from "@/components/ui/tone";
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
  // The release time has passed but the job hasn't sent everything yet.
  const overdue = !holding && held.length > 0;
  const waiting = holding || overdue;
  const status = holding
    ? r.current.holding(when)
    : overdue
      ? r.current.overdue(when, held.length)
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
        className={cn(cardClass, "space-y-5", waiting && "border-warning")}
      >
        <div className="flex flex-wrap items-start gap-3">
          <IconChip icon={waiting ? CalendarClock : Send} tone={waiting ? "amber" : "blue"} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="release-card"
                className="text-[17px] leading-tight font-semibold tracking-tight"
              >
                {r.cardHeading}
              </h2>
              <Badge tone={waiting ? "warning" : "neutral"}>
                {waiting ? r.modes.scheduled : r.modes.immediate}
              </Badge>
            </div>
            <p className="text-sm" role="status">
              {status}
            </p>
            {waiting && cycle.message && (
              <p className="text-sm text-fg-muted">
                {r.message}: {cycle.message}
              </p>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={r.progress.approved} value={counts.approved} tone="green" />
          <Stat label={r.progress.declined} value={counts.declined} tone="red" />
          <Stat label={r.progress.undecided} value={counts.undecided} tone="amber" />
          <Stat label={r.progress.notSubmitted} value={counts.notSubmitted} tone="slate" />
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
                {!waiting && <p className="text-sm text-fg-muted">{r.modeHints.immediate}</p>}
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

            {waiting && (
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
        <div className="flex items-center gap-3">
          <IconChip icon={ListChecks} tone="violet" />
          <h2
            id="release-preview"
            className="text-[17px] leading-tight font-semibold tracking-tight"
          >
            {r.preview.heading}
          </h2>
        </div>
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

/** One count, on its own tint, so approved, declined and waiting read apart at a glance. */
function Stat({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div className={cn("rounded-[14px] p-4", TONE[tone].soft)}>
      <dt className="text-xs font-medium text-fg-muted">{label}</dt>
      <dd className={cn("tabular text-[28px] leading-tight font-semibold", TONE[tone].text)}>
        {value}
      </dd>
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
