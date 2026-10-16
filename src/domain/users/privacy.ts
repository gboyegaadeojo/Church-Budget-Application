import { eq } from "drizzle-orm";
import { z } from "zod";
import { emailCopy } from "@/copy/email";
import { helpCopy } from "@/copy/help";
import { users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { parseInput } from "@/domain/errors";
import { queueNotice } from "@/domain/notifications/notice";
import { administrators } from "@/domain/notifications/recipients";
import { getChurchTimeZone } from "@/domain/settings";
import { writeAudit } from "@/lib/audit";
import type { Subject } from "@/lib/authz";
import { appUrl } from "@/lib/email/layout";
import { zonedDate } from "@/lib/time-zone";

/**
 * "See or correct my information" (FR-36, PIPEDA access and correction). Anyone signed in
 * may ask about their own information; the System Administrators are emailed and reply.
 * Only one request a day per person, so the shared email quota can't be used up.
 */

const e = helpCopy.myInfo.errors;
const m = emailCopy.access.privacyRequest;

export const PRIVACY_REQUEST_KINDS = ["see", "correct"] as const;
export type PrivacyRequestKind = (typeof PRIVACY_REQUEST_KINDS)[number];

const schema = z
  .object({
    kind: z.enum(PRIVACY_REQUEST_KINDS, { error: e.kind }),
    details: z.string().trim().max(2000, e.detailsLong),
  })
  .refine((v) => v.kind !== "correct" || v.details.length > 0, {
    path: ["details"],
    message: e.detailsRequired,
  });

export async function requestPrivacyHelp(
  tx: Tx,
  actor: Subject,
  input: { kind: string; details: string },
  { now = new Date() }: { now?: Date } = {},
): Promise<{ sent: boolean }> {
  const data = parseInput(schema, input);
  const [me] = await tx
    .select({ name: users.displayName, email: users.email })
    .from(users)
    .where(eq(users.id, actor.id));
  const day = zonedDate(now, await getChurchTimeZone(tx));
  const queued = await queueNotice(tx, {
    template: "access.privacy_request",
    audience: "administrator",
    to: await administrators(tx),
    dedupeKey: `privacy-request:${actor.id}:${day}`,
    now,
    content: {
      subject: m.subject(me.name),
      heading: m.heading,
      status: emailCopy.statuses.actionNeeded,
      paragraphs: [m.intro[data.kind](me.name)],
      facts: [
        { label: emailCopy.facts.person, value: me.name },
        { label: emailCopy.facts.email, value: me.email },
        { label: m.kind, value: m.kinds[data.kind] },
      ],
      note: data.details ? { label: m.details, text: data.details } : undefined,
      action: m.action,
      button: { label: emailCopy.buttons.openPerson, href: appUrl(`/admin/users/${actor.id}`) },
    },
  });
  if (queued === 0) return { sent: false };
  await writeAudit(tx, {
    actor: { kind: "user", userId: actor.id },
    area: "access",
    eventType: "access.privacy_requested",
    entity: { type: "user", id: actor.id },
    details: { kind: data.kind },
  });
  return { sent: true };
}
