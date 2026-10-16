import { eq } from "drizzle-orm";
import { adminCopy } from "@/copy/admin";
import { emailCopy } from "@/copy/email";
import { users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { queueNotice } from "@/domain/notifications/notice";
import { administrators, person, representativesOf } from "@/domain/notifications/recipients";
import { appUrl } from "@/lib/email/layout";
import type { Recipient } from "@/lib/email/outbox";

/**
 * Department emails (FR-03, FR-38, FR-21 "Role or department assignment changed").
 * Called inside the service's transaction, after its audit event.
 */

const m = emailCopy.departments;
const f = emailCopy.facts;
const s = emailCopy.statuses;
const b = emailCopy.buttons;
const slots = adminCopy.departments.slotLabels;

export type Slot = keyof typeof slots;

async function nameOf(tx: Tx, userId: string): Promise<string> {
  const [row] = await tx
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, userId));
  return row?.name ?? "";
}

const departmentLink = (id: string) => ({
  label: b.openDepartment,
  href: appUrl(`/admin/departments/${id}`),
});

/** A leader picked the department on the form; the administrator can undo it (FR-03). */
export async function emailLeaderJoined(
  tx: Tx,
  input: { userId: string; department: { id: string; name: string }; slot: Slot },
) {
  const who = await nameOf(tx, input.userId);
  await queueNotice(tx, {
    template: "department.leader_joined",
    audience: "administrator",
    to: await administrators(tx),
    content: {
      subject: m.leaderJoined.subject(who, input.department.name),
      heading: m.leaderJoined.heading,
      status: s.forYourRecords,
      paragraphs: [m.leaderJoined.intro(who, input.department.name, slots[input.slot])],
      facts: [
        { label: f.person, value: who },
        { label: f.department, value: input.department.name },
        { label: f.slot, value: slots[input.slot] },
      ],
      action: m.leaderJoined.action,
      button: departmentLink(input.department.id),
    },
  });
}

/** Planning Center suggests a leader for a mapped department in Suggest mode (FR-39). */
export async function emailLeaderSuggested(
  tx: Tx,
  input: { userId: string; department: { id: string; name: string }; source: string },
) {
  const who = await nameOf(tx, input.userId);
  await queueNotice(tx, {
    template: "department.leader_suggested",
    audience: "administrator",
    to: await administrators(tx),
    dedupeKey: `leader-suggested:${input.department.id}:${input.userId}`,
    content: {
      subject: m.leaderSuggested.subject(who, input.department.name),
      heading: m.leaderSuggested.heading,
      status: s.actionNeeded,
      paragraphs: [m.leaderSuggested.intro(who, input.department.name, input.source)],
      facts: [
        { label: f.person, value: who },
        { label: f.department, value: input.department.name },
      ],
      action: m.leaderSuggested.action,
      button: departmentLink(input.department.id),
    },
  });
}

/** Someone typed a department that isn't listed (FR-03, AC-14). */
export async function emailDepartmentProposed(
  tx: Tx,
  input: { userId: string; department: { id: string; name: string } },
) {
  const who = await nameOf(tx, input.userId);
  await queueNotice(tx, {
    template: "department.proposed",
    audience: "administrator",
    to: await administrators(tx),
    content: {
      subject: m.proposed.subject(input.department.name),
      heading: m.proposed.heading,
      status: s.actionNeeded,
      paragraphs: [m.proposed.intro(who, input.department.name)],
      facts: [
        { label: f.department, value: input.department.name },
        { label: f.person, value: who },
      ],
      action: m.proposed.action,
      button: departmentLink(input.department.id),
    },
  });
}

/** The proposer and anyone who joined the proposed department. */
async function proposalPeople(
  tx: Tx,
  departmentId: string,
  proposedByUserId: string | null,
): Promise<Recipient[]> {
  const leaders = await representativesOf(tx, [departmentId]);
  const proposer = proposedByUserId ? await person(tx, proposedByUserId) : [];
  return [...proposer, ...leaders];
}

export async function emailProposalAccepted(
  tx: Tx,
  department: { id: string; name: string; proposedByUserId: string | null },
) {
  await queueNotice(tx, {
    template: "department.accepted",
    audience: "requester",
    to: await proposalPeople(tx, department.id, department.proposedByUserId),
    content: {
      subject: m.accepted.subject(department.name),
      heading: m.accepted.heading,
      status: s.forYourRecords,
      paragraphs: [m.accepted.intro(department.name)],
      facts: [{ label: f.department, value: department.name }],
      action: emailCopy.noAction,
      button: { label: b.openBudget, href: appUrl("/annual") },
    },
  });
}

/** Call before the leaders move, so the proposed department's people are still found. */
export async function proposalRecipients(
  tx: Tx,
  department: { id: string; proposedByUserId: string | null },
) {
  return proposalPeople(tx, department.id, department.proposedByUserId);
}

export async function emailProposalMerged(
  tx: Tx,
  input: { from: string; into: string; to: Recipient[] },
) {
  await queueNotice(tx, {
    template: "department.merged",
    audience: "requester",
    to: input.to,
    content: {
      subject: m.merged.subject(input.from, input.into),
      heading: m.merged.heading,
      status: s.forYourRecords,
      paragraphs: [m.merged.intro(input.from, input.into)],
      facts: [{ label: f.department, value: input.into }],
      action: emailCopy.noAction,
      button: { label: b.openBudget, href: appUrl("/annual") },
    },
  });
}

export async function emailProposalRejected(
  tx: Tx,
  department: { id: string; name: string; proposedByUserId: string | null },
  reason: string,
) {
  await queueNotice(tx, {
    template: "department.rejected",
    audience: "requester",
    to: await proposalPeople(tx, department.id, department.proposedByUserId),
    content: {
      subject: m.rejected.subject(department.name),
      heading: m.rejected.heading,
      status: s.actionNeeded,
      paragraphs: [m.rejected.intro(department.name)],
      facts: [{ label: f.department, value: department.name }],
      note: { label: f.reason, text: reason },
      action: m.rejected.action,
      button: { label: b.openBudget, href: appUrl("/annual") },
    },
  });
}

/** The administrator put someone in a slot (FR-21 "Role or department assignment changed"). */
export async function emailAssigned(
  tx: Tx,
  input: { userId: string; department: { name: string }; slot: Slot },
) {
  await queueNotice(tx, {
    template: "department.assigned",
    audience: "person",
    to: await person(tx, input.userId),
    content: {
      subject: m.assigned.subject(input.department.name),
      heading: m.assigned.heading,
      status: s.forYourRecords,
      paragraphs: [m.assigned.intro(input.department.name, slots[input.slot])],
      facts: [
        { label: f.department, value: input.department.name },
        { label: f.slot, value: slots[input.slot] },
      ],
      action: emailCopy.noAction,
      button: { label: b.openBudget, href: appUrl("/annual") },
    },
  });
}

export async function emailRemoved(
  tx: Tx,
  input: { userId: string; department: { name: string } },
) {
  await queueNotice(tx, {
    template: "department.removed",
    audience: "person",
    to: await person(tx, input.userId),
    content: {
      subject: m.removed.subject(input.department.name),
      heading: m.removed.heading,
      status: s.forYourRecords,
      paragraphs: [m.removed.intro(input.department.name)],
      facts: [{ label: f.department, value: input.department.name }],
      action: emailCopy.noAction,
      button: { label: b.openApp, href: appUrl("/") },
    },
  });
}

/** Backup 1 became Primary automatically (FR-38). */
export async function emailBackupPromoted(
  tx: Tx,
  input: { userId: string; department: { id: string; name: string }; why: string },
) {
  const who = await nameOf(tx, input.userId);
  await queueNotice(tx, {
    template: "department.backup_promoted",
    audience: "administrator",
    to: await administrators(tx),
    content: {
      subject: m.backupPromoted.subject(who, input.department.name),
      heading: m.backupPromoted.heading,
      status: s.forYourRecords,
      paragraphs: [m.backupPromoted.intro(who, input.department.name, input.why)],
      facts: [
        { label: f.department, value: input.department.name },
        { label: f.person, value: who },
      ],
      action: m.backupPromoted.action,
      button: departmentLink(input.department.id),
    },
  });
  await emailAssigned(tx, { userId: input.userId, department: input.department, slot: "primary" });
}

/** A Primary named a Backup (FR-38, AC-117): the administrators can undo it. */
export async function emailBackupNominated(
  tx: Tx,
  input: {
    primaryId: string;
    userId: string;
    department: { id: string; name: string };
    slot: Slot;
  },
) {
  const [primary, who] = [await nameOf(tx, input.primaryId), await nameOf(tx, input.userId)];
  await queueNotice(tx, {
    template: "department.backup_nominated",
    audience: "administrator",
    to: await administrators(tx),
    content: {
      subject: m.backupNominated.subject(who, input.department.name),
      heading: m.backupNominated.heading,
      status: s.forYourRecords,
      paragraphs: [m.backupNominated.intro(primary, who, input.department.name, slots[input.slot])],
      facts: [
        { label: f.department, value: input.department.name },
        { label: f.person, value: who },
        { label: f.slot, value: slots[input.slot] },
      ],
      action: m.backupNominated.action,
      button: departmentLink(input.department.id),
    },
  });
}
