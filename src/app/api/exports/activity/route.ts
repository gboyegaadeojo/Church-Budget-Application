import { connection } from "next/server";
import { auth } from "@/auth";
import { exportsCopy } from "@/copy/exports";
import { getDb } from "@/db";
import { activityFiltersFrom, allActivity } from "@/domain/analytics/activity";
import { emailBrand } from "@/domain/notifications/notice";
import { getBrand, rasterLogo } from "@/domain/settings/brand";
import { getChurchTimeZone } from "@/domain/settings";
import { loadViewer } from "@/domain/users/viewer";
import { writeAudit } from "@/lib/audit";
import { authorize } from "@/lib/authz";
import { activityWorkbook } from "@/lib/excel/activity-workbook";
import { zonedDate } from "@/lib/time-zone";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Exports the filtered activity log (FR-52, AC-126) with the same filters as the page,
 * limited to what the person may see. The export is itself audited.
 */
export async function GET(request: Request) {
  await connection();
  const userId = (await auth())?.user?.id;
  if (!userId) return Response.json({ message: exportsCopy.download.denied }, { status: 401 });
  const db = getDb();
  const loaded = await loadViewer(db, userId);
  if (!loaded.ok) return Response.json({ message: exportsCopy.download.denied }, { status: 403 });
  const viewer = loaded.viewer;
  const access = authorize(viewer, "analytics.view");
  if (!access.allowed) {
    return Response.json({ message: exportsCopy.download.denied }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const filters = activityFiltersFrom((k) => params.get(k) ?? undefined);
  const now = new Date();
  const { body, fileName } = await db.transaction(async (tx) => {
    const items = await allActivity(tx, viewer, filters, { now });
    const zone = await getChurchTimeZone(tx);
    const filterLabels = [...params.entries()]
      .filter(([k, v]) => k !== "page" && v)
      .map(([k, v]) => `${k} ${v}`);
    const fileName = `Activity_${zonedDate(now, zone)}.xlsx`;
    await writeAudit(tx, {
      actor: { kind: "user", userId: viewer.id, actingRole: access.actingRole },
      area: "admin",
      eventType: "admin.activity_exported",
      entity: { type: "page", id: "/reports/analytics" },
      details: { fileName, events: items.length, filters: Object.fromEntries(params.entries()) },
    });
    const body = await activityWorkbook({
      brand: await emailBrand(tx),
      logo: await rasterLogo(tx, await getBrand(tx)),
      generatedAt: now,
      zone,
      filterLabels,
      items,
    });
    return { body, fileName };
  });
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
