"use server";

import { brandingCopy } from "@/copy/branding";
import {
  removeBrandImage,
  resetAccentColour,
  updateAccentColour,
  updateBrandNames,
  uploadBrandImage,
} from "@/domain/settings/brand-service";
import type { BrandKind } from "@/domain/settings/brand";
import type { ActionState } from "@/lib/action-state";
import { form, runAction } from "@/lib/admin-server";

const b = brandingCopy;
/** The whole app shows the branding, so every page is refreshed after a change. */
const PATHS = ["/admin/settings/branding", "/"];

const kindOf = (data: FormData): BrandKind =>
  form.text(data, "kind") === "icon" ? "icon" : "logo";

/** The uploaded file's bytes, or null when no file was chosen. */
async function fileBytes(data: FormData, name: string): Promise<Uint8Array | null> {
  const value = data.get(name);
  if (!value || typeof value === "string" || value.size === 0) return null;
  return new Uint8Array(await value.arrayBuffer());
}

export async function brandNamesAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      await updateBrandNames(tx, viewer, {
        churchName: form.text(data, "churchName"),
        appName: form.text(data, "appName"),
        versions: form.json(data, "versions"),
      });
      return b.names.saved;
    },
    { paths: PATHS },
  );
}

export async function accentAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      await updateAccentColour(tx, viewer, {
        accent: form.text(data, "accent"),
        versions: form.json(data, "versions"),
      });
      return b.accent.saved;
    },
    { paths: PATHS },
  );
}

export async function resetAccentAction(_: ActionState, data: FormData): Promise<ActionState> {
  return runAction(
    async (tx, viewer) => {
      await resetAccentColour(tx, viewer, { versions: form.json(data, "versions") });
      return b.accent.resetDone;
    },
    { paths: PATHS },
  );
}

export async function uploadImageAction(_: ActionState, data: FormData): Promise<ActionState> {
  const kind = kindOf(data);
  const bytes = await fileBytes(data, kind);
  return runAction(
    async (tx, viewer) => {
      await uploadBrandImage(tx, viewer, { kind, bytes, versions: form.json(data, "versions") });
      return kind === "logo" ? b.logo.uploaded : b.icon.uploaded;
    },
    { paths: PATHS },
  );
}

export async function removeImageAction(_: ActionState, data: FormData): Promise<ActionState> {
  const kind = kindOf(data);
  return runAction(
    async (tx, viewer) => {
      await removeBrandImage(tx, viewer, { kind, versions: form.json(data, "versions") });
      return kind === "logo" ? b.logo.removed : b.icon.removed;
    },
    { paths: PATHS },
  );
}
