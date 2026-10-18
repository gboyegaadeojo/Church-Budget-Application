"use server";

import { adminCopy } from "@/copy/admin";
import {
  changeDeadline,
  createCycle,
  updateCycleDetails,
  extendDepartment,
  openCycle,
} from "@/domain/cycles/service";
import { RuleError } from "@/domain/errors";
import type { ActionState } from "@/lib/action-state";
import { form, runAction } from "@/lib/admin-server";

const c = adminCopy.cycles;
const LIST = "/admin/cycles";
/** A cycle is managed from Admin and from Annual Budget → Budget cycles; refresh both. */
const pagesOf = (id: string) => [
  `/admin/cycles/${id}`,
  `/annual/cycles/${id}`,
  LIST,
  "/annual/cycles",
];

export async function createCycleAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      const { name } = await createCycle(tx, viewer, {
        name: form.text(data, "name"),
        budgetYear: form.text(data, "budgetYear"),
        startDate: form.text(data, "startDate"),
        submissionDeadline: form.text(data, "submissionDeadline"),
        taxRatePercent: form.text(data, "taxRatePercent"),
        boardTotal: form.text(data, "boardTotal"),
        boardReference: form.text(data, "boardReference"),
      });
      return c.created(name);
    },
    { paths: [LIST, "/annual/cycles"] },
  );
}

export async function cycleStatusAction(_: ActionState, data: FormData): Promise<ActionState> {
  const id = form.text(data, "id");
  const event = form.text(data, "event");
  return runAction(
    async (tx, viewer) => {
      const input = { id, version: form.text(data, "version") };
      // Closing and reopening the budget year live on Spending → Close budget year.
      if (event !== "open") throw new RuleError(c.errors.closeElsewhere);
      await openCycle(tx, viewer, input);
      return c.opened;
    },
    { paths: pagesOf(id) },
  );
}

export async function changeDeadlineAction(_: ActionState, data: FormData): Promise<ActionState> {
  const id = form.text(data, "id");
  return runAction(
    async (tx, viewer) => {
      await changeDeadline(tx, viewer, {
        id,
        version: form.text(data, "version"),
        newDeadline: form.text(data, "newDeadline"),
        reason: form.text(data, "reason"),
      });
      return c.deadlineChanged;
    },
    { paths: pagesOf(id) },
  );
}

export async function extendAction(_: ActionState, data: FormData): Promise<ActionState> {
  const cycleId = form.text(data, "cycleId");
  return runAction(
    async (tx, viewer) => {
      await extendDepartment(tx, viewer, {
        cycleId,
        departmentId: form.text(data, "departmentId"),
        newDeadline: form.text(data, "newDeadline"),
        reason: form.text(data, "reason"),
      });
      return c.granted;
    },
    { paths: pagesOf(cycleId) },
  );
}

export async function updateCycleDetailsAction(
  _: ActionState,
  data: FormData,
): Promise<ActionState> {
  const id = form.text(data, "id");
  return runAction(
    async (tx, viewer) => {
      const { changed } = await updateCycleDetails(tx, viewer, {
        id,
        version: form.text(data, "version"),
        name: form.text(data, "name"),
        budgetYear: form.text(data, "budgetYear"),
        startDate: form.text(data, "startDate"),
        taxRatePercent: form.text(data, "taxRatePercent"),
        boardTotal: form.text(data, "boardTotal"),
        boardReference: form.text(data, "boardReference"),
        spendingPeriodEnd: form.text(data, "spendingPeriodEnd"),
      });
      return changed ? c.saved : c.unchanged;
    },
    { paths: pagesOf(id) },
  );
}
