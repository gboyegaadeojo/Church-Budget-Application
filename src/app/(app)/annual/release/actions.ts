"use server";

import { redirect } from "next/navigation";
import { annualCopy } from "@/copy/annual";
import { releaseNow, setReleaseSchedule } from "@/domain/annual/release";
import type { ActionState } from "@/lib/action-state";
import { form, runAction, runForResult } from "@/lib/admin-server";

/**
 * Decision release (FR-19a, DRD 6.7b). The services check the accountant's permission,
 * validate the church-local time, audit, and send held decisions through the outbox.
 * Release now and Cancel schedule remove their own buttons, so they come back to the
 * page with a confirmation in the address rather than a message in the form.
 */

const r = annualCopy.release;
/** Every page that shows the hold, or a decision it releases. */
const PATHS = ["/annual/release", "/annual/review", "/annual", "/annual/all", "/"];
const back = (cycleId: string, done: string, sent: number) =>
  `/annual/release?${new URLSearchParams({ cycle: cycleId, done, sent: String(sent) })}`;

export async function scheduleReleaseAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      await setReleaseSchedule(tx, viewer, {
        cycleId: form.text(data, "cycleId"),
        version: form.text(data, "version"),
        mode: "scheduled",
        releaseAt: form.text(data, "releaseAt"),
        message: form.text(data, "message"),
      });
      return r.saved;
    },
    { paths: PATHS },
  );
}

export async function cancelReleaseAction(_: ActionState, data: FormData): Promise<ActionState> {
  const cycleId = form.text(data, "cycleId");
  const result = await runForResult(
    async (tx, viewer) => {
      const { released } = await setReleaseSchedule(tx, viewer, {
        cycleId,
        version: form.text(data, "version"),
        mode: "immediate",
      });
      return { message: r.switchedBack(released), data: released };
    },
    { paths: PATHS },
  );
  if (result.status !== "success") return result;
  redirect(back(cycleId, "cancelled", result.data));
}

export async function releaseNowAction(_: ActionState, data: FormData): Promise<ActionState> {
  const cycleId = form.text(data, "cycleId");
  const result = await runForResult(
    async (tx, viewer) => {
      const { released } = await releaseNow(tx, viewer, {
        cycleId,
        version: form.text(data, "version"),
        idempotencyKey: form.text(data, "idempotencyKey"),
      });
      return { message: r.released(released), data: released };
    },
    { paths: PATHS },
  );
  if (result.status !== "success") return result;
  redirect(back(cycleId, "released", result.data));
}
