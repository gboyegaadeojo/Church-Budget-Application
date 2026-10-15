import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/action-form";
import {
  AdminSkeleton,
  Badge,
  EmptyState,
  PageHeader,
  PermissionDenied,
  Section,
} from "@/components/ui/display";
import { linkClass } from "@/components/ui/styles";
import { adminCopy } from "@/copy/admin";
import { getDb } from "@/db";
import { listCycles } from "@/domain/cycles/queries";
import { getChurchTimeZone, readSettings } from "@/domain/settings";
import { viewerAllowedTo } from "@/lib/admin-server";
import { formatCAD, taxRateToPercent } from "@/lib/money";
import { formatDateTime } from "@/lib/time-zone";
import { createCycleAction } from "./actions";
import { CYCLE_TONE } from "./tones";

const c = adminCopy.cycles;

export const metadata: Metadata = { title: c.title };

/** Admin → Budget Cycles (Requirements 4, DRD 6.11). */
export default function CyclesPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <CyclesContent />
      </Suspense>
    </div>
  );
}

async function CyclesContent() {
  const viewer = await viewerAllowedTo("admin.cycles", "/admin/cycles");
  if (!viewer) return <PermissionDenied />;
  const db = getDb();
  const [cycles, zone, { sales_tax_rate }] = await Promise.all([
    listCycles(db),
    getChurchTimeZone(db),
    readSettings(db, ["sales_tax_rate"]),
  ]);
  const nextYear = (cycles[0]?.budgetYear ?? new Date().getFullYear()) + 1;

  return (
    <>
      <PageHeader title={c.title} />
      <Section title={c.title} id="cycle-list">
        {cycles.length === 0 ? (
          <EmptyState>{c.empty}</EmptyState>
        ) : (
          <div
            className="-mx-1 overflow-x-auto px-1"
            tabIndex={0}
            role="region"
            aria-label={c.title}
          >
            <table className="w-full min-w-[36rem] text-left text-sm">
              <caption className="sr-only">{c.title}</caption>
              <thead className="border-b border-border text-xs text-fg-muted">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {c.columns.name}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {c.columns.status}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {c.columns.deadline}
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    {c.boardTotal}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cycles.map((cycle) => (
                  <tr key={cycle.id}>
                    <td className="py-3 pr-4">
                      <Link href={`/admin/cycles/${cycle.id}`} className={linkClass}>
                        {cycle.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={CYCLE_TONE[cycle.status]}>{c.statusLabels[cycle.status]}</Badge>
                    </td>
                    <td className="py-3 pr-4">{formatDateTime(cycle.submissionDeadline, zone)}</td>
                    <td className="tabular py-3">
                      {cycle.boardTotalCents === null
                        ? adminCopy.common.none
                        : formatCAD(cycle.boardTotalCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={c.createHeading} id="create-cycle">
        <ActionForm action={createCycleAction} resetOnSuccess aria-label={c.createHeading}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="name"
              label={c.name}
              hint={c.nameHint}
              defaultValue={`FY${nextYear}`}
              required
            />
            <TextField
              name="budgetYear"
              type="number"
              inputMode="numeric"
              label={c.budgetYear}
              defaultValue={String(nextYear)}
              required
            />
            <TextField
              name="startDate"
              type="date"
              label={c.startDate}
              defaultValue={`${nextYear}-01-01`}
              required
            />
            <TextField
              name="submissionDeadline"
              type="datetime-local"
              label={c.deadline}
              hint={c.deadlineHint(zone)}
              required
            />
            <TextField
              name="taxRatePercent"
              inputMode="decimal"
              label={c.taxRate}
              hint={c.taxRateHint}
              defaultValue={taxRateToPercent(sales_tax_rate)}
              required
            />
            <TextField name="boardTotal" inputMode="decimal" label={c.boardTotal} />
            <TextField name="boardReference" label={c.boardReference} />
          </div>
          <SubmitButton>{c.create}</SubmitButton>
        </ActionForm>
      </Section>
    </>
  );
}
