"use server";

import { helpCopy } from "@/copy/help";
import { RuleError } from "@/domain/errors";
import { requestPrivacyHelp } from "@/domain/users/privacy";
import type { ActionState } from "@/lib/action-state";
import { form, runAction } from "@/lib/admin-server";

/** "See or correct my information" (FR-36): emails the administrators after commit. */
export async function privacyRequestAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      const { sent } = await requestPrivacyHelp(tx, viewer, {
        kind: form.text(data, "kind"),
        details: form.text(data, "details"),
      });
      if (!sent) throw new RuleError(helpCopy.myInfo.alreadySent);
      return helpCopy.myInfo.sent;
    },
    { paths: [] },
  );
}
