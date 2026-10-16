"use server";

import { adminCopy } from "@/copy/admin";
import {
  acceptProposed,
  addDepartments,
  mergeProposed,
  rejectProposed,
  removeRepresentative,
  renameDepartment,
  setDepartmentActive,
  setPlanningCenterValue,
  setRepresentative,
} from "@/domain/departments/service";
import type { ActionState } from "@/lib/action-state";
import { form, runAction } from "@/lib/admin-server";

const d = adminCopy.departments;
const LIST = "/admin/departments";
const page = (id: string) => `/admin/departments/${id}`;

export async function addDepartmentsAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      const { added, skipped, other } = await addDepartments(tx, viewer, {
        names: form.text(data, "names"),
      });
      return d.addResult(added.length, skipped.length, other);
    },
    { paths: [LIST] },
  );
}

export async function renameAction(_: ActionState, data: FormData): Promise<ActionState> {
  const id = form.text(data, "id");
  return runAction(
    async (tx, viewer) => {
      await renameDepartment(tx, viewer, {
        id,
        name: form.text(data, "name"),
        version: form.text(data, "version"),
      });
      return d.renamed;
    },
    { paths: [page(id), LIST] },
  );
}

export async function setDepartmentActiveAction(
  _: ActionState,
  data: FormData,
): Promise<ActionState> {
  const id = form.text(data, "id");
  const active = form.text(data, "active") === "true";
  return runAction(
    async (tx, viewer) => {
      await setDepartmentActive(tx, viewer, { id, active, version: form.text(data, "version") });
      return active ? d.reactivated : d.deactivated;
    },
    { paths: [page(id), LIST] },
  );
}

export async function acceptProposedAction(_: ActionState, data: FormData): Promise<ActionState> {
  const id = form.text(data, "id");
  return runAction(
    async (tx, viewer) => {
      await acceptProposed(tx, viewer, { id, version: form.text(data, "version") });
      return d.accepted;
    },
    { paths: [page(id), LIST] },
  );
}

export async function mergeProposedAction(_: ActionState, data: FormData): Promise<ActionState> {
  const id = form.text(data, "id");
  return runAction(
    async (tx, viewer) => {
      await mergeProposed(tx, viewer, {
        id,
        intoId: form.text(data, "intoId"),
        version: form.text(data, "version"),
      });
      return d.merged;
    },
    { paths: [page(id), LIST] },
  );
}

export async function rejectProposedAction(_: ActionState, data: FormData): Promise<ActionState> {
  const id = form.text(data, "id");
  return runAction(
    async (tx, viewer) => {
      await rejectProposed(tx, viewer, {
        id,
        reason: form.text(data, "reason"),
        version: form.text(data, "version"),
      });
      return d.rejected;
    },
    { paths: [page(id), LIST] },
  );
}

export async function setLeaderAction(_: ActionState, data: FormData): Promise<ActionState> {
  const departmentId = form.text(data, "departmentId");
  return runAction(
    async (tx, viewer) => {
      await setRepresentative(tx, viewer, {
        departmentId,
        userId: form.text(data, "userId"),
        type: form.text(data, "type"),
      });
      return d.leaderSaved;
    },
    { paths: [page(departmentId), LIST, "/admin/users"] },
  );
}

export async function removeLeaderAction(_: ActionState, data: FormData): Promise<ActionState> {
  const departmentId = form.text(data, "departmentId");
  return runAction(
    async (tx, viewer) => {
      await removeRepresentative(tx, viewer, { departmentId, userId: form.text(data, "userId") });
      return d.leaderSaved;
    },
    { paths: [page(departmentId), LIST, "/admin/users"] },
  );
}

export async function planningCenterValueAction(
  _: ActionState,
  data: FormData,
): Promise<ActionState> {
  const id = form.text(data, "id");
  return runAction(
    async (tx, viewer) => {
      await setPlanningCenterValue(tx, viewer, {
        id,
        value: form.text(data, "value"),
        version: form.text(data, "version"),
      });
      return d.pcoSaved;
    },
    { paths: [page(id)] },
  );
}
