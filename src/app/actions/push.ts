"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { getAppCopy as g } from "@/copy/get-app";
import {
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
  type PushSubscriptionInput,
} from "@/domain/notifications/push";
import { loadViewer } from "@/domain/users/viewer";
import { getPushSender } from "@/lib/push";

/** The signed-in person's id, or null. Devices are only ever their own. */
async function viewerId(): Promise<string | null> {
  const userId = (await auth())?.user?.id;
  if (!userId) return null;
  const loaded = await loadViewer(getDb(), userId);
  return loaded.ok ? loaded.viewer.id : null;
}

export type PushActionResult = { ok: true; message?: string } | { ok: false; message: string };

/** Turns alerts on for this device (or refreshes it when the browser renews its address). */
export async function savePushAction(input: PushSubscriptionInput): Promise<PushActionResult> {
  const id = await viewerId();
  if (!id) return { ok: false, message: g.errors.signedOut };
  try {
    const userAgent = (await headers()).get("user-agent") ?? "";
    await getDb().transaction((tx) => savePushSubscription(tx, id, input, userAgent));
  } catch {
    return { ok: false, message: g.errors.save };
  }
  revalidatePath("/get-app");
  return { ok: true };
}

/** Turns alerts off: for this device by its endpoint, or a device from the list by id. */
export async function removePushAction(
  which: { endpoint: string } | { id: string },
): Promise<PushActionResult> {
  const id = await viewerId();
  if (!id) return { ok: false, message: g.errors.signedOut };
  await getDb().transaction((tx) => removePushSubscription(tx, id, which));
  revalidatePath("/get-app");
  return { ok: true };
}

/** Sends a test alert to every device the person has turned on. */
export async function testPushAction(): Promise<PushActionResult> {
  const id = await viewerId();
  if (!id) return { ok: false, message: g.errors.signedOut };
  const sender = getPushSender();
  if (!sender) return { ok: false, message: g.alerts.notSetUp };
  const result = await sendTestPush(getDb(), sender, id, {
    title: g.test.title,
    body: g.test.body,
  });
  revalidatePath("/get-app");
  return result.sent > 0
    ? { ok: true, message: g.test.sent(result.sent) }
    : { ok: false, message: g.test.none };
}
