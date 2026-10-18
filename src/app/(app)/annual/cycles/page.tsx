import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminSkeleton, PageHeader, PermissionDenied } from "@/components/ui/display";
import { adminCopy } from "@/copy/admin";
import { getDb } from "@/db";
import { listCycles } from "@/domain/cycles/queries";
import { getChurchTimeZone, readSettings } from "@/domain/settings";
import { viewerAllowedTo } from "@/lib/admin-server";
import { CreateCycleForm, CycleList } from "../../admin/cycles/cycle-sections";

const c = adminCopy.cycles;

export const metadata: Metadata = { title: c.title };

/**
 * Annual Budget → Budget cycles: the accountant, backup approvers, the Board Chair and
 * the Vice-Chair create budget years (decided 2026-10-17). Opening, closing and deadlines
 * stay in Admin → Budget Cycles.
 */
export default function StaffCyclesPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <StaffCyclesContent />
      </Suspense>
    </div>
  );
}

async function StaffCyclesContent() {
  const viewer = await viewerAllowedTo("cycles.create", "/annual/cycles");
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
      <PageHeader title={c.title} intro={c.staffIntro} />
      <CycleList cycles={cycles} zone={zone} hrefFor={(id) => `/annual/cycles/${id}`} />
      <CreateCycleForm nextYear={nextYear} zone={zone} taxRate={sales_tax_rate} />
    </>
  );
}
