import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { isRole, ROLES, type Viewer } from "./roles";

/**
 * TEMPORARY until sign-in lands (Stage 1, step 3): returns a sample person so the
 * shell and Home can be built and tested. Roles come from PREVIEW_ROLES
 * (comma-separated), defaulting to every role. See docs/decisions.md.
 *
 * It is request-time, like the real session read will be, so every caller must
 * already sit behind a <Suspense> boundary (Cache Components). Memoized per request.
 */
export const getViewer = cache(async (): Promise<Viewer> => {
  await connection();
  const fromEnv = process.env.PREVIEW_ROLES?.split(",")
    .map((r) => r.trim())
    .filter(isRole);
  return {
    id: "preview",
    name: "Preview User",
    email: "preview@example.org",
    roles: fromEnv && fromEnv.length > 0 ? fromEnv : ROLES,
    departments: [{ id: "media", name: "Media", representativeType: "primary" }],
  };
});

export const IS_PREVIEW_VIEWER = true;
