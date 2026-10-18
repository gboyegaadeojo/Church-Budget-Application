import { CalendarPlus, CalendarRange } from "lucide-react";
import Link from "next/link";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/action-form";
import { Badge, EmptyState, Section } from "@/components/ui/display";
import { linkClass } from "@/components/ui/styles";
import { adminCopy } from "@/copy/admin";
import type { listCycles } from "@/domain/cycles/queries";
import { formatCAD, taxRateToPercent } from "@/lib/money";
import { formatDateTime } from "@/lib/time-zone";
import { createCycleAction } from "./actions";
import { CYCLE_TONE } from "./tones";

const c = adminCopy.cycles;

type Cycles = Awaited<ReturnType<typeof listCycles>>;

/**
 * The cycles and the form for a new one, shared by Admin → Budget Cycles and Annual
 * Budget → Budget cycles (finance and board staff create cycles; decided 2026-10-17).
 * `hrefFor` links each cycle to its page, where it's edited, opened, closed and extended.
 */
export function CycleList({
  cycles,
  zone,
  hrefFor,
}: {
  cycles: Cycles;
  zone: string;
  hrefFor?: (id: string) => string;
}) {
  return (
    <>
      <Section title={c.title} id="cycle-list" icon={CalendarRange} tone="blue">
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
                      {hrefFor ? (
                        <Link href={hrefFor(cycle.id)} className={linkClass}>
                          {cycle.name}
                        </Link>
                      ) : (
                        cycle.name
                      )}
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
    </>
  );
}

export function CreateCycleForm({
  nextYear,
  zone,
  taxRate,
}: {
  nextYear: number;
  zone: string;
  taxRate: string;
}) {
  return (
    <Section title={c.createHeading} id="create-cycle" icon={CalendarPlus} tone="violet">
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
            defaultValue={taxRateToPercent(taxRate)}
            required
          />
          <TextField name="boardTotal" inputMode="decimal" label={c.boardTotal} />
          <TextField name="boardReference" label={c.boardReference} />
        </div>
        <SubmitButton>{c.create}</SubmitButton>
      </ActionForm>
    </Section>
  );
}
