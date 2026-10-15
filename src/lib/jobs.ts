import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Scheduled jobs call POST /api/jobs/<name> with `Authorization: Bearer $JOBS_SECRET`
 * (CLAUDE.md "Scheduled jobs"). Comparison is constant-time; no secret, no access.
 */
export function isAuthorizedJobRequest(
  request: Request,
  secret = process.env.JOBS_SECRET,
): boolean {
  if (!secret || secret.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(match[1]), digest(secret));
}
