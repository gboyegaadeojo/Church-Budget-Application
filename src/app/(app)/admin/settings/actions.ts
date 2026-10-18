"use server";

import { adminCopy } from "@/copy/admin";
import { RuleError } from "@/domain/errors";
import { addSigner, editSigner, removeSigner } from "@/domain/signers/service";
import {
  setPrimaryAccountant,
  testPerson,
  updateSignInSettings,
  updateSecondApprovalThreshold,
  updateSmsMonthlyLimit,
  updateTaxRate,
  updateTimeZone,
  type TestPersonResult,
} from "@/domain/settings/service";
import type { ActionState } from "@/lib/action-state";
import { form, runAction } from "@/lib/admin-server";
import { PlanningCenterUnavailableError } from "@/lib/pco";
import { getPlanningCenterDirectory } from "@/lib/pco-directory";

const s = adminCopy.settings;
const PAGE = "/admin/settings";

export async function primaryAccountantAction(
  _: ActionState,
  data: FormData,
): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      await setPrimaryAccountant(tx, viewer, {
        userId: form.text(data, "userId"),
        versions: form.json(data, "versions"),
      });
      return s.accountants.saved;
    },
    { paths: [PAGE] },
  );
}

export async function addSignerAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      const signer = await addSigner(tx, viewer, {
        name: form.text(data, "name"),
        email: form.text(data, "email"),
        activeFrom: form.text(data, "activeFrom"),
      });
      return s.signers.added(signer.name);
    },
    { paths: [PAGE] },
  );
}

export async function editSignerAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      await editSigner(tx, viewer, {
        id: form.text(data, "id"),
        version: form.text(data, "version"),
        name: form.text(data, "name"),
        email: form.text(data, "email"),
      });
      return s.signers.edited;
    },
    { paths: [PAGE] },
  );
}

export async function removeSignerAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      await removeSigner(tx, viewer, {
        id: form.text(data, "id"),
        version: form.text(data, "version"),
        removeFrom: form.text(data, "removeFrom"),
        reason: form.text(data, "reason"),
      });
      return s.signers.removed;
    },
    { paths: [PAGE] },
  );
}

export async function taxRateAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      await updateTaxRate(tx, viewer, {
        percent: form.text(data, "percent"),
        versions: form.json(data, "versions"),
      });
      return s.taxSaved;
    },
    { paths: [PAGE] },
  );
}

export async function secondApprovalAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      await updateSecondApprovalThreshold(tx, viewer, {
        amount: form.text(data, "amount"),
        versions: form.json(data, "versions"),
      });
      return s.threshold.saved;
    },
    { paths: [PAGE] },
  );
}

export async function smsLimitAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      await updateSmsMonthlyLimit(tx, viewer, {
        limit: form.text(data, "limit"),
        versions: form.json(data, "versions"),
      });
      return s.sms.saved;
    },
    { paths: [PAGE] },
  );
}

export async function timeZoneAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      await updateTimeZone(tx, viewer, {
        timeZone: form.text(data, "timeZone"),
        versions: form.json(data, "versions"),
      });
      return s.timeZoneSaved;
    },
    { paths: [PAGE] },
  );
}

export async function signInSettingsAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      await updateSignInSettings(tx, viewer, {
        adminContactEmail: form.text(data, "adminContactEmail"),
        fieldName: form.text(data, "fieldName"),
        acceptedValues: form.text(data, "acceptedValues"),
        requireForRequesters: form.checked(data, "requireForRequesters"),
        requireForStaff: form.checked(data, "requireForStaff"),
        departmentFieldName: form.text(data, "departmentFieldName"),
        departmentMode: form.text(data, "departmentMode"),
        planningCenterEnabled: form.checked(data, "planningCenterEnabled"),
        emailEnabled: form.checked(data, "emailEnabled"),
        versions: form.json(data, "versions"),
      });
      return s.pcoSaved;
    },
    { paths: [PAGE] },
  );
}

export type TestPersonState = ActionState & { results?: TestPersonResult[] };

/** "Test a person" with the field and values currently typed on the form (AC-11). */
export async function testPersonAction(
  _: TestPersonState,
  data: FormData,
): Promise<TestPersonState> {
  let results: TestPersonResult[] = [];
  const state = await runAction(
    async (tx, viewer) => {
      const directory = getPlanningCenterDirectory();
      if (!directory) throw new RuleError(s.notConfigured);
      try {
        results = await testPerson(tx, viewer, directory, {
          query: form.text(data, "query"),
          fieldName: form.text(data, "fieldName"),
          acceptedValues: form.text(data, "acceptedValues"),
        });
      } catch (error) {
        if (error instanceof PlanningCenterUnavailableError) {
          throw new RuleError(s.testUnavailable(error.message));
        }
        throw error;
      }
      return results.length === 0 ? s.testNoMatch : "";
    },
    { paths: [] },
  );
  return state.status === "success" ? { ...state, results } : state;
}
