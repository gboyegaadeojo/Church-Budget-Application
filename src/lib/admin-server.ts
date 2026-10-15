import "server-only";
import { and, desc, eq, like, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminCopy } from "@/copy/admin";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { auditEvents, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { ConflictError, RuleError, ValidationError } from "@/domain/errors";
import { getChurchTimeZone } from "@/domain/settings";
import { loadViewer } from "@/domain/users/viewer";
import type { ActionState } from "./action-state";
import { writeAudit } from "./audit";
import { authorize, ForbiddenError, type Action, type AuthzContext } from "./authz";
import type { Viewer } from "./roles";
import { formatDateTime } from "./time-zone";
import { getViewer } from "./viewer";

/**
 * Server helpers shared by admin pages and actions: one place that checks permission,
 * records access-denied events (FR-22), runs a service in a transaction and turns its
 * errors into messages.
 */

async function recordDenied(viewer: Viewer, action: Action, where: string) {
  await writeAudit(getDb(), {
    actor: { kind: "user", userId: viewer.id },
    area: "access",
    eventType: "access.denied",
    entity: { type: "page", id: where },
    details: { action, roles: viewer.roles },
  });
}

/**
 * For pages: the viewer if they may use `action`, otherwise null (render the
 * permission-denied state). Denials are audited.
 */
export async function viewerAllowedTo(
  action: Action,
  where: string,
  ctx?: AuthzContext,
): Promise<Viewer | null> {
  const viewer = await getViewer();
  if (authorize(viewer, action, ctx).allowed) return viewer;
  await recordDenied(viewer, action, where);
  return null;
}

/** For server actions: the signed-in viewer, without the page-only rendering hooks. */
async function actionViewer(allowWaiting = false): Promise<Viewer> {
  const userId = (await auth())?.user?.id;
  if (!userId) redirect("/sign-in");
  const result = await loadViewer(getDb(), userId, { allowWaiting });
  if (!result.ok) redirect(`/access-denied/${result.reason}`);
  return result.viewer;
}

/** "This was changed by Sam Lee at Nov 30, 2026, 5:00 p.m. CST" from the audit log. */
async function conflictMessage(entity: { type: string; id: string }): Promise<string> {
  const db = getDb();
  const [last] = await db
    .select({ name: users.displayName, at: auditEvents.eventTimestamp })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorUserId))
    .where(
      and(
        eq(auditEvents.entityType, entity.type),
        or(eq(auditEvents.entityId, entity.id), like(auditEvents.entityId, `%${entity.id}%`)),
      ),
    )
    .orderBy(desc(auditEvents.eventTimestamp))
    .limit(1);
  if (!last?.name) return adminCopy.common.conflictUnknown;
  return adminCopy.common.conflict(last.name, formatDateTime(last.at, await getChurchTimeZone(db)));
}

type RunOptions = {
  paths: string[];
  latestHref?: string;
  /** Let a verified leader with no department yet through (the annual form, FR-03). */
  allowWaiting?: boolean;
};

/**
 * Runs `work` in one transaction as the signed-in person, then refreshes `paths`.
 * Every service checks permission itself; this only reports the outcome.
 */
export async function runAction(
  work: (tx: Tx, viewer: Viewer) => Promise<string>,
  options: RunOptions,
): Promise<ActionState> {
  const result = await runForResult(
    async (tx, viewer) => ({ message: await work(tx, viewer), data: null }),
    options,
  );
  return result.status === "success" ? { status: "success", message: result.message } : result;
}

/** What runForResult returns: the action state plus, on success, what the service gave back. */
export type ResultState<T> =
  { status: "success"; message: string; data: T } | Extract<ActionState, { status: "error" }>;

/** Like runAction, for actions whose caller needs data back (autosave, submit). */
export async function runForResult<T>(
  work: (tx: Tx, viewer: Viewer) => Promise<{ message: string; data: T }>,
  options: RunOptions,
): Promise<ResultState<T>> {
  const viewer = await actionViewer(options.allowWaiting);
  try {
    const { message, data } = await getDb().transaction((tx) => work(tx, viewer));
    for (const path of options.paths) revalidatePath(path);
    return { status: "success", message, data };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      await recordDenied(viewer, error.action, options.paths[0] ?? "action");
      return { status: "error", message: adminCopy.denied.action };
    }
    if (error instanceof ValidationError) {
      return {
        status: "error",
        message: adminCopy.common.checkFields,
        fieldErrors: error.fieldErrors,
      };
    }
    if (error instanceof RuleError) return { status: "error", message: error.message };
    if (error instanceof ConflictError) {
      return {
        status: "error",
        message: await conflictMessage(error.entity),
        latestHref: options.latestHref ?? options.paths[0],
      };
    }
    console.error("Action failed", error);
    return { status: "error", message: adminCopy.common.unexpected };
  }
}

/** Form helpers: text, booleans from checkboxes, and repeated values. */
export const form = {
  text: (data: FormData, name: string) => {
    const v = data.get(name);
    return typeof v === "string" ? v : "";
  },
  checked: (data: FormData, name: string) => data.get(name) === "on",
  all: (data: FormData, name: string) =>
    data.getAll(name).filter((v): v is string => typeof v === "string"),
  json: (data: FormData, name: string): Record<string, unknown> => {
    try {
      const parsed: unknown = JSON.parse(form.text(data, name) || "{}");
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  },
};
