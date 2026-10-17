import { connection } from "next/server";
import { auth } from "@/auth";
import { exportsCopy } from "@/copy/exports";
import { getDb } from "@/db";
import { buildExpenseExport } from "@/domain/expenses/export";
import { RuleError } from "@/domain/errors";
import { loadViewer } from "@/domain/users/viewer";
import { writeAudit } from "@/lib/audit";
import { ForbiddenError } from "@/lib/authz";
import { expenseWorkbook } from "@/lib/excel/expense-workbook";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Downloads the expense workbook (FR-50): ?cycle=&department=&from=&to=. The filters are
 * ids and dates, never data. The workbook is built inside the transaction that audits
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
      const data = await buildExpenseExport(tx, viewer, {
        cycleId: get("cycle"),
        departmentId: get("department"),
        from: get("from"),
        to: get("to"),
      });
      return { fileName: data.fileName, body: await expenseWorkbook(data) };
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
        entity: { type: "page", id: "/api/exports/expenses" },
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
