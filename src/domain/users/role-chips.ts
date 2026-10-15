import { copy } from "@/copy/en-CA";
import type { Viewer } from "@/lib/roles";

/** Department chips shown before the rest are summed up, so the menu stays short. */
const MAX_DEPARTMENT_CHIPS = 3;

/**
 * The labels shown as chips in the account menu (DRD 6.0): "Accountant",
 * "Requester: Media", ... one per role, and the requester role once per department,
 * up to three, then "+2 more departments".
 */
export function roleChips(viewer: Pick<Viewer, "roles" | "departments">): string[] {
  return viewer.roles.flatMap((role) => {
    const label = copy.roles[role];
    if (role === "requester" && viewer.departments.length > 0) {
      const shown = viewer.departments.slice(0, MAX_DEPARTMENT_CHIPS);
      const rest = viewer.departments.length - shown.length;
      return [
        ...shown.map((d) => copy.account.roleChip(label, d.name)),
        ...(rest > 0 ? [copy.account.moreDepartments(rest)] : []),
      ];
    }
    return [copy.account.roleChip(label)];
  });
}
