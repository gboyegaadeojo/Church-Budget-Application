"use server";

import { adminCopy } from "@/copy/admin";
import { addStaff, setUserActive, setUserRoles } from "@/domain/users/admin";
import type { ActionState } from "@/lib/action-state";
import { form, runAction } from "@/lib/admin-server";

const u = adminCopy.users;

export async function addStaffAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      const { name } = await addStaff(tx, viewer, {
        email: form.text(data, "email"),
        displayName: form.text(data, "displayName"),
        roles: form.all(data, "roles"),
      });
      return u.added(name);
    },
    { paths: ["/admin/users"] },
  );
}

export async function saveRolesAction(_: ActionState, data: FormData): Promise<ActionState> {
  const userId = form.text(data, "userId");
  return runAction(
    async (tx, viewer) => {
      await setUserRoles(tx, viewer, {
        userId,
        roles: form.all(data, "roles"),
        version: form.text(data, "version"),
      });
      return u.rolesSaved;
    },
    { paths: ["/admin/users", `/admin/users/${userId}`] },
  );
}

export async function setActiveAction(_: ActionState, data: FormData): Promise<ActionState> {
  const userId = form.text(data, "userId");
  const active = form.text(data, "active") === "true";
  return runAction(
    async (tx, viewer) => {
      const { name } = await setUserActive(tx, viewer, {
        userId,
        active,
        version: form.text(data, "version"),
      });
      return active ? u.reactivated(name) : u.deactivated(name);
    },
    { paths: ["/admin/users", `/admin/users/${userId}`] },
  );
}
