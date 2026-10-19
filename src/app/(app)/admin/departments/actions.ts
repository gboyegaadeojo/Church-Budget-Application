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
import { addLeaderFromPlanningCenter } from "@/domain/departments/add-from-pco";
import {
  addSuggestedLeader,
  ignoreSuggestedLeader,
  setDepartmentMapping,
  syncDepartmentNow,
} from "@/domain/departments/pco-mapping";
import type { ActionState } from "@/lib/action-state";
import { form, runAction } from "@/lib/admin-server";
import { getPlanningCenterDirectory } from "@/lib/pco-directory";

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

/** Adds a leader found in Planning Center, making their account if needed (FR-38). */
export async function addFromPlanningCenterAction(
  _: ActionState,
  data: FormData,
): Promise<ActionState> {
  const departmentId = form.text(data, "departmentId");
  return runAction(
    async (tx, viewer) => {
      const { name } = await addLeaderFromPlanningCenter(tx, viewer, getPlanningCenterDirectory(), {
        departmentId,
        pcoPersonId: form.text(data, "pcoPersonId"),
        type: form.text(data, "type"),
      });
      return d.fromPco.added(name);
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

// ---------------------------------------------------------------- Planning Center mapping (FR-39)

export async function departmentMappingAction(
  _: ActionState,
  data: FormData,
): Promise<ActionState> {
  const id = form.text(data, "id");
  return runAction(
    async (tx, viewer) => {
      await setDepartmentMapping(tx, viewer, getPlanningCenterDirectory(), {
        id,
        source: form.text(data, "source"),
        mode: form.text(data, "mode") || "suggest",
        countsAsLeaders: form.checked(data, "countsAsLeaders"),
        version: form.text(data, "version"),
      });
      return d.pco.saved;
    },
    { paths: [page(id), LIST] },
  );
}

export async function syncNowAction(_: ActionState, data: FormData): Promise<ActionState> {
  const id = form.text(data, "id");
  return runAction(
    async (tx, viewer) => {
      const s = await syncDepartmentNow(tx, viewer, getPlanningCenterDirectory(), { id });
      return d.pco.synced(s.added.length, s.suggested.length, s.flagged.length, s.removed.length);
    },
    { paths: [page(id), LIST, "/admin/users"] },
  );
}

export async function addSuggestionAction(_: ActionState, data: FormData): Promise<ActionState> {
  const departmentId = form.text(data, "departmentId");
  return runAction(
    async (tx, viewer) => {
      await addSuggestedLeader(tx, viewer, {
        id: form.text(data, "suggestionId"),
        slot: form.text(data, "slot"),
        version: form.text(data, "version"),
      });
      return d.pco.added;
    },
    { paths: [page(departmentId), LIST, "/admin/users"] },
  );
}

export async function ignoreSuggestionAction(_: ActionState, data: FormData): Promise<ActionState> {
  const departmentId = form.text(data, "departmentId");
  return runAction(
    async (tx, viewer) => {
      await ignoreSuggestedLeader(tx, viewer, {
        id: form.text(data, "suggestionId"),
        version: form.text(data, "version"),
      });
      return d.pco.ignored;
    },
    { paths: [page(departmentId)] },
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
