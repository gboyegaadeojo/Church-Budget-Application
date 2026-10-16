import { createHash } from "node:crypto";
import { z } from "zod";
import { brandingCopy } from "@/copy/branding";
import { brandAssets } from "@/db/schema";
import type { Tx } from "@/db/types";
import { parseInput, ValidationError } from "@/domain/errors";
import { writeAudit } from "@/lib/audit";
import { assertCan, type Subject } from "@/lib/authz";
import { checkAccent } from "@/lib/brand-colour";
import { checkImage, type ImageProblem } from "@/lib/brand-image";
import type { BrandKind } from "./brand";
import { writeSettings } from "./service";

/**
 * Changing the church's branding (FR-30, DRD 3.8). Only the System Administrator does it
 * (AC-101), and every change is audited with old and new values.
 */

const b = brandingCopy;

const KEY: Record<BrandKind, "logo_asset_id" | "icon_asset_id"> = {
  logo: "logo_asset_id",
  icon: "icon_asset_id",
};

// ---------------------------------------------------------------- names

const namesSchema = z.object({
  churchName: z.string().trim().min(1, b.errors.churchName).max(80, b.errors.churchName),
  appName: z.string().trim().min(1, b.errors.appName).max(60, b.errors.appName),
});

export async function updateBrandNames(
  tx: Tx,
  actor: Subject,
  input: { churchName: string; appName: string; versions: Record<string, unknown> },
): Promise<boolean> {
  assertCan(actor, "admin.branding");
  const data = parseInput(namesSchema, input);
  return writeSettings(
    tx,
    actor,
    { church_name: data.churchName, app_name: data.appName },
    input.versions,
    "admin.branding_changed",
    "admin.branding",
  );
}

// ---------------------------------------------------------------- accent colour (AC-100)

/** Saves a passing accent colour; a failing one is refused with the nearest passing shade. */
export async function updateAccentColour(
  tx: Tx,
  actor: Subject,
  input: { accent: string; versions: Record<string, unknown> },
): Promise<boolean> {
  assertCan(actor, "admin.branding");
  const result = checkAccent(input.accent ?? "");
  if (!result.ok) {
    if (result.reason === "invalid") throw new ValidationError({ accent: b.errors.accentInvalid });
    throw new ValidationError({
      accent: b.errors.accentContrast(result.contrast.toFixed(1), result.suggestion.toUpperCase()),
    });
  }
  return writeSettings(
    tx,
    actor,
    { accent_color: result.hex },
    input.versions,
    "admin.branding_changed",
    "admin.branding",
  );
}

/** Back to the DRD default colour. */
export async function resetAccentColour(
  tx: Tx,
  actor: Subject,
  input: { versions: Record<string, unknown> },
): Promise<boolean> {
  assertCan(actor, "admin.branding");
  return writeSettings(
    tx,
    actor,
    { accent_color: "" },
    input.versions,
    "admin.branding_changed",
    "admin.branding",
  );
}

// ---------------------------------------------------------------- logo and icon

const PROBLEM: Record<ImageProblem, string> = {
  empty: b.errors.empty,
  too_large: b.errors.tooLarge,
  type: b.errors.type,
  unsafe_svg: b.errors.unsafeSvg,
  unreadable: b.errors.unreadable,
};

/**
 * Stores a new logo or icon and makes it current. The old file stays in brand_assets
 * (nothing is deleted), and the audit records both ids and the new file's fingerprint.
 */
export async function uploadBrandImage(
  tx: Tx,
  actor: Subject,
  input: { kind: BrandKind; bytes: Uint8Array | null; versions: Record<string, unknown> },
): Promise<{ id: string }> {
  const { actingRole } = assertCan(actor, "admin.branding");
  const field = input.kind === "logo" ? "logo" : "icon";
  if (!input.bytes || input.bytes.length === 0) {
    throw new ValidationError({ [field]: input.bytes ? b.errors.empty : b.errors.noFile });
  }
  const checked = checkImage(input.bytes);
  if (!checked.ok) throw new ValidationError({ [field]: PROBLEM[checked.problem] });
  const { image } = checked;
  if (input.kind === "icon") {
    if (image.contentType === "image/jpeg") throw new ValidationError({ icon: b.errors.iconType });
    if (image.width !== null && image.width !== image.height) {
      throw new ValidationError({ icon: b.errors.iconSquare });
    }
  }

  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const [row] = await tx
    .insert(brandAssets)
    .values({
      kind: input.kind,
      contentType: image.contentType,
      bytes: input.bytes,
      byteSize: input.bytes.length,
      width: image.width,
      height: image.height,
      sha256,
      uploadedByUserId: actor.id,
    })
    .returning({ id: brandAssets.id });
  await writeSettings(
    tx,
    actor,
    { [KEY[input.kind]]: row.id },
    input.versions,
    "admin.branding_changed",
    "admin.branding",
  );
  await writeAudit(tx, {
    actor: { kind: "user", userId: actor.id, actingRole },
    area: "admin",
    eventType: input.kind === "logo" ? "admin.logo_uploaded" : "admin.icon_uploaded",
    entity: { type: "brand_asset", id: row.id },
    details: {
      contentType: image.contentType,
      bytes: input.bytes.length,
      width: image.width,
      height: image.height,
      sha256,
    },
  });
  return row;
}

/** Stops showing the logo or icon; the file itself stays in the history. */
export async function removeBrandImage(
  tx: Tx,
  actor: Subject,
  input: { kind: BrandKind; versions: Record<string, unknown> },
): Promise<boolean> {
  assertCan(actor, "admin.branding");
  return writeSettings(
    tx,
    actor,
    { [KEY[input.kind]]: "" },
    input.versions,
    "admin.branding_changed",
    "admin.branding",
  );
}
