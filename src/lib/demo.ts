import "server-only";
import { eq } from "drizzle-orm";
import { appSettings } from "@/db/schema";
import type { Tx } from "@/db/types";
import { demoMode } from "./auth-mode";
import identities from "../../tests/fixtures/fake-identities.json";

/**
 * The hosted demo (docs/demo-site.md). Its database carries a `demo_instance` setting
 * that only `scripts/demo-reset.mjs` writes, and demo sign-in checks it every time, so
 * the real database (which never has it) can't be signed into as a made-up person.
 */
export const DEMO_MARKER = "demo_instance";

export async function isDemoDatabase(tx: Tx): Promise<boolean> {
  const [row] = await tx
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, DEMO_MARKER));
  return row?.value === "true";
}

export type DemoIdentity = (typeof identities)[number];

/** The made-up people anyone may sign in as, bundled with the app so a deploy has them. */
export const FAKE_IDENTITIES: readonly DemoIdentity[] = identities;

/**
 * Whether made-up sign-in may go ahead now: always locally, and on the demo site only
 * against the demo's own database and as one of the listed people.
 */
export async function fakeSignInAllowed(tx: Tx, subject: unknown): Promise<boolean> {
  if (!demoMode()) return true;
  if (!FAKE_IDENTITIES.some((i) => i.subject === subject)) return false;
  return isDemoDatabase(tx);
}
