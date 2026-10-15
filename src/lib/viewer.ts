import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { isWaitingForDepartment, loadViewer } from "@/domain/users/viewer";
import type { Viewer } from "./roles";

/**
 * The signed-in person for this request, with their effective roles read fresh from
 * the database. Redirects to /sign-in without a session, and to the matching
 * access-denied screen (DRD 6.1a) when the account can't use the app right now.
 *
 * It reads the session cookie, so every caller sits behind a <Suspense> boundary
 * (Cache Components). Memoized per request.
 */
export async function getViewer(): Promise<Viewer> {
  const viewer = await getViewerAllowingWaiting();
  if (isWaitingForDepartment(viewer)) redirect("/access-denied/waiting");
  return viewer;
}

/**
 * Like getViewer, but a verified Group Leader with no department yet gets through
 * instead of the waiting screen: the annual form's first step lets them pick one
 * (FR-03, FR-38). The app shell uses it too, so that page has its navigation.
 */
export const getViewerAllowingWaiting = cache(async (): Promise<Viewer> => {
  // Request-time first: Auth.js uses crypto before it reads cookies (Cache Components).
  await connection();
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/sign-in");

  const result = await loadViewer(getDb(), userId, { allowWaiting: true });
  if (!result.ok) redirect(`/access-denied/${result.reason}`);
  return result.viewer;
});
