"use client";

import { useState } from "react";
import {
  ActionForm,
  CheckboxField,
  CheckboxGroup,
  SubmitButton,
} from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { adminCopy } from "@/copy/admin";
import { saveRolesAction } from "../actions";
import { ROLE_OPTIONS } from "../role-options";

const u = adminCopy.users;

/**
 * Roles for one person. When administrators edit themselves and untick System
 * Administrator, saving asks first (Requirements 20.5); the server still refuses if
 * they are the last administrator.
 */
export function RolesForm({
  userId,
  version,
  roles,
  isSelf,
}: {
  userId: string;
  version: number;
  roles: string[];
  isSelf: boolean;
}) {
  const [removingOwnAdmin, setRemovingOwnAdmin] = useState(false);
  const formId = `roles-${userId}`;

  return (
    <div
      onChange={(event) => {
        const target = event.target as HTMLInputElement;
        if (isSelf && target.name === "roles" && target.value === "system_admin") {
          setRemovingOwnAdmin(roles.includes("system_admin") && !target.checked);
        }
      }}
    >
      <ActionForm action={saveRolesAction} id={formId} aria-label={u.rolesHeading}>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="version" value={version} />
        <CheckboxGroup
          name="roles"
          legend={u.roles}
          options={ROLE_OPTIONS}
          defaultValues={roles}
          hint={u.rolesHint}
        />
        <CheckboxField name="twoStepConfirmed" label={u.twoStep} hint={u.twoStepHint} />
        {removingOwnAdmin ? (
          <ConfirmDialog
            formId={formId}
            trigger={adminCopy.common.save}
            triggerTone="primary"
            title={u.removeOwnAdminTitle}
            body={u.removeOwnAdminBody}
            confirmLabel={u.removeOwnAdminConfirm}
            confirmTone="danger"
          />
        ) : (
          <SubmitButton>{adminCopy.common.save}</SubmitButton>
        )}
      </ActionForm>
    </div>
  );
}
