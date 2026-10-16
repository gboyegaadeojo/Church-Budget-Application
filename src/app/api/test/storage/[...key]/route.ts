import { connection } from "next/server";
import { fakeSignInEnabled } from "@/lib/auth-mode";
import { getStorage, MemoryStorage } from "@/lib/storage";

/**
 * Test-only stand-in for R2's signed links (src/lib/storage): PUT stores a file, GET
 * returns it, each only with a valid signature. A plain 404 unless fake sign-in is on,
 * so it never exists on a deployed site.
 */

const MAX_BYTES = 10 * 1024 * 1024;

async function check(request: Request, params: Promise<{ key: string[] }>, method: string) {
  await connection();
  const storage = fakeSignInEnabled() ? getStorage() : null;
  // Checked by shape: route bundles each hold their own copy of the class.
  if (!storage || !("files" in storage)) return null;
  const key = (await params).key.join("/");
  const url = new URL(request.url);
  const ok = (storage as MemoryStorage).verify(
    method,
    key,
    Number(url.searchParams.get("expires")),
    url.searchParams.get("sig") ?? "",
  );
  return ok ? { storage: storage as MemoryStorage, key } : null;
}

export async function PUT(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const found = await check(request, params, "PUT");
  if (!found) return new Response("Not found", { status: 404 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  // Like R2, the store takes what it's given; the app checks size and type afterwards.
  if (bytes.byteLength > MAX_BYTES * 2) return new Response("Too large", { status: 413 });
  found.storage.files.set(found.key, {
    bytes,
    contentType: request.headers.get("content-type") ?? "application/octet-stream",
  });
  return new Response(null, { status: 200 });
}

export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const found = await check(request, params, "GET");
  const file = found ? found.storage.files.get(found.key) : undefined;
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: { "Content-Type": file.contentType, "Cache-Control": "private, no-store" },
  });
}
