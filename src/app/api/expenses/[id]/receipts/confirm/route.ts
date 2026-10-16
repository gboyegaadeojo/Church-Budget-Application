import { connection } from "next/server";
import { revalidatePath } from "next/cache";
import { expensesCopy } from "@/copy/expenses";
import { getDb } from "@/db";
import { ValidationError } from "@/domain/errors";
import { addReceipt, verifyUploadToken } from "@/domain/expenses/receipts";
import { getStorage } from "@/lib/storage";
import { errorResponse, jsonBody, routeViewer } from "../shared";

/**
 * Step 2 of adding a receipt: once the browser has uploaded the file, the server reads
 * it back, checks its real type and size (AC-81) and records it. A file that fails is
 * deleted from storage, so nothing unchecked stays there.
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
  const key = typeof body.key === "string" ? body.key : "";
  const token = typeof body.token === "string" ? body.token : "";
  const fileName = typeof body.fileName === "string" ? body.fileName : "";
  // Checked before reading, so a forged key never makes the server fetch anything.
  if (!verifyUploadToken(token, key, id, viewer.id)) {
    return Response.json({ message: expensesCopy.errors.receiptUploadExpired }, { status: 400 });
  }
  const bytes = await storage.read(key);
  if (!bytes) {
    return Response.json({ message: expensesCopy.errors.receiptUploadFailed }, { status: 400 });
  }
  try {
    const created = await getDb().transaction((tx) =>
      addReceipt(tx, viewer, { expenseId: id, key, token, fileName, bytes }),
    );
    revalidatePath(`/expenses/${id}`);
    return Response.json(created);
  } catch (error) {
    if (error instanceof ValidationError) await storage.remove(key).catch(() => {});
    return errorResponse(error, viewer, `/api/expenses/${id}/receipts/confirm`);
  }
}
