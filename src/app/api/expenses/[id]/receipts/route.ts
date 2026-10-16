import { connection } from "next/server";
import { expensesCopy } from "@/copy/expenses";
import { getDb } from "@/db";
import { prepareReceiptUpload } from "@/domain/expenses/receipts";
import { getStorage } from "@/lib/storage";
import { errorResponse, jsonBody, routeViewer } from "./shared";

/**
 * Step 1 of adding a receipt (6B.9): the browser says what it will upload; the server
 * checks the claim, the person, the count, the size and the type, and answers with a
 * signed upload link valid for 15 minutes. JSON only: no file passes through here.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const viewer = await routeViewer();
  if (!viewer) return Response.json({ message: "Sign in again." }, { status: 401 });
  const storage = getStorage();
  if (!storage) {
    return Response.json({ message: expensesCopy.errors.receiptStorageMissing }, { status: 503 });
  }
  const { id } = await params;
  const body = await jsonBody(request);
  try {
    const prepared = await getDb().transaction((tx) =>
      prepareReceiptUpload(tx, viewer, {
        expenseId: id,
        fileName: body.fileName,
        size: body.size,
        contentType: body.contentType,
      }),
    );
    return Response.json(
      { ...prepared, uploadUrl: storage.uploadUrl(prepared.key, 15 * 60) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, viewer, `/api/expenses/${id}/receipts`);
  }
}
