import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminSkeleton, PermissionDenied } from "@/components/ui/display";
import { adminCopy } from "@/copy/admin";
import { viewerAllowedTo } from "@/lib/admin-server";
import { CycleDetail } from "../cycle-detail";

const c = adminCopy.cycles;

export const metadata: Metadata = { title: c.title };

export default function CyclePage({ params }: PageProps<"/admin/cycles/[id]">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <CycleContent params={params} />
      </Suspense>
    </div>
  );
}

async function CycleContent({ params }: Pick<PageProps<"/admin/cycles/[id]">, "params">) {
  const viewer = await viewerAllowedTo("admin.cycles", "/admin/cycles");
  if (!viewer) return <PermissionDenied />;
  const { id } = await params;
  return <CycleDetail id={id} back={{ href: "/admin/cycles", label: c.title }} />;
}
