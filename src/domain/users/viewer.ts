import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { departments, expenseSubmitters, userDepartments, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { readSettings } from "@/domain/settings";
import type { Role, Viewer } from "@/lib/roles";
import type { AccessDeniedReason } from "./access";
import { rolesOf } from "./sign-in";

export type ViewerResult = { ok: true; viewer: Viewer } | { ok: false; reason: AccessDeniedReason };

/**
 * The signed-in person as the app sees them, read fresh on every request so a
 * deactivation, role change or Planning Center suspension applies at once (FR-02).
 * Only effective roles are returned: a suspended requester loses the requester role.
 */
export async function loadViewer(
  tx: Tx,
  userId: string,
  options: { allowWaiting?: boolean } = {},
): Promise<ViewerResult> {
  const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.active || user.accessStatus === "inactive") {
    return { ok: false, reason: "not-allowed" };
  }

  let roles: Role[] = await rolesOf(tx, user.id);
  const suspended = user.accessStatus === "suspended_not_leader";
  if (suspended) {
    const { pco_require_for_staff } = await readSettings(tx, ["pco_require_for_staff"]);
    roles = pco_require_for_staff === "true" ? [] : roles.filter((r) => r !== "requester");
  }

  const represented = await tx
    .select({
      id: departments.id,
      name: departments.name,
      representativeType: userDepartments.representativeType,
    })
    .from(userDepartments)
    .innerJoin(departments, eq(departments.id, userDepartments.departmentId))
    .where(
      and(eq(userDepartments.userId, user.id), inArray(departments.status, ["active", "proposed"])),
    )
    .orderBy(asc(departments.name));

  // Expense submitter (6B.2): departments they may submit expenses for, not represent.
  const submitterOf = await tx
    .select({ id: departments.id, name: departments.name })
    .from(expenseSubmitters)
    .innerJoin(departments, eq(departments.id, expenseSubmitters.departmentId))
    .where(
      and(
        eq(expenseSubmitters.userId, user.id),
        isNull(expenseSubmitters.removedAt),
        eq(departments.status, "active"),
      ),
    )
    .orderBy(asc(departments.name));
  const expenseDepartments = submitterOf.filter((d) => !represented.some((r) => r.id === d.id));

  if (roles.length === 0) {
    return { ok: false, reason: suspended ? "suspended" : "not-allowed" };
  }
  // A verified leader with no department yet waits for the administrator (FR-01a),
  // except on the annual form's first step, where they may pick one (FR-03, FR-38).
  if (
    isWaitingForDepartment({ roles, departments: represented, expenseDepartments }) &&
    !options.allowWaiting
  ) {
    return { ok: false, reason: "waiting" };
  }

  return {
    ok: true,
    viewer: {
      id: user.id,
      name: user.displayName,
      email: user.email,
      roles,
      departments: roles.includes("requester") ? represented : [],
      // Requesters, and the Church Administrator submitting for a department (6B.2).
      expenseDepartments:
        roles.includes("requester") || roles.includes("church_admin") ? expenseDepartments : [],
    },
  };
}

/**
 * A requester and nothing else, representing no department yet and not an Expense
 * submitter for one (FR-01a "waiting", 6B.2).
 */
export function isWaitingForDepartment(
  viewer: Pick<Viewer, "roles" | "departments" | "expenseDepartments">,
): boolean {
  return (
    viewer.roles.length === 1 &&
    viewer.roles[0] === "requester" &&
    viewer.departments.length === 0 &&
    (viewer.expenseDepartments?.length ?? 0) === 0
  );
}
