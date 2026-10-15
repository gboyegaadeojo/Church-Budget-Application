import { copy } from "@/copy/en-CA";
import { ROLES } from "@/lib/roles";

export const ROLE_OPTIONS = ROLES.map((role) => ({ value: role, label: copy.roles[role] }));
