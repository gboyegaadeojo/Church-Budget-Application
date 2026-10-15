import { and, eq, ne } from "drizzle-orm";
import { userDepartments, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { promoteBackupsWhenPrimaryLeaves } from "@/domain/departments/service";
import { writeAudit, type AuditActor } from "@/lib/audit";
import { PCO_GRACE_MS } from "./access";
import type { LeaderCheck } from "./leader-check";

type UserRow = typeof users.$inferSelect;

export type VerificationOutcome = {
  /** Whether the person may act as a requester right now. */
  requesterUsable: boolean;
  /** The person was verified before and no longer is. */
  suspended: boolean;
};

async function hasDepartments(tx: Tx, userId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: userDepartments.id })
    .from(userDepartments)
    .where(eq(userDepartments.userId, userId))
    .limit(1);
  return rows.length > 0;
}

/** Whether another account already holds this Planning Center person. */
async function pcoPersonTaken(tx: Tx, personId: string, userId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.pcoPersonId, personId), ne(users.id, userId)))
    .limit(1);
  return rows.length > 0;
}

/**
 * Stores a Group Leader check on the user and audits any change (FR-01a: granted,
 * suspended, restored). Shared by sign-in and the nightly job, so both apply the
 * same rules, including the 72-hour grace period when Planning Center is down.
 */
export async function applyVerification(
  tx: Tx,
  user: UserRow,
  check: LeaderCheck,
  ctx: { now: Date; actor: AuditActor },
): Promise<VerificationOutcome> {
  const audit = (eventType: string, details: Record<string, unknown>, reason?: string) =>
    writeAudit(tx, {
      actor: ctx.actor,
      area: "access",
      eventType,
      entity: { type: "user", id: user.id },
      reason,
      details,
    });

  if (check.status === "unavailable") {
    const graceUntil = user.pcoVerifiedAt ? user.pcoVerifiedAt.getTime() + PCO_GRACE_MS : 0;
    const usable =
      user.pcoLeaderVerified &&
      user.accessStatus !== "suspended_not_leader" &&
      ctx.now.getTime() < graceUntil;
    await audit("access.pco_unavailable", { usingGracePeriod: usable }, check.reason);
    return { requesterUsable: usable, suspended: false };
  }

  if (check.status === "leader") {
    const linkPerson =
      !user.pcoPersonId && !(await pcoPersonTaken(tx, check.person.id, user.id))
        ? check.person.id
        : user.pcoPersonId;
    const wasSuspended = user.accessStatus === "suspended_not_leader";
    const nextStatus =
      user.accessStatus === "active" || user.accessStatus === "inactive"
        ? user.accessStatus
        : (await hasDepartments(tx, user.id))
          ? "active"
          : "pending_department";
    await tx
      .update(users)
      .set({
        pcoLeaderVerified: true,
        pcoVerifiedAt: ctx.now,
        pcoFieldValueSnapshot: check.fieldValue,
        pcoPersonId: linkPerson,
        accessStatus: nextStatus,
        updatedAt: ctx.now,
      })
      .where(eq(users.id, user.id));
    if (!user.pcoLeaderVerified || wasSuspended) {
      await audit(wasSuspended ? "access.leader_restored" : "access.leader_granted", {
        fieldValue: check.fieldValue,
        pcoPersonId: check.person.id,
      });
    }
    return { requesterUsable: nextStatus !== "inactive", suspended: false };
  }

  // not_leader, not_found or ambiguous: requester access stops; drafts and history stay.
  const wasLeader = user.pcoLeaderVerified;
  await tx
    .update(users)
    .set({
      pcoLeaderVerified: false,
      pcoVerifiedAt: ctx.now,
      pcoFieldValueSnapshot: check.status === "not_leader" ? check.fieldValue : null,
      accessStatus: user.accessStatus === "inactive" ? "inactive" : "suspended_not_leader",
      updatedAt: ctx.now,
    })
    .where(eq(users.id, user.id));
  if (wasLeader || user.accessStatus !== "suspended_not_leader") {
    // TODO(step 7): email the administrator and accountant through the outbox (FR-01a, AC-9).
    await audit("access.leader_suspended", { result: check.status });
    // FR-38: a suspended Primary hands the department to its Backup.
    await promoteBackupsWhenPrimaryLeaves(
      tx,
      user.id,
      ctx.actor,
      "Primary's Group Leader status was suspended",
    );
  }
  return { requesterUsable: false, suspended: wasLeader };
}
