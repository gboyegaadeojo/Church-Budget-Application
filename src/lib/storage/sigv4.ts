import { createHash, createHmac } from "node:crypto";

/**
 * AWS Signature Version 4 query-string presigning (the S3 API Cloudflare R2 speaks).
 * Only `host` is signed and the payload is unsigned, which is what browser uploads and
 * short-lived download links need. No SDK: a few lines of node:crypto, no dependency.
 */

export type PresignInput = {
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  host: string;
  /** The path, already starting with "/", unencoded ("/bucket/receipts/a b.jpg"). */
  path: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service?: string;
  /** Seconds the link works for (1 to 604800). */
  expiresIn: number;
  now: Date;
  /** Extra query parameters to sign, e.g. response-content-disposition. */
  query?: Record<string, string>;
};

/** RFC 3986 encoding, as SigV4 requires. */
export function uriEncode(value: string, keepSlash = false): string {
  return [...value]
    .map((ch) => {
      if (/[A-Za-z0-9\-._~]/.test(ch) || (keepSlash && ch === "/")) return ch;
      return [...Buffer.from(ch, "utf8")]
        .map((b) => `%${b.toString(16).toUpperCase().padStart(2, "0")}`)
        .join("");
    })
    .join("");
}

const hmac = (key: Buffer | string, data: string) =>
  createHmac("sha256", key).update(data).digest();
const sha256Hex = (data: string) => createHash("sha256").update(data).digest("hex");

/** "20130524T000000Z" */
function amzDate(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

export function presignUrl(input: PresignInput): string {
  const service = input.service ?? "s3";
  const stamp = amzDate(input.now);
  const day = stamp.slice(0, 8);
  const scope = `${day}/${input.region}/${service}/aws4_request`;
  const params: Record<string, string> = {
    ...input.query,
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${input.accessKeyId}/${scope}`,
    "X-Amz-Date": stamp,
    "X-Amz-Expires": String(input.expiresIn),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.keys(params)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(params[k])}`)
    .join("&");
  const canonicalPath = uriEncode(input.path, true);
  const canonicalRequest = [
    input.method,
    canonicalPath,
    canonicalQuery,
    `host:${input.host}`,
    "",
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256Hex(canonicalRequest)].join("\n");
  const key = hmac(
    hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), service),
    "aws4_request",
  );
  const signature = createHmac("sha256", key).update(stringToSign).digest("hex");
  return `https://${input.host}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
