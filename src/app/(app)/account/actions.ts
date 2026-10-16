"use server";

import { accountCopy } from "@/copy/account";
import { clearMyAway, setMyAway } from "@/domain/users/away";
import { updateMyEmailPreferences } from "@/domain/users/email-preferences";
import type { ActionState } from "@/lib/action-state";
import { form, runAction } from "@/lib/admin-server";

/**
 * Away (FR-33) and email preferences (FR-21). The services check the role, the input and
 * the version, and audit.
 */

const t = accountCopy.away;
const PATHS = ["/account", "/annual/review", "/"];

export async function emailPreferencesAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      await updateMyEmailPreferences(tx, viewer, {
        reminders: form.checked(data, "reminders"),
        copies: form.checked(data, "copies"),
        digest: form.text(data, "digest") || "instant",
        version: form.text(data, "version"),
      });
      return accountCopy.email.saved;
    },
    { paths: ["/account"] },
  );
}

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
