import { Suspense } from "react";
import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { PenLine } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import {
  AdminSkeleton,
  EmptyState,
  PageHeader,
  PermissionDenied,
  Section,
} from "@/components/ui/display";
import { buttonClass, inputClass } from "@/components/ui/styles";
import { spendingCopy } from "@/copy/spending";
import { getDb } from "@/db";
import { recordOptions } from "@/domain/spending/queries";
import { cn } from "@/lib/cn";
import { getViewer } from "@/lib/viewer";
import { BudgetStrip } from "../../expenses/budget-strip";
import { recordEntryAction } from "../actions";
import { EntryFields } from "../entry-fields";

const r = spendingCopy.record;

export const metadata: Metadata = { title: r.title };

/**
 * Record spending (FR-24, DRD 6.8): choose the year and department, see its budget, then
 * enter what was paid. The form stays after saving, cleared, for the next entry.
 */
export default function RecordSpendingPage({ searchParams }: PageProps<"/spending/record">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <RecordContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function RecordContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const one = (k: string) => (typeof query[k] === "string" ? (query[k] as string) : undefined);
  const viewer = await getViewer();
  const options = await recordOptions(getDb(), viewer, {
    cycleId: one("cycle"),
    departmentId: one("department"),
  });
  if (!options) return <PermissionDenied />;
  const cycle = options.cycles.find((c) => c.id === options.cycleId);
  const department = options.departments.find((d) => d.id === options.departmentId);

  return (
    <>
      <PageHeader title={r.title} intro={r.intro} />
      <Section title={r.choose} icon={PenLine} tone="green">
        <form method="get" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <label htmlFor="record-cycle" className="block text-sm font-medium">
              {r.cycle}
            </label>
            <select
              id="record-cycle"
              name="cycle"
              defaultValue={options.cycleId ?? ""}
              className={inputClass}
            >
              {options.cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.locked ? `${c.name} (${r.locked})` : c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="record-department" className="block text-sm font-medium">
              {r.department}
            </label>
            <select
              id="record-department"
              name="department"
              defaultValue={options.departmentId ?? ""}
              className={inputClass}
            >
              <option value="" disabled>
                {r.chooseDepartment}
              </option>
              {options.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={buttonClass("secondary")}>
            {department ? r.change : r.next}
          </button>
        </form>
      </Section>

      {cycle && department && (
        <>
          {options.figures && (
            <BudgetStrip
              department={`${department.name} · ${cycle.name}`}
              figures={options.figures}
            />
          )}
          {cycle.locked ? (
            <EmptyState>{r.lockedNote(cycle.name)}</EmptyState>
          ) : (
            <section className={cn("space-y-4")} aria-labelledby="record-heading">
              <h2 id="record-heading" className="text-lg font-semibold">
                {department.name} · {cycle.name}
              </h2>
              {options.figures?.annualRequestId === null && (
                <p className="text-sm text-warning">{r.noBudget}</p>
              )}
              <ActionForm action={recordEntryAction} resetOnSuccess aria-label={r.title}>
                <input type="hidden" name="cycleId" value={cycle.id} />
                <input type="hidden" name="departmentId" value={department.id} />
                <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                <EntryFields
                  lines={options.lines}
                  period={cycle.period}
                  canAllowOutsideYear={options.canAllowOutsideYear}
                />
                <SubmitButton>{r.save}</SubmitButton>
              </ActionForm>
            </section>
          )}
        </>
      )}
    </>
  );
}
