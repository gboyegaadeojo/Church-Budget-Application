"use server";

import { adminCopy } from "@/copy/admin";
import { RuleError } from "@/domain/errors";
import {
  addStaff,
  addStaffFromPlanningCenter,
  linkPlanningCenterPerson,
  searchPlanningCenterPeople,
  setUserActive,
  setUserRoles,
  unlinkPlanningCenterPerson,
  type PcoCandidate,
} from "@/domain/users/admin";
import { addExpenseSubmitter, removeExpenseSubmitter } from "@/domain/users/expense-submitters";
import type { ActionState } from "@/lib/action-state";
import { form, runAction } from "@/lib/admin-server";
import { PlanningCenterUnavailableError, type PlanningCenterDirectory } from "@/lib/pco";
import { getPlanningCenterDirectory } from "@/lib/pco-directory";

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

export async function addStaffFromPcoAction(_: ActionState, data: FormData): Promise<ActionState> {
  const directory = getPlanningCenterDirectory();
  if (!directory) return { status: "error", message: u.fromPco.unavailable };
  return runAction(
    async (tx, viewer) => {
      const { name } = await addStaffFromPlanningCenter(tx, viewer, directory, {
        pcoPersonId: form.text(data, "pcoPersonId"),
        roles: form.all(data, "roles"),
      });
      return u.fromPco.added(name);
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

// ---------------------------------------------------------------- Expense submitter (6B.2)

export async function addSubmitterAction(_: ActionState, data: FormData): Promise<ActionState> {
  const userId = form.text(data, "userId");
  return runAction(
    async (tx, viewer) => {
      const { department } = await addExpenseSubmitter(tx, viewer, {
        userId,
        departmentId: form.text(data, "departmentId"),
      });
      return u.submitter.added(department);
    },
    { paths: [`/admin/users/${userId}`] },
  );
}

export async function removeSubmitterAction(_: ActionState, data: FormData): Promise<ActionState> {
  const userId = form.text(data, "userId");
  return runAction(
    async (tx, viewer) => {
      const { department } = await removeExpenseSubmitter(tx, viewer, {
        userId,
        departmentId: form.text(data, "departmentId"),
      });
      return u.submitter.removed(department);
    },
    { paths: [`/admin/users/${userId}`] },
  );
}

// ---------------------------------------------------------------- Planning Center link

/** Runs `work` with the Planning Center directory; an outage becomes a plain message. */
async function withDirectory<T>(work: (directory: PlanningCenterDirectory) => Promise<T>) {
  const directory = getPlanningCenterDirectory();
  if (!directory) throw new RuleError(u.pco.notConfigured);
  try {
    return await work(directory);
  } catch (error) {
    if (error instanceof PlanningCenterUnavailableError) throw new RuleError(u.pco.unavailable);
    throw error;
  }
}

export type PcoSearchState = ActionState & { results?: PcoCandidate[] };

export async function searchPcoAction(_: PcoSearchState, data: FormData): Promise<PcoSearchState> {
  let results: PcoCandidate[] = [];
  const state = await runAction(
    async (tx, viewer) => {
      results = await withDirectory((directory) =>
        searchPlanningCenterPeople(tx, viewer, directory, {
          userId: form.text(data, "userId"),
          query: form.text(data, "query"),
        }),
      );
      return results.length === 0 ? u.pco.noMatch : "";
    },
    { paths: [] },
  );
  return state.status === "success" ? { ...state, results } : state;
}

export async function linkPcoAction(_: ActionState, data: FormData): Promise<ActionState> {
  const userId = form.text(data, "userId");
  return runAction(
    async (tx, viewer) => {
      const { name, personName } = await withDirectory((directory) =>
        linkPlanningCenterPerson(tx, viewer, directory, {
          userId,
          pcoPersonId: form.text(data, "pcoPersonId"),
          version: form.text(data, "version"),
        }),
      );
      return u.pco.linkedMessage(name, personName);
    },
    { paths: ["/admin/users", `/admin/users/${userId}`] },
  );
}

export async function unlinkPcoAction(_: ActionState, data: FormData): Promise<ActionState> {
  const userId = form.text(data, "userId");
  return runAction(
    async (tx, viewer) => {
      const { name } = await unlinkPlanningCenterPerson(tx, viewer, {
        userId,
        version: form.text(data, "version"),
      });
      return u.pco.unlinkedMessage(name);
    },
    { paths: ["/admin/users", `/admin/users/${userId}`] },
  );
}
