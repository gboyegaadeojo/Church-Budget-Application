import { connection } from "next/server";
import { getDb } from "@/db";
import { receiptForViewing } from "@/domain/expenses/receipts";
import { writeAudit } from "@/lib/audit";
import { getStorage } from "@/lib/storage";
import { routeViewer } from "../shared";

/**
 * Opens one receipt (6B.9, AC-81): checks the viewer may see the claim's receipts, then
 * redirects to a storage link that works for 5 minutes. Anyone else gets a 404, which
 * gives nothing away; the refusal is audited.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  await connection();
  const viewer = await routeViewer();
  if (!viewer) return new Response("Sign in again.", { status: 401 });
  const { id, fileId } = await params;
  const db = getDb();
  const file = await receiptForViewing(db, viewer, { expenseId: id, fileId });
  const storage = getStorage();
  if (!file || !storage) {
    if (!file) {
      await writeAudit(db, {
        actor: { kind: "user", userId: viewer.id },
        area: "access",
        eventType: "access.denied",
        entity: { type: "page", id: `/api/expenses/${id}/receipts/${fileId}` },
        details: { action: "expense.view", roles: viewer.roles },
      });
    }
    return new Response("Not found", { status: 404 });
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: storage.downloadUrl(
        file.storageKey,
        { name: file.fileName, contentType: file.contentType },
        5 * 60,
      ),
      "Cache-Control": "no-store",
    },
  });
}
