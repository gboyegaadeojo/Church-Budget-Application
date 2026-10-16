import "server-only";
import { auth } from "@/auth";
import { adminCopy } from "@/copy/admin";
import { getDb } from "@/db";
import { RuleError, ValidationError } from "@/domain/errors";
import { loadViewer } from "@/domain/users/viewer";
import { writeAudit } from "@/lib/audit";
import { ForbiddenError } from "@/lib/authz";
import type { Viewer } from "@/lib/roles";

/** The signed-in viewer for a receipt route, or null (the route answers 401/403). */
export async function routeViewer(): Promise<Viewer | null> {
  const userId = (await auth())?.user?.id;
  if (!userId) return null;
  const loaded = await loadViewer(getDb(), userId);
  return loaded.ok ? loaded.viewer : null;
}

/** Turns a service error into a JSON answer, auditing refusals (FR-22). */
export async function errorResponse(error: unknown, viewer: Viewer, where: string) {
  if (error instanceof ForbiddenError) {
    await writeAudit(getDb(), {
      actor: { kind: "user", userId: viewer.id },
      area: "access",
      eventType: "access.denied",
      entity: { type: "page", id: where },
      details: { action: error.action, roles: viewer.roles },
    });
    return Response.json({ message: adminCopy.denied.action }, { status: 403 });
  }
  if (error instanceof ValidationError) {
    const first = Object.values(error.fieldErrors)[0] ?? error.message;
    return Response.json({ message: first, fieldErrors: error.fieldErrors }, { status: 400 });
  }
  if (error instanceof RuleError) return Response.json({ message: error.message }, { status: 400 });
  console.error("Receipt route failed", error);
  return Response.json({ message: adminCopy.common.unexpected }, { status: 500 });
}

export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
