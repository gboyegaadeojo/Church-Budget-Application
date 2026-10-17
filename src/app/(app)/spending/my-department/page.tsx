import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminSkeleton, EmptyState, PageHeader, PermissionDenied } from "@/components/ui/display";
import { buttonClass, inputClass } from "@/components/ui/styles";
import { annualCopy } from "@/copy/annual";
import { spendingCopy } from "@/copy/spending";
import { getDb } from "@/db";
import { myDepartmentSpending } from "@/domain/spending/my-department";
import { cn } from "@/lib/cn";
import { getViewer } from "@/lib/viewer";
import { MyDepartmentPanel } from "../my-department-panel";

const d = spendingCopy.dashboard;
const m = spendingCopy.mine;

export const metadata: Metadata = { title: m.title };

/** My department's budget (FR-28, AC-89, DRD 6.2a): read-only, every entry, any year. */
export default function MyDepartmentPage({ searchParams }: PageProps<"/spending/my-department">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <MyDepartmentContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function MyDepartmentContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const viewer = await getViewer();
  const cycleId = typeof query.cycle === "string" ? query.cycle : undefined;
  const view = await myDepartmentSpending(getDb(), viewer, cycleId);
  if (!view) return <PermissionDenied body={annualCopy.deniedBody} />;
  const { cycle } = view;

  return (
    <>
      <PageHeader title={m.title} intro={m.intro} />

      {view.cycles.length > 1 && (
        <form
          method="get"
          action="/spending/my-department"
          className="flex flex-wrap items-end gap-3"
        >
          <div className="space-y-1.5">
            <label htmlFor="my-budget-cycle" className="block text-sm font-medium">
              {d.cycle}
            </label>
            <select
              id="my-budget-cycle"
              name="cycle"
              defaultValue={cycle?.id ?? ""}
              className={cn(inputClass, "w-48")}
            >
              {view.cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={buttonClass("secondary")}>
            {d.show}
          </button>
        </form>
      )}

      {!cycle ? (
        <EmptyState>{d.noCycle}</EmptyState>
      ) : view.departments.length === 0 ? (
        <EmptyState>{m.noDepartment}</EmptyState>
      ) : (
        view.departments.map((b) => (
          <MyDepartmentPanel key={b.departmentId} budget={b} cycleId={cycle.id} />
        ))
      )}
    </>
  );
}
