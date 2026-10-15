/**
 * Department status machine (Requirements 9.3, FR-03). Proposed departments come from
 * "Other (type your department)" and are added, merged or rejected by the administrator.
 */

export const DEPARTMENT_STATUSES = ["active", "inactive", "proposed", "rejected"] as const;
export type DepartmentStatus = (typeof DEPARTMENT_STATUSES)[number];

export type DepartmentEvent = "accept" | "merge" | "reject" | "deactivate" | "reactivate";

const TRANSITIONS: Record<DepartmentEvent, Partial<Record<DepartmentStatus, DepartmentStatus>>> = {
  accept: { proposed: "active" },
  merge: { proposed: "rejected" },
  reject: { proposed: "rejected" },
  deactivate: { active: "inactive" },
  reactivate: { inactive: "active" },
};

export class InvalidDepartmentTransitionError extends Error {
  constructor(
    readonly from: DepartmentStatus,
    readonly event: DepartmentEvent,
  ) {
    super(`Cannot ${event} a department that is ${from}`);
    this.name = "InvalidDepartmentTransitionError";
  }
}

export function canTransitionDepartment(from: DepartmentStatus, event: DepartmentEvent): boolean {
  return TRANSITIONS[event][from] !== undefined;
}

export function transitionDepartment(
  from: DepartmentStatus,
  event: DepartmentEvent,
): DepartmentStatus {
  const to = TRANSITIONS[event][from];
  if (!to) throw new InvalidDepartmentTransitionError(from, event);
  return to;
}
