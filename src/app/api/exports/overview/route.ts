import { connection } from "next/server";
import { auth } from "@/auth";
import { exportsCopy } from "@/copy/exports";
import { getDb } from "@/db";
import { getOverview } from "@/domain/analytics/overview";
import { emailBrand } from "@/domain/notifications/notice";
import { getBrand, rasterLogo } from "@/domain/settings/brand";
import { getChurchTimeZone } from "@/domain/settings";
import { loadViewer } from "@/domain/users/viewer";
import { writeAudit } from "@/lib/audit";
import { authorize } from "@/lib/authz";
import { overviewWorkbook } from "@/lib/excel/overview-workbook";
import { fileNamePart } from "@/lib/excel/safe";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Exports the Overview tab's figures for one cycle (FR-52), for people who may review
 * annual budgets. The figures are the same as on the page. The export is audited.
 */
export async function GET(request: Request) {
  await connection();
  const userId = (await auth())?.user?.id;
  if (!userId) return Response.json({ message: exportsCopy.download.denied }, { status: 401 });
  const db = getDb();
  const loaded = await loadViewer(db, userId);
  if (!loaded.ok) return Response.json({ message: exportsCopy.download.denied }, { status: 403 });
  const viewer = loaded.viewer;
  const access = authorize(viewer, "annual.review");
  if (!access.allowed || !authorize(viewer, "analytics.view").allowed) {
    return Response.json({ message: exportsCopy.download.denied }, { status: 403 });
  }

  const cycleId = new URL(request.url).searchParams.get("cycle") ?? undefined;
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const overview = await getOverview(tx, viewer, { cycleId, now });
    if (!overview?.cycle) return null;
    const fileName = `${fileNamePart(overview.cycle.name)}_Overview.xlsx`;
    await writeAudit(tx, {
      actor: { kind: "user", userId: viewer.id, actingRole: access.actingRole },
      area: "annual",
      eventType: "annual.overview_exported",
      entity: { type: "budget_cycle", id: overview.cycle.id },
      cycleId: overview.cycle.id,
      details: { fileName },
    });
    const body = await overviewWorkbook({
      brand: await emailBrand(tx),
      logo: await rasterLogo(tx, await getBrand(tx)),
      generatedAt: now,
      zone: await getChurchTimeZone(tx),
      overview,
    });
    return { body, fileName };
  });
  if (!result) return Response.json({ message: exportsCopy.download.denied }, { status: 404 });
  return new Response(new Uint8Array(result.body), {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
