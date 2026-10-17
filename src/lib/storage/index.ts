import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { demoMode, fakeSignInEnabled } from "@/lib/auth-mode";
import { presignUrl } from "./sigv4";

/**
 * Private file storage for receipts (6B.9): Cloudflare R2 in production (S3 API, private
 * bucket, short-lived signed links), an in-memory fake for tests and local development.
 * Files go straight between the browser and storage through signed links, so the app's
 * functions never carry a 10 MB body (Netlify's limit is 6 MB). The app reads a file
 * once, after upload, to check it.
 */
export type ObjectStorage = {
  /** A link the browser PUTs the file to. */
  uploadUrl(key: string, expiresIn: number): string;
  /** A link that shows or downloads the file. */
  downloadUrl(key: string, file: { name: string; contentType: string }, expiresIn: number): string;
  /** The stored bytes, or null if there's no such file. */
  read(key: string): Promise<Uint8Array | null>;
  /** Deletes a file that failed its checks (never a kept receipt). */
  remove(key: string): Promise<void>;
};

function disposition(name: string): string {
  const safe = name.replace(/[^\w.\- ]+/g, "_");
  return `inline; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

class R2Storage implements ObjectStorage {
  constructor(
    private readonly config: {
      accountId: string;
      accessKeyId: string;
      secretAccessKey: string;
      bucket: string;
    },
  ) {}

  private sign(
    method: "GET" | "PUT" | "DELETE",
    key: string,
    expiresIn: number,
    query?: Record<string, string>,
  ) {
    return presignUrl({
      method,
      host: `${this.config.accountId}.r2.cloudflarestorage.com`,
      path: `/${this.config.bucket}/${key}`,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      region: "auto",
      expiresIn,
      now: new Date(),
      query,
    });
  }

  uploadUrl(key: string, expiresIn: number) {
    return this.sign("PUT", key, expiresIn);
  }

  downloadUrl(key: string, file: { name: string; contentType: string }, expiresIn: number) {
    return this.sign("GET", key, expiresIn, {
      "response-content-disposition": disposition(file.name),
      "response-content-type": file.contentType,
    });
  }

  async read(key: string) {
    const response = await fetch(this.sign("GET", key, 60));
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`R2 read failed: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async remove(key: string) {
    const response = await fetch(this.sign("DELETE", key, 60), { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
      throw new Error(`R2 delete failed: ${response.status}`);
    }
  }
}

/**
 * The fake: files live in this server process's memory, behind signed links to the
 * test-only route /api/test/storage (a 404 unless fake sign-in is on).
 */
export class MemoryStorage implements ObjectStorage {
  readonly files = new Map<string, { bytes: Uint8Array; contentType: string }>();

  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  signature(method: string, key: string, expires: number): string {
    return createHmac("sha256", this.secret).update(`${method}\n${key}\n${expires}`).digest("hex");
  }

  /** Whether a signed link is genuine and still valid. */
  verify(method: string, key: string, expires: number, signature: string): boolean {
    if (!Number.isFinite(expires) || expires < Date.now() / 1000) return false;
    const expected = Buffer.from(this.signature(method, key, expires));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  private link(method: string, key: string, expiresIn: number) {
    const expires = Math.floor(Date.now() / 1000) + expiresIn;
    const url = new URL(`/api/test/storage/${key}`, this.baseUrl);
    url.searchParams.set("method", method);
    url.searchParams.set("expires", String(expires));
    url.searchParams.set("sig", this.signature(method, key, expires));
    return url.toString();
  }

  uploadUrl(key: string, expiresIn: number) {
    return this.link("PUT", key, expiresIn);
  }

  downloadUrl(key: string, _file: { name: string; contentType: string }, expiresIn: number) {
    return this.link("GET", key, expiresIn);
  }

  async read(key: string) {
    return this.files.get(key)?.bytes ?? null;
  }

  async remove(key: string) {
    this.files.delete(key);
  }
}

const shared = globalThis as typeof globalThis & { __memoryStorage?: MemoryStorage };

/** R2 when its four settings are present, the fake when fake sign-in is on, else none. */
export function getStorage(): ObjectStorage | null {
  // The hosted demo runs on many short-lived functions, so files go to a demo R2 bucket.
  if (fakeSignInEnabled() && !demoMode()) {
    return (shared.__memoryStorage ??= new MemoryStorage(
      process.env.AUTH_URL ?? "http://localhost:3000",
      process.env.AUTH_SECRET ?? "fake-storage",
    ));
  }
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  return new R2Storage({
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
  });
}
