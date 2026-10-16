import { eq, sql, type SQL } from "drizzle-orm";
import { userRoles, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { getSignInSettings } from "@/domain/settings";
import { writeAudit } from "@/lib/audit";
import { PlanningCenterUnavailableError, type PlanningCenterDirectory } from "@/lib/pco";
import type { Role } from "@/lib/roles";
import { emailAccessRequest, emailNewLeaderWaiting } from "./emails";
import type { AccessDeniedReason } from "./access";
import { checkLeader, type LeaderCheck } from "./leader-check";
import { refreshMinistryDepartments } from "./ministry-departments";
import { applyVerification } from "./verification";

/**
 * Sign-in (FR-01, FR-01a, AC-1 to AC-10). The identity has already been verified by
 * Auth.js (Google's or Planning Center's signed ID token). This decides whether that
 * identity gets in, as which account, and records it in the audit log.
 *
 * Account linking: a Google sign-in links by its verified email; a Planning Center
 * sign-in links only by Planning Center person id, because people can edit the emails
 * on their own Planning Center profile (see docs/decisions.md).
 */

export type ExternalIdentity = {
  provider: "google" | "planningcenter";
  /** Google's subject, or the Planning Center person id. */
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  /** Planning Center only: the organization the person signed in to. */
  organizationId?: string | null;
};

export type SignInResult =
  | { ok: true; userId: string; landing: "home" | "waiting" }
  | { ok: false; reason: AccessDeniedReason; email: string | null };

export type SignInDeps = {
  /** Null when Planning Center isn't configured. */
  directory: PlanningCenterDirectory | null;
  now: Date;
  requestIpHash?: string;
};

type UserRow = typeof users.$inferSelect;

const STAFF_ROLES: readonly Role[] = [
  "accountant",
  "backup_approver",
  "board_chair",
  "vice_chair",
  "church_admin",
  "system_admin",
];

const notConfigured = async (): Promise<never> => {
  throw new PlanningCenterUnavailableError("Planning Center is not configured");
};

/** Stands in when PCO_APP_ID / PCO_PAT_SECRET are missing: every call is an outage. */
const unavailableDirectory: PlanningCenterDirectory = {
  organizationId: notConfigured,
  findPeopleByEmail: notConfigured,
  getPerson: notConfigured,
  findFieldDefinition: notConfigured,
  listFieldDefinitions: notConfigured,
  searchPeople: notConfigured,
  getFieldValues: notConfigured,
};

export async function rolesOf(tx: Tx, userId: string): Promise<Role[]> {
  const rows = await tx
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  return rows.map((r) => r.role);
}

async function findBy(tx: Tx, where: SQL): Promise<UserRow | undefined> {
  const [row] = await tx.select().from(users).where(where).limit(1);
  return row;
}

export async function resolveSignIn(
  tx: Tx,
  deps: SignInDeps,
  identity: ExternalIdentity,
): Promise<SignInResult> {
  const settings = await getSignInSettings(tx);
  const method = identity.provider;
  const email = identity.email?.trim().toLowerCase() || null;
  const directory = deps.directory ?? unavailableDirectory;

  const deny = async (
    reason: AccessDeniedReason,
    detail: string,
    userId?: string,
  ): Promise<SignInResult> => {
    await writeAudit(tx, {
      actor: userId ? { kind: "user", userId } : { kind: "system" },
      area: "access",
      eventType: "access.sign_in_failed",
      entity: { type: "user", id: userId },
      reason: detail,
      details: { method, result: reason, email },
      requestIpHash: deps.requestIpHash,
    });
    return { ok: false, reason, email };
  };

  const succeed = async (userId: string, landing: "home" | "waiting"): Promise<SignInResult> => {
    await writeAudit(tx, {
      actor: { kind: "user", userId },
      area: "access",
      eventType: "access.sign_in_succeeded",
      entity: { type: "user", id: userId },
      details: { method },
      requestIpHash: deps.requestIpHash,
    });
    return { ok: true, userId, landing };
  };

  // 1. The method must be turned on, and the identity trustworthy.
  if (method === "google" && !settings.googleEnabled) {
    return deny("not-allowed", "Google sign-in is turned off");
  }
  if (method === "planningcenter" && !settings.planningCenterEnabled) {
    return deny("not-allowed", "Planning Center sign-in is turned off");
  }
  if (method === "google" && (!email || !identity.emailVerified)) {
    return deny("not-allowed", "Google did not confirm the email address");
  }
  if (method === "planningcenter") {
    let churchOrg: string;
    try {
      churchOrg = await directory.organizationId();
    } catch {
      return deny("unavailable", "Planning Center could not be reached to confirm the church");
    }
    if (identity.organizationId !== churchOrg) {
      return deny("not-allowed", "Planning Center account belongs to another organization");
    }
  }

  // 2. Find the account.
  let user =
    method === "google"
      ? await findBy(tx, eq(users.googleSubjectId, identity.subject))
      : await findBy(tx, eq(users.pcoPersonId, identity.subject));

  if (!user && email) {
    const byEmail = await findBy(tx, sql`lower(${users.email}) = ${email}`);
    if (byEmail) {
      if (method === "google") {
        if (byEmail.googleSubjectId && byEmail.googleSubjectId !== identity.subject) {
          return deny("not-allowed", "Email is linked to a different Google account", byEmail.id);
        }
        await tx
          .update(users)
          .set({ googleSubjectId: identity.subject, updatedAt: deps.now })
          .where(eq(users.id, byEmail.id));
        await writeAudit(tx, {
          actor: { kind: "user", userId: byEmail.id },
          area: "access",
          eventType: "access.identity_linked",
          entity: { type: "user", id: byEmail.id },
          details: { method, by: "verified email" },
        });
        user = { ...byEmail, googleSubjectId: identity.subject };
      } else {
        return deny(
          "link-required",
          "Planning Center account is not linked to the account with this email",
          byEmail.id,
        );
      }
    }
  }

  // 3a. Known account.
  if (user) {
    if (!user.active || user.accessStatus === "inactive") {
      return deny("not-allowed", "Account is deactivated", user.id);
    }
    const roles = await rolesOf(tx, user.id);
    const staff = roles.some((r) => STAFF_ROLES.includes(r));
    const requester = roles.includes("requester");
    const staffMustVerify = staff && settings.leader.requireForStaff;
    const mustVerify = (requester && settings.leader.requireForRequesters) || staffMustVerify;

    if (roles.length === 0) return deny("not-allowed", "Account has no roles", user.id);

    if (!mustVerify) {
      if (method === "google" && !user.pcoPersonId && deps.directory) {
        await linkPlanningCenterByEmail(tx, deps.directory, user, email!, deps.now);
      }
      return succeed(user.id, "home");
    }

    const check = await checkLeader(directory, settings.leader, {
      pcoPersonId: user.pcoPersonId ?? (method === "planningcenter" ? identity.subject : null),
      email: user.pcoPersonId ? null : email,
    });
    const outcome = await applyVerification(tx, user, check, {
      now: deps.now,
      actor: { kind: "user", userId: user.id },
    });
    // A verified leader's Ministry Department picks their departments (FR-39 field source).
    if (requester && check.status === "leader") {
      await refreshMinistryDepartments(
        tx,
        directory,
        { id: user.id, pcoPersonId: check.person.id },
        { now: deps.now, actor: { kind: "user", userId: user.id } },
      );
    }

    // Staff who don't need the check still get in as staff; only the requester role stops.
    if (outcome.requesterUsable || (staff && !staffMustVerify)) {
      const [fresh] = await tx
        .select({ accessStatus: users.accessStatus })
        .from(users)
        .where(eq(users.id, user.id));
      const waiting = !staff && fresh.accessStatus === "pending_department";
      return succeed(user.id, waiting ? "waiting" : "home");
    }
    return deny(
      // Someone verified before (or already suspended) sees "suspended", not "not a leader".
      deniedReason(
        check,
        outcome.suspended || user.pcoLeaderVerified || user.accessStatus === "suspended_not_leader",
      ),
      describe(check),
      user.id,
    );
  }

  // 3b. New person: only verified Group Leaders join by themselves (FR-01a "New leaders").
  // Anyone else is an access request for the administrators (FR-21 "System").
  const denyNewPerson = async (reason: AccessDeniedReason, detail: string) => {
    const result = await deny(reason, detail);
    if (reason !== "unavailable") {
      await emailAccessRequest(tx, {
        email,
        name: identity.name ?? null,
        method: method === "google" ? "Google" : "Planning Center",
        now: deps.now,
      });
    }
    return result;
  };
  if (!settings.leader.requireForRequesters) {
    return denyNewPerson("not-allowed", "No account, and leaders do not join by Planning Center");
  }
  const check = await checkLeader(directory, settings.leader, {
    pcoPersonId: method === "planningcenter" ? identity.subject : null,
    email: method === "google" ? email : null,
  });
  if (check.status !== "leader") return denyNewPerson(deniedReason(check, false), describe(check));

  const accountEmail = email ?? check.person.emails[0] ?? null;
  if (!accountEmail) return deny("not-allowed", "No email address on the Planning Center profile");
  if (await findBy(tx, eq(users.pcoPersonId, check.person.id))) {
    return deny("link-required", "Planning Center person is linked to another account");
  }

  const [created] = await tx
    .insert(users)
    .values({
      email: accountEmail,
      displayName: identity.name?.trim() || check.person.name || accountEmail,
      googleSubjectId: method === "google" ? identity.subject : null,
      pcoPersonId: check.person.id,
      pcoLeaderVerified: true,
      pcoVerifiedAt: deps.now,
      pcoFieldValueSnapshot: check.fieldValue,
      accessStatus: "pending_department",
    })
    .returning({ id: users.id });
  await tx.insert(userRoles).values({ userId: created.id, role: "requester" });
  await writeAudit(tx, {
    actor: { kind: "user", userId: created.id },
    area: "access",
    eventType: "access.leader_granted",
    entity: { type: "user", id: created.id },
    details: {
      method,
      fieldValue: check.fieldValue,
      pcoPersonId: check.person.id,
      newAccount: true,
    },
  });
  // A Ministry Department that names a department takes them straight there.
  const synced = await refreshMinistryDepartments(
    tx,
    directory,
    { id: created.id, pcoPersonId: check.person.id },
    { now: deps.now, actor: { kind: "user", userId: created.id } },
  );
  if (synced && synced.joined.length > 0) return succeed(created.id, "home");
  await emailNewLeaderWaiting(tx, created.id);
  return succeed(created.id, "waiting");
}

function deniedReason(check: LeaderCheck, wasLeader: boolean): AccessDeniedReason {
  switch (check.status) {
    case "unavailable":
      return "unavailable";
    case "not_found":
    case "ambiguous":
      return wasLeader ? "suspended" : "not-found";
    default:
      return wasLeader ? "suspended" : "not-leader";
  }
}

function describe(check: LeaderCheck): string {
  switch (check.status) {
    case "unavailable":
      return check.reason;
    case "not_found":
      return "No Planning Center person matches";
    case "ambiguous":
      return "Several Planning Center people share this email";
    case "not_leader":
      return `Planning Center field value is ${check.fieldValue === null ? "empty" : `"${check.fieldValue}"`}`;
    default:
      return "Verified";
  }
}

/**
 * Links a staff member's Planning Center person when their verified Google email
 * matches exactly one Planning Center person (FR-01a). Best effort: an outage or an
 * ambiguous match leaves the account unlinked.
 */
async function linkPlanningCenterByEmail(
  tx: Tx,
  directory: PlanningCenterDirectory,
  user: UserRow,
  email: string,
  now: Date,
) {
  try {
    const people = (await directory.findPeopleByEmail(email)).filter(
      (p) => p.status !== "inactive",
    );
    if (people.length !== 1) return;
    if (await findBy(tx, eq(users.pcoPersonId, people[0].id))) return;
    await tx
      .update(users)
      .set({ pcoPersonId: people[0].id, updatedAt: now })
      .where(eq(users.id, user.id));
    await writeAudit(tx, {
      actor: { kind: "user", userId: user.id },
      area: "access",
      eventType: "access.identity_linked",
      entity: { type: "user", id: user.id },
      details: { method: "planningcenter", by: "verified Google email", pcoPersonId: people[0].id },
    });
  } catch {
    // Planning Center unavailable: try again at the next sign-in.
  }
}
