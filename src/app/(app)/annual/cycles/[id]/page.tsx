import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminSkeleton, PermissionDenied } from "@/components/ui/display";
import { adminCopy } from "@/copy/admin";
import { viewerAllowedTo } from "@/lib/admin-server";
import { CycleDetail } from "../../../admin/cycles/cycle-detail";

const c = adminCopy.cycles;

export const metadata: Metadata = { title: c.title };

/** Annual Budget → Budget cycles → one cycle, for those who manage cycles (2026-10-17). */
export default function StaffCyclePage({ params }: PageProps<"/annual/cycles/[id]">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <StaffCycleContent params={params} />
      </Suspense>
    </div>
  );
}

async function StaffCycleContent({ params }: Pick<PageProps<"/annual/cycles/[id]">, "params">) {
  const viewer = await viewerAllowedTo("cycles.manage", "/annual/cycles");
  if (!viewer) return <PermissionDenied />;
  const { id } = await params;
  return <CycleDetail id={id} back={{ href: "/annual/cycles", label: c.back }} />;
}
