import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, ne } from "drizzle-orm";
import { ArrowRight, ChevronDown, History } from "lucide-react";
import { AREA_STYLE, AreaIcon } from "@/components/app-shell/area-icon";
import { AdminSkeleton, EmptyState, PageHeader } from "@/components/ui/display";
import { buttonClass, cardClass } from "@/components/ui/styles";
import { exportsCopy } from "@/copy/exports";
import { annualCopy } from "@/copy/annual";
import { getDb } from "@/db";
import { budgetCycles, departments } from "@/db/schema";
import { labelForHref, type AreaId } from "@/domain/navigation";
import { authorize } from "@/lib/authz";
import { cn } from "@/lib/cn";
import { getViewer } from "@/lib/viewer";
import { AnnualExportForm } from "./annual-export-form";

const p = exportsCopy.page;
const title = labelForHref("/reports") ?? p.title;

export const metadata: Metadata = { title };

/**
 * Reports & exports (FR-20, DRD 6.10): one card per report in its area's colour, each
 * saying what it holds before the download. Reports still to come are shown, greyed, with
 * the stage that brings them.
 */
export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <ReportsContent />
      </Suspense>
    </div>
  );
}

async function ReportsContent() {
  const viewer = await getViewer();
  const canExportAnnual = authorize(viewer, "annual.export_all").allowed;
  const seesActivity = authorize(viewer, "analytics.view").allowed;

  const db = getDb();
  const [cycles, departmentRows] = canExportAnnual
    ? await Promise.all([
        db
          .select({ id: budgetCycles.id, name: budgetCycles.name, status: budgetCycles.status })
          .from(budgetCycles)
          .orderBy(desc(budgetCycles.budgetYear), desc(budgetCycles.createdAt)),
        db
          .select({ id: departments.id, name: departments.name })
          .from(departments)
          .where(ne(departments.status, "rejected"))
          .orderBy(asc(departments.name)),
      ])
    : [[], []];
  const cycleStatus = annualCopy.review.cycleStatus as Record<string, string>;
  const defaultCycle = cycles.find((c) => c.status === "open") ?? cycles[0];

  return (
    <>
      <PageHeader title={title} intro={p.intro} />
      {!canExportAnnual && <p className="text-sm text-fg-muted">{p.nothingForYou}</p>}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {canExportAnnual && (
          <ReportCard
            id="annual-export"
            area="annual"
            title={p.annualHeading}
            intro={p.annualIntro}
            className="md:col-span-2 xl:col-span-3"
          >
            {!defaultCycle ? (
              <EmptyState>{p.noCycles}</EmptyState>
            ) : (
              <>
                <details className="group rounded-control border border-border text-sm">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 font-medium [&::-webkit-details-marker]:hidden">
                    {p.sheetsHeading}
                    <ChevronDown
                      aria-hidden="true"
                      className="ml-auto size-4 text-fg-muted transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <ul className="list-disc space-y-1 border-t border-border py-3 pr-3 pl-8 text-fg-muted">
                    {p.sheets.map((sheet) => (
                      <li key={sheet.name}>
                        <span className="font-medium text-fg">{sheet.name}:</span> {sheet.columns}
                      </li>
                    ))}
                  </ul>
                </details>
                <AnnualExportForm
                  cycles={cycles.map((c) => ({
                    id: c.id,
                    label: `${c.name} (${cycleStatus[c.status] ?? c.status})`,
                  }))}
                  departments={departmentRows}
                  defaultCycleId={defaultCycle.id}
                />
              </>
            )}
          </ReportCard>
        )}

        {seesActivity && (
          <ReportCard
            id="activity-report"
            area="reports"
            icon={<History aria-hidden="true" className="size-5" />}
            title={p.activityHeading}
            intro={p.activityIntro}
          >
            <Link href="/reports/analytics" className={cn(buttonClass("secondary"), "gap-2")}>
              {p.activityOpen}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </ReportCard>
        )}

        {p.later.map((report) => (
          <ReportCard
            key={report.area}
            id={`${report.area}-report`}
            area={report.area}
            title={report.title}
            intro={report.intro}
            soon={report.stage}
          />
        ))}
      </div>
    </>
  );
}

/** One report: its area's icon tile and title, what it holds, then its controls. */
function ReportCard({
  id,
  area,
  icon,
  title,
  intro,
  soon,
  className,
  children,
}: {
  id: string;
  area: AreaId;
  icon?: React.ReactNode;
  title: string;
  intro: string;
  /** Not built yet: shown greyed with the stage that brings it. */
  soon?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const style = AREA_STYLE[area];
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className={cn(
        cardClass,
        "flex flex-col gap-4",
        soon && "bg-surface-2 shadow-none",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-control",
            soon ? "bg-surface text-fg-muted" : cn(style.soft, style.text),
          )}
        >
          {icon ?? <AreaIcon area={area} className="size-5" />}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`${id}-heading`} className="text-lg font-semibold">
              {title}
            </h2>
            {soon && (
              <span className="rounded-full border border-border-strong px-2 py-0.5 text-xs text-fg-muted">
                {soon}
              </span>
            )}
          </div>
          <p className="text-sm text-fg-muted">{intro}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
