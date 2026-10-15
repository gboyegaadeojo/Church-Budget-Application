"use server";

import { adminCopy } from "@/copy/admin";
import {
  changeDeadline,
  closeCycle,
  createCycle,
  extendDepartment,
  openCycle,
  reopenCycle,
} from "@/domain/cycles/service";
import type { ActionState } from "@/lib/action-state";
import { form, runAction } from "@/lib/admin-server";

const c = adminCopy.cycles;
const LIST = "/admin/cycles";
const page = (id: string) => `/admin/cycles/${id}`;

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
    { paths: [LIST] },
  );
}

export async function cycleStatusAction(_: ActionState, data: FormData): Promise<ActionState> {
  const id = form.text(data, "id");
  const event = form.text(data, "event");
  return runAction(
    async (tx, viewer) => {
      const input = { id, version: form.text(data, "version") };
      if (event === "open") {
        await openCycle(tx, viewer, input);
        return c.opened;
      }
      if (event === "close") {
        await closeCycle(tx, viewer, input);
        return c.closed;
      }
      await reopenCycle(tx, viewer, {
        ...input,
        newDeadline: form.text(data, "newDeadline"),
        reason: form.text(data, "reason"),
      });
      return c.reopened;
    },
    { paths: [page(id), LIST] },
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
    { paths: [page(id), LIST] },
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
    { paths: [page(cycleId)] },
  );
}
