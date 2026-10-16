import type { Tx } from "@/db/types";
import { getBrand } from "@/domain/settings/brand";
import { appUrl, type EmailBrand, type EmailContent } from "@/lib/email/layout";
import { enqueueEmail, type EmailAudience, type Recipient } from "@/lib/email/outbox";

/**
 * Queues one notice email in the caller's transaction (FR-21 "Cycle and reminders",
 * "System"; FR-03; FR-38). The church and app names come from Settings.
 */
export async function queueNotice(
  tx: Tx,
  notice: {
    template: string;
    audience: EmailAudience;
    to: readonly Recipient[];
    content: EmailContent;
    cycleId?: string;
    budgetRequestId?: string;
    dedupeKey?: string;
    expiresAt?: Date;
    sensitive?: boolean;
    now?: Date;
  },
): Promise<number> {
  if (notice.to.length === 0) return 0;
  return enqueueEmail(tx, { ...notice, brand: await emailBrand(tx) });
}

/**
 * The names, logo and accent for emails and workbooks (FR-30). Emails show the logo only
 * when it is a PNG or JPEG, since most mail clients won't show SVG.
 */
export async function emailBrand(tx: Tx): Promise<EmailBrand> {
  const brand = await getBrand(tx);
  const raster =
    brand.logo &&
    (brand.logo.contentType === "image/png" || brand.logo.contentType === "image/jpeg");
  return {
    churchName: brand.churchName,
    appName: brand.appName,
    logoUrl: raster ? appUrl(brand.logo!.path) : null,
    accent: brand.palette?.light.accent ?? null,
  };
}
