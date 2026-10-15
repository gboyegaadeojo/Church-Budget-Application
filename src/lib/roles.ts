/** Roles from Requirements section 3. A person can hold several; permissions are the union. */
export const ROLES = [
  "requester",
  "accountant",
  "backup_approver",
  "board_chair",
  "vice_chair",
  "church_admin",
  "system_admin",
] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export type Department = { id: string; name: string };

/** The signed-in person, as the app sees them. */
export type Viewer = {
  id: string;
  name: string;
  email: string;
  roles: readonly Role[];
  /** Departments the person represents (requester role). */
  departments: readonly Department[];
};

export function hasRole(viewer: Pick<Viewer, "roles">, ...roles: Role[]): boolean {
  return roles.some((role) => viewer.roles.includes(role));
}
