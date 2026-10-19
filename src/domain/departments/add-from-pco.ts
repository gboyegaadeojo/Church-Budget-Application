import { eq, sql } from "drizzle-orm";
import { adminCopy } from "@/copy/admin";
import { userRoles, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { RuleError, ValidationError } from "@/domain/errors";
import { getSignInSettings } from "@/domain/settings";
import { applyVerification } from "@/domain/users/verification";
import { writeAudit } from "@/lib/audit";
import { assertCan, type Subject } from "@/lib/authz";
import type { PcoPerson, PlanningCenterDirectory } from "@/lib/pco";
import { checkLeaderOrTeamLeader } from "./pco-mapping";
import { setRepresentative } from "./service";

const d = adminCopy.departments;

/**
 * Admin → Departments → a department → **Add a leader from Planning Center** (FR-38,
 * decided 2026-10-19). The administrator searches Planning Center and adds a leader before
 * they have ever signed in. They must pass the Group Leader check now, exactly as at
 * sign-in (FR-01a). Their account is created linked to their Planning Center profile, so
 * their first sign-in finds it by profile, never by email. Someone who already has an
 * account is added as they are. Audited, and they're emailed as for any assignment.
 */
export async function addLeaderFromPlanningCenter(
  tx: Tx,
  actor: Subject,
  directory: PlanningCenterDirectory | null,
  input: { departmentId: string; pcoPersonId: string; type: string },
  { now = new Date() }: { now?: Date } = {},
): Promise<{ name: string }> {
  const { actingRole } = assertCan(actor, "admin.departments");
  if (!directory) throw new RuleError(d.pco.unavailable);
  if (!/^\d+$/.test(input.pcoPersonId)) {
    throw new ValidationError({ pcoPersonId: adminCopy.common.notFound });
  }

  const settings = await getSignInSettings(tx);
  const [linked] = await tx
    .select()
    .from(users)
    .where(eq(users.pcoPersonId, input.pcoPersonId))
    .limit(1);
  if (linked) {
    // Staff never go through the Group Leader check at sign-in, so an account can be
    // unverified though Planning Center marks them a leader: check it now, as sign-in would.
    if (
      settings.leader.requireForRequesters &&
      (!linked.pcoLeaderVerified || linked.accessStatus === "suspended_not_leader")
    ) {
      const check = await checkLeaderOrTeamLeader(tx, directory, settings.leader, {
        pcoPersonId: input.pcoPersonId,
      });
      if (check.status === "unavailable") throw new RuleError(d.pco.unavailable);
      await applyVerification(tx, linked, check, {
        now,
        actor: { kind: "user", userId: actor.id, actingRole },
      });
    }
    // Staff who also lead a department need the requester role too (a union of roles).
    await tx
      .insert(userRoles)
      .values({ userId: linked.id, role: "requester", assignedByUserId: actor.id })
      .onConflictDoNothing();
    try {
      await setRepresentative(tx, actor, { ...input, userId: linked.id });
    } catch (error) {
      // This form has no person field to mark, so say it plainly.
      if (error instanceof ValidationError) {
        const reason = Object.values(error.fieldErrors)[0] ?? error.message;
        throw new RuleError(
          reason === d.errors.notLeader ? d.fromPco.notLeader(linked.displayName) : reason,
        );
      }
      throw error;
    }
    return { name: linked.displayName };
  }

  const check = await checkLeaderOrTeamLeader(tx, directory, settings.leader, {
    pcoPersonId: input.pcoPersonId,
  });
  if (check.status === "unavailable") throw new RuleError(d.pco.unavailable);
  if (check.status === "not_found" || check.status === "ambiguous") {
    throw new RuleError(adminCopy.common.notFound);
  }
  const person: PcoPerson = check.person;
  if (settings.leader.requireForRequesters && check.status !== "leader") {
    throw new RuleError(d.fromPco.notLeader(person.name));
  }
  const email = person.emails[0]?.trim().toLowerCase();
  if (!email) throw new RuleError(d.fromPco.noEmail(person.name));
  const [sameEmail] = await tx
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  // Never join two identities by email (docs/decisions.md): the administrator links it.
  if (sameEmail) throw new RuleError(d.fromPco.emailTaken(email));

  const leader = check.status === "leader";
  const [created] = await tx
    .insert(users)
    .values({
      email,
      displayName: person.name.trim() || email,
      pcoPersonId: person.id,
      pcoLeaderVerified: leader,
      pcoVerifiedAt: leader ? now : null,
      pcoFieldValueSnapshot: check.fieldValue,
      accessStatus: "pending_department",
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: users.id, name: users.displayName });
  await tx
    .insert(userRoles)
    .values({ userId: created.id, role: "requester", assignedByUserId: actor.id });
  await writeAudit(tx, {
    actor: { kind: "user", userId: actor.id, actingRole },
    area: "admin",
    eventType: "admin.user_added",
    entity: { type: "user", id: created.id },
    details: {
      after: { email, name: created.name, roles: ["requester"] },
      source: "planning_center",
      pcoPersonId: person.id,
      groupLeader: leader,
    },
  });
  await setRepresentative(tx, actor, { ...input, userId: created.id });
  return { name: created.name };
}
