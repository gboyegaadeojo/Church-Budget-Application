import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminSkeleton, PageHeader, PermissionDenied } from "@/components/ui/display";
import { adminCopy } from "@/copy/admin";
import { getDb } from "@/db";
import { listCycles } from "@/domain/cycles/queries";
import { getChurchTimeZone, readSettings } from "@/domain/settings";
import { viewerAllowedTo } from "@/lib/admin-server";
import { CreateCycleForm, CycleList } from "./cycle-sections";

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
      <CycleList cycles={cycles} zone={zone} linked />
      <CreateCycleForm nextYear={nextYear} zone={zone} taxRate={sales_tax_rate} />
    </>
  );
}
