import { connection } from "next/server";
import { auth } from "@/auth";
import { exportsCopy } from "@/copy/exports";
import { getDb } from "@/db";
import { buildAnnualExport } from "@/domain/annual/export";
import { RuleError } from "@/domain/errors";
import { loadViewer } from "@/domain/users/viewer";
import { writeAudit } from "@/lib/audit";
import { ForbiddenError } from "@/lib/authz";
import { annualWorkbook } from "@/lib/excel/annual-workbook";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Downloads the annual budget workbook (FR-20): ?cycle=&department=&status=&request=.
 * The filters are ids and a status name, never data. The workbook is built inside the
 * transaction that audits the export, so a failed export leaves no "exported" record.
 */
export async function GET(request: Request) {
  await connection();
  const userId = (await auth())?.user?.id;
  if (!userId) return Response.json({ message: exportsCopy.download.denied }, { status: 401 });
  const db = getDb();
  const loaded = await loadViewer(db, userId);
  if (!loaded.ok) return Response.json({ message: exportsCopy.download.denied }, { status: 403 });
  const viewer = loaded.viewer;

  const params = new URL(request.url).searchParams;
  const get = (key: string) => params.get(key) ?? undefined;
  try {
    const { fileName, body } = await db.transaction(async (tx) => {
      const data = await buildAnnualExport(tx, viewer, {
        cycleId: get("cycle"),
        departmentId: get("department"),
        status: get("status"),
        requestId: get("request"),
      });
      return { fileName: data.fileName, body: await annualWorkbook(data) };
    });
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": XLSX,
        "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      await writeAudit(db, {
        actor: { kind: "user", userId: viewer.id },
        area: "access",
        eventType: "access.denied",
        entity: { type: "page", id: "/api/exports/annual" },
        details: { action: error.action, roles: viewer.roles },
      });
      return Response.json({ message: exportsCopy.download.denied }, { status: 403 });
    }
    if (error instanceof RuleError) {
      return Response.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }
}
