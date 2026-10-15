import { copy } from "@/copy/en-CA";
import type { Viewer } from "@/lib/roles";

/**
 * The labels shown as chips in the account menu (DRD 6.0): "Accountant",
 * "Requester: Media", ... one per role, and the requester role once per department.
 */
export function roleChips(viewer: Pick<Viewer, "roles" | "departments">): string[] {
  return viewer.roles.flatMap((role) => {
    const label = copy.roles[role];
    if (role === "requester" && viewer.departments.length > 0) {
      return viewer.departments.map((d) => copy.account.roleChip(label, d.name));
    }
    return [copy.account.roleChip(label)];
  });
}
