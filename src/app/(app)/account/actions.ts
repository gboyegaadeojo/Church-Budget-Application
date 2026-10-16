"use server";

import { accountCopy } from "@/copy/account";
import { clearMyAway, setMyAway } from "@/domain/users/away";
import type { ActionState } from "@/lib/action-state";
import { form, runAction } from "@/lib/admin-server";

/** Away (FR-33). The service checks the role, the dates and the version, and audits. */

const t = accountCopy.away;
const PATHS = ["/account", "/annual/review", "/"];

export async function setAwayAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      await setMyAway(tx, viewer, {
        from: form.text(data, "from"),
        until: form.text(data, "until"),
        version: form.text(data, "version"),
      });
      return t.saved;
    },
    { paths: PATHS },
  );
}

export async function clearAwayAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      await clearMyAway(tx, viewer, { version: form.text(data, "version") });
      return t.cleared;
    },
    { paths: PATHS },
  );
}
