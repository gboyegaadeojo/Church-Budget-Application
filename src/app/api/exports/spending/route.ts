import { connection } from "next/server";
import { auth } from "@/auth";
import { exportsCopy } from "@/copy/exports";
import { getDb } from "@/db";
import { buildSpendingExport } from "@/domain/spending/export";
import { RuleError } from "@/domain/errors";
import { loadViewer } from "@/domain/users/viewer";
import { writeAudit } from "@/lib/audit";
import { ForbiddenError } from "@/lib/authz";
import { spendingWorkbook } from "@/lib/excel/spending-workbook";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Downloads the spending workbook (FR-26 Export, AC-91): ?cycle=&department=. The filters
 * are ids, never data. The workbook is built inside the transaction that audits
 * the export, so a failed export leaves no "exported" record.
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
      const data = await buildSpendingExport(tx, viewer, {
        cycleId: get("cycle"),
        departmentId: get("department"),
      });
      return { fileName: data.fileName, body: await spendingWorkbook(data) };
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
        entity: { type: "page", id: "/api/exports/spending" },
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
