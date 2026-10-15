import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";

/**
 * A keyed hash of the client's address, for sign-in and access events only (9.13).
 * The raw address is never stored. Netlify puts the client address in
 * x-nf-client-connection-ip; other hosts use the first x-forwarded-for entry.
 */
export async function requestIpHash(): Promise<string | undefined> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return undefined;
  const h = await headers();
  const ip =
    h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  return ip ? createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32) : undefined;
}
