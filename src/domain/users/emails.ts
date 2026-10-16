import { and, count, eq, gte } from "drizzle-orm";
import { emailCopy } from "@/copy/email";
import { copy } from "@/copy/en-CA";
import { emailOutbox, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { emailBrand, queueNotice } from "@/domain/notifications/notice";
import { accountantRecipients, administrators, person } from "@/domain/notifications/recipients";
import { getChurchTimeZone } from "@/domain/settings";
import { appUrl } from "@/lib/email/layout";
import type { Role } from "@/lib/roles";
import { zonedDate } from "@/lib/time-zone";

/**
 * Access emails (FR-01a, FR-21 "System", DRD 7.5 "role change"): new staff, role changes,
 * Group Leader changes, Planning Center outages and access requests.
 */

const m = emailCopy.access;
const f = emailCopy.facts;
const s = emailCopy.statuses;
const b = emailCopy.buttons;

const roleList = (roles: readonly Role[]) =>
  roles.length === 0 ? m.rolesChanged.noRoles : roles.map((r) => copy.roles[r]).join(", ");

async function nameAndEmail(tx: Tx, userId: string) {
  const [row] = await tx
    .select({ name: users.displayName, email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  return row ?? { name: "", email: "" };
}

const personLink = (userId: string) => ({
  label: b.openPerson,
  href: appUrl(`/admin/users/${userId}`),
});

/** Staff added by an administrator are told they can sign in. */
export async function emailStaffAdded(tx: Tx, userId: string, roles: readonly Role[]) {
  const brand = await emailBrand(tx);
  await queueNotice(tx, {
    template: "access.staff_added",
    audience: "person",
    to: await person(tx, userId),
    content: {
      subject: m.staffAdded.subject(brand.appName),
      heading: m.staffAdded.heading,
      status: s.forYourRecords,
      paragraphs: [m.staffAdded.intro(brand.appName, brand.churchName)],
      facts: [{ label: f.roles, value: roleList(roles) }],
      action: emailCopy.noAction,
      button: { label: b.signIn, href: appUrl("/sign-in") },
    },
  });
}

export async function emailRolesChanged(
  tx: Tx,
  userId: string,
  before: readonly Role[],
  after: readonly Role[],
) {
  await queueNotice(tx, {
    template: "access.roles_changed",
    audience: "person",
    to: await person(tx, userId),
    content: {
      subject: m.rolesChanged.subject,
      heading: m.rolesChanged.heading,
      status: s.forYourRecords,
      paragraphs: [m.rolesChanged.intro],
      facts: [
        { label: f.roles, value: roleList(after) },
        { label: f.previousRoles, value: roleList(before) },
      ],
      action: emailCopy.noAction,
      button: { label: b.openApp, href: appUrl("/") },
    },
  });
}

/** A verified leader with no department yet (FR-01a "New leaders"). */
export async function emailNewLeaderWaiting(tx: Tx, userId: string) {
  const who = await nameAndEmail(tx, userId);
  await queueNotice(tx, {
    template: "access.new_leader_waiting",
    audience: "administrator",
    to: await administrators(tx),
    content: {
      subject: m.newLeaderWaiting.subject(who.name),
      heading: m.newLeaderWaiting.heading,
      status: s.actionNeeded,
      paragraphs: [m.newLeaderWaiting.intro(who.name)],
      facts: [
        { label: f.person, value: who.name },
        { label: f.email, value: who.email },
      ],
      action: m.newLeaderWaiting.action,
      button: { label: b.openDepartments, href: appUrl("/admin/departments") },
    },
  });
}

/** Requester access stopped because Planning Center no longer lists them (FR-01a, AC-9). */
export async function emailLeaderSuspended(tx: Tx, userId: string) {
  const who = await nameAndEmail(tx, userId);
  const to = [...(await administrators(tx)), ...(await accountantRecipients(tx))];
  await queueNotice(tx, {
    template: "access.leader_suspended",
    audience: "administrator",
    to,
    content: {
      subject: m.leaderSuspended.subject(who.name),
      heading: m.leaderSuspended.heading,
      status: s.forYourRecords,
      paragraphs: [m.leaderSuspended.intro(who.name)],
      facts: [
        { label: f.person, value: who.name },
        { label: f.email, value: who.email },
      ],
      action: m.leaderSuspended.action,
      button: personLink(userId),
    },
  });
}

/** The nightly check couldn't reach Planning Center: at most one email a day (FR-01a). */
export async function emailPcoUnavailable(tx: Tx, now: Date) {
  const zone = await getChurchTimeZone(tx);
  await queueNotice(tx, {
    template: "access.pco_unavailable",
    audience: "administrator",
    to: await administrators(tx),
    dedupeKey: `pco-unavailable:${zonedDate(now, zone)}`,
    now,
    content: {
      subject: m.pcoUnavailable.subject,
      heading: m.pcoUnavailable.heading,
      status: s.actionNeeded,
      paragraphs: [m.pcoUnavailable.intro],
      action: m.pcoUnavailable.action,
      button: { label: b.openSettings, href: appUrl("/admin/settings") },
    },
  });
}

/**
 * Most access-request emails a day. Anyone with a Google or Planning Center account can
 * try to sign in, so the emails are capped to keep the shared Resend quota for budgets.
 */
export const ACCESS_REQUESTS_PER_DAY = 10;

/** Someone without access tried to sign in (FR-21 "access request"): once a day per address. */
export async function emailAccessRequest(
  tx: Tx,
  input: { email: string | null; name: string | null; method: string; now: Date },
) {
  const who = input.email?.trim().toLowerCase();
  if (!who) return;
  const zone = await getChurchTimeZone(tx);
  const day = zonedDate(input.now, zone);
  const [{ sentToday }] = await tx
    .select({ sentToday: count() })
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.template, "access.request"),
        gte(emailOutbox.createdAt, new Date(input.now.getTime() - 86_400_000)),
      ),
    );
  const admins = await administrators(tx);
  if (sentToday >= ACCESS_REQUESTS_PER_DAY * Math.max(admins.length, 1)) return;
  const label = input.name ? `${input.name} (${who})` : who;
  await queueNotice(tx, {
    template: "access.request",
    audience: "administrator",
    to: admins,
    dedupeKey: `access-request:${who}:${day}`,
    now: input.now,
    content: {
      subject: m.accessRequest.subject(label),
      heading: m.accessRequest.heading,
      status: s.forYourRecords,
      paragraphs: [m.accessRequest.intro(input.method)],
      facts: [
        ...(input.name ? [{ label: f.person, value: input.name }] : []),
        { label: f.email, value: who },
      ],
      action: m.accessRequest.action,
      button: { label: b.openUsers, href: appUrl("/admin/users") },
    },
  });
}

/** The Primary accountant lost the role or left: the administrators choose another. */
export async function emailPrimaryAccountantCleared(tx: Tx, userId: string) {
  const who = await nameAndEmail(tx, userId);
  await queueNotice(tx, {
    template: "access.primary_accountant_cleared",
    audience: "administrator",
    to: await administrators(tx),
    content: {
      subject: m.primaryAccountantCleared.subject,
      heading: m.primaryAccountantCleared.heading,
      status: s.actionNeeded,
      paragraphs: [m.primaryAccountantCleared.intro(who.name)],
      action: m.primaryAccountantCleared.action,
      button: { label: b.openSettings, href: appUrl("/admin/settings") },
    },
  });
}
