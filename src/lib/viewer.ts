import "server-only";
import { isRole, ROLES, type Viewer } from "./roles";

/**
 * TEMPORARY until sign-in lands (Stage 1, step 3): returns a sample person so the
 * shell and Home can be built and tested. Roles come from PREVIEW_ROLES
 * (comma-separated), defaulting to every role. See docs/decisions.md.
 */
export async function getViewer(): Promise<Viewer> {
  const fromEnv = process.env.PREVIEW_ROLES?.split(",")
    .map((r) => r.trim())
    .filter(isRole);
  return {
    id: "preview",
    name: "Preview User",
    email: "preview@example.org",
    roles: fromEnv && fromEnv.length > 0 ? fromEnv : ROLES,
    departments: [{ id: "media", name: "Media" }],
  };
}

export const IS_PREVIEW_VIEWER = true;
