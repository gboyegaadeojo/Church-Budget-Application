import { and, eq, inArray, ne } from "drizzle-orm";
import { userRoles, users } from "@/db/schema";
import type { Db } from "@/db/types";
import { getSignInSettings } from "@/domain/settings";
import { writeAudit } from "@/lib/audit";
import type { PlanningCenterDirectory } from "@/lib/pco";
import type { Role } from "@/lib/roles";
import { checkLeader } from "./leader-check";
import { refreshMinistryDepartments } from "./ministry-departments";
import { rolesOf } from "./sign-in";
import { applyVerification } from "./verification";

export type PcoVerifySummary = {
  checked: number;
  verified: number;
  suspended: number;
  /** Departments leaders joined through their Ministry Department field. */
  departmentsJoined: number;
  unavailable: boolean;
};

const STAFF: Role[] = [
  "accountant",
  "backup_approver",
  "board_chair",
  "vice_chair",
  "church_admin",
  "system_admin",
];

/**
 * Nightly `pco-verify` job (FR-01a "When checked", AC-9): re-checks everyone who must be
 * a Group Leader. Each person is checked in their own transaction, so one failure does
 * not undo the others. If Planning Center is down, nothing changes and the outage is
 * logged once; the 72-hour grace period then applies at sign-in.
 */
export async function runPcoVerification(
  db: Db,
  directory: PlanningCenterDirectory,
  now: Date = new Date(),
): Promise<PcoVerifySummary> {
  const settings = await getSignInSettings(db);
  const summary: PcoVerifySummary = {
    checked: 0,
    verified: 0,
    suspended: 0,
    departmentsJoined: 0,
    unavailable: false,
  };

  try {
    await directory.organizationId();
  } catch (error) {
    summary.unavailable = true;
    await writeAudit(db, {
      actor: { kind: "job" },
      area: "access",
      eventType: "access.pco_unavailable",
      entity: { type: "job", id: "pco-verify" },
      reason: error instanceof Error ? error.message : "Planning Center unavailable",
    });
    // TODO(step 7): email the administrator about the outage (FR-01a).
    return summary;
  }

  const roles: Role[] = [
    ...(settings.leader.requireForRequesters ? (["requester"] as Role[]) : []),
    ...(settings.leader.requireForStaff ? STAFF : []),
  ];
  if (roles.length === 0) return summary;

  const people = await db
    .selectDistinct({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(
      and(
        inArray(userRoles.role, roles),
        eq(users.active, true),
        ne(users.accessStatus, "inactive"),
      ),
    );

  for (const { id } of people) {
    await db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, id)).for("update");
      const check = await checkLeader(directory, settings.leader, {
        pcoPersonId: user.pcoPersonId,
        email: user.pcoPersonId ? null : user.email,
      });
      const outcome = await applyVerification(tx, user, check, { now, actor: { kind: "job" } });
      if (check.status === "leader" && (await rolesOf(tx, user.id)).includes("requester")) {
        const synced = await refreshMinistryDepartments(
          tx,
          directory,
          { id: user.id, pcoPersonId: check.person.id },
          { now, actor: { kind: "job" } },
        );
        if (synced) summary.departmentsJoined += synced.joined.length;
      }
      summary.checked++;
      if (check.status === "leader") summary.verified++;
      if (!outcome.requesterUsable && check.status !== "unavailable") summary.suspended++;
    });
  }

  await writeAudit(db, {
    actor: { kind: "job" },
    area: "access",
    eventType: "access.pco_verification_run",
    entity: { type: "job", id: "pco-verify" },
    details: { ...summary },
  });
  return summary;
}
