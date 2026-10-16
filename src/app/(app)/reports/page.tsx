import { Suspense } from "react";
import type { Metadata } from "next";
import { asc, desc, ne } from "drizzle-orm";
import { AdminSkeleton, EmptyState, PageHeader, Section } from "@/components/ui/display";
import { exportsCopy } from "@/copy/exports";
import { annualCopy } from "@/copy/annual";
import { getDb } from "@/db";
import { budgetCycles, departments } from "@/db/schema";
import { labelForHref } from "@/domain/navigation";
import { authorize } from "@/lib/authz";
import { getViewer } from "@/lib/viewer";
import { AnnualExportForm } from "./annual-export-form";

const p = exportsCopy.page;
const title = labelForHref("/reports") ?? p.title;

export const metadata: Metadata = { title };

/** Reports & exports (FR-20, DRD 6.10): what each workbook holds, then the filters. */
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
  if (!canExportAnnual) {
    return (
      <>
        <PageHeader title={title} />
        <EmptyState>{p.nothingForYou}</EmptyState>
      </>
    );
  }

  const db = getDb();
  const [cycles, departmentRows] = await Promise.all([
    db
      .select({
        id: budgetCycles.id,
        name: budgetCycles.name,
        status: budgetCycles.status,
      })
      .from(budgetCycles)
      .orderBy(desc(budgetCycles.budgetYear), desc(budgetCycles.createdAt)),
    db
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .where(ne(departments.status, "rejected"))
      .orderBy(asc(departments.name)),
  ]);
  const cycleStatus = annualCopy.review.cycleStatus as Record<string, string>;
  const defaultCycle = cycles.find((c) => c.status === "open") ?? cycles[0];

  return (
    <>
      <PageHeader title={title} intro={p.intro} />
      <Section title={p.annualHeading} description={p.annualIntro} id="annual-export">
        {!defaultCycle ? (
          <EmptyState>{p.noCycles}</EmptyState>
        ) : (
          <>
            <div className="space-y-2 text-sm">
              <h3 className="font-semibold">{p.sheetsHeading}</h3>
              <ul className="list-disc space-y-1 pl-5 text-fg-muted">
                {p.sheets.map((sheet) => (
                  <li key={sheet.name}>
                    <span className="font-medium text-fg">{sheet.name}:</span> {sheet.columns}
                  </li>
                ))}
              </ul>
            </div>
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
      </Section>
      <Section title={p.laterHeading} id="later-reports">
        <p className="text-sm text-fg-muted">{p.later}</p>
      </Section>
    </>
  );
}
