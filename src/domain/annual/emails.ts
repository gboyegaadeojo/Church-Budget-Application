import { and, desc, eq } from "drizzle-orm";
import { emailCopy } from "@/copy/email";
import {
  approvalDecisions,
  approvedLineItems,
  budgetCycles,
  budgetLineItems,
  budgetRequests,
  requestRevisions,
  users,
} from "@/db/schema";
import type { Tx } from "@/db/types";
import {
  accountantRecipients,
  departmentRepresentatives,
  usersWithRole,
} from "@/domain/notifications/recipients";
import { getChurchTimeZone, readSettings } from "@/domain/settings";
import { appUrl, type EmailBrand, type EmailContent, type EmailLine } from "@/lib/email/layout";
import { enqueueEmail, type EmailAudience, type Recipient } from "@/lib/email/outbox";
import { annualCopy } from "@/copy/annual";
import { differenceText, formatCAD, type TaxBreakdown } from "@/lib/money";
import { formatDateTime } from "@/lib/time-zone";
import { describeChange, revisionChanges, type Snapshot } from "./revision-diff";
import { editsRemaining, lineRowsOf } from "./service";

/**
 * The annual budget emails (FR-11, FR-19, FR-21 "Request lifecycle"). Each service
 * calls `queueAnnualEmails` in its transaction, after the change and its audit event;
 * the rows are sent after commit. Content is built from the stored request, never from
 * what the browser sent, and amounts always show Subtotal / Sales tax / Total.
 */

export type AnnualEmailEvent =
  | { kind: "submitted" }
  | { kind: "revised" }
  | { kind: "clarification_answered" }
  | { kind: "review_started" }
  | { kind: "returned"; question: string }
  | { kind: "approved" }
  | { kind: "declined"; reason: string }
  | { kind: "reopened"; reason: string };

const a = emailCopy.annual;
const changeWords = annualCopy.review.changes;

type Context = Awaited<ReturnType<typeof loadContext>>;

async function loadContext(tx: Tx, requestId: string, actorId: string) {
  const [row] = await tx
    .select({ request: budgetRequests, cycleName: budgetCycles.name })
    .from(budgetRequests)
    .innerJoin(budgetCycles, eq(budgetCycles.id, budgetRequests.budgetCycleId))
    .where(eq(budgetRequests.id, requestId));
  const [actor] = await tx
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, actorId));
  const settings = await readSettings(tx, ["church_name", "app_name"]);
  return {
    request: row.request,
    cycleName: row.cycleName,
    actorName: actor?.name ?? "",
    zone: await getChurchTimeZone(tx),
    brand: { churchName: settings.church_name, appName: settings.app_name } as EmailBrand,
  };
}

function requested(r: Context["request"]): TaxBreakdown {
  return {
    subtotal: r.requestedSubtotalCents!,
    tax: r.requestedTaxCents!,
    total: r.requestedTotalCents!,
  };
}

function facts(ctx: Context, extra: { label: string; value: string }[] = []) {
  const r = ctx.request;
  return [
    { label: a.facts.reference, value: r.referenceNumber ?? "" },
    { label: a.facts.department, value: r.departmentNameSnapshot },
    { label: a.facts.cycle, value: ctx.cycleName },
    ...(r.title ? [{ label: a.facts.title, value: r.title }] : []),
    ...extra,
  ];
}

async function workingLines(tx: Tx, requestId: string): Promise<EmailLine[]> {
  return (await lineRowsOf(tx, requestId)).map((l) => ({
    name: l.itemName,
    quantity: l.quantity,
    unitPriceCents: l.unitPriceCents,
    totalCents: l.lineTotalCents,
  }));
}

/** What changed between the two latest submitted versions, in words. */
async function latestChanges(tx: Tx, requestId: string): Promise<string[]> {
  const [next, previous] = await tx
    .select({
      snapshot: requestRevisions.requestSnapshot,
      totalCents: requestRevisions.totalCents,
    })
    .from(requestRevisions)
    .where(eq(requestRevisions.budgetRequestId, requestId))
    .orderBy(desc(requestRevisions.revisionNumber))
    .limit(2);
  if (!next || !previous) return [];
  const changes = revisionChanges(previous.snapshot as Snapshot, next.snapshot as Snapshot).map(
    describeChange,
  );
  if (previous.totalCents !== next.totalCents) {
    changes.push(changeWords.total(formatCAD(previous.totalCents), formatCAD(next.totalCents)));
  }
  return changes.length > 0 ? changes : [changeWords.none];
}

/** The approval just recorded, with its approved lines (FR-19). */
async function latestApproval(tx: Tx, requestId: string) {
  const [decision] = await tx
    .select()
    .from(approvalDecisions)
    .where(
      and(
        eq(approvalDecisions.budgetRequestId, requestId),
        eq(approvalDecisions.decision, "approved"),
      ),
    )
    .orderBy(desc(approvalDecisions.createdAt))
    .limit(1);
  const lines = await tx
    .select({
      name: budgetLineItems.itemName,
      quantity: approvedLineItems.approvedQuantity,
      unitPriceCents: approvedLineItems.approvedUnitPriceCents,
      totalCents: approvedLineItems.approvedLineTotalCents,
      requestedQuantity: budgetLineItems.quantity,
      requestedUnitPriceCents: budgetLineItems.unitPriceCents,
    })
    .from(approvedLineItems)
    .innerJoin(budgetLineItems, eq(budgetLineItems.id, approvedLineItems.budgetLineItemId))
    .where(eq(approvedLineItems.approvalDecisionId, decision.id))
    .orderBy(budgetLineItems.sortOrder);
  return {
    decision,
    lines: lines
      .filter((l) => l.totalCents > 0)
      .map((l): EmailLine => ({
        name: l.name,
        quantity: l.quantity ?? l.requestedQuantity,
        unitPriceCents: l.unitPriceCents ?? l.requestedUnitPriceCents,
        totalCents: l.totalCents,
      })),
  };
}

type Outgoing = {
  template: string;
  audience: EmailAudience;
  to: Recipient[];
  content: EmailContent;
};

/**
 * Scheduled release (FR-19a): `hold` queues a decision's staff emails now and keeps the
 * department's email back; at release, `only: "requester"` sends just that email, with
 * the accountant's shared message and the time the decision was made.
 */
export type AnnualEmailOptions = {
  now?: Date;
  hold?: { releaseAt: Date };
  only?: "requester";
  releaseMessage?: string | null;
  decidedAt?: Date;
};

export async function queueAnnualEmails(
  tx: Tx,
  requestId: string,
  actorId: string,
  event: AnnualEmailEvent,
  options: AnnualEmailOptions = {},
): Promise<void> {
  const now = options.now ?? new Date();
  const ctx = await loadContext(tx, requestId, actorId);
  const r = ctx.request;
  const subjectArgs = [r.departmentNameSnapshot, ctx.cycleName, r.referenceNumber ?? ""] as const;
  const requesterLink = { label: a.viewRequest, href: appUrl(`/annual/${r.id}`) };
  const reviewLink = { label: a.reviewRequest, href: appUrl(`/annual/review/${r.id}`) };
  const time = formatDateTime(now, ctx.zone);
  const reps = await departmentRepresentatives(tx, r.departmentId);
  const accountants = await accountantRecipients(tx, now);
  const left = editsRemaining(r);
  const summary = { kind: "single" as const, totals: requested(r), rate: r.taxRate! };
  const out: Outgoing[] = [];
  const release = options.hold ? formatDateTime(options.hold.releaseAt, ctx.zone) : null;
  const shared = options.releaseMessage?.trim()
    ? [`${a.releaseMessage}: ${options.releaseMessage.trim()}`]
    : [];

  switch (event.kind) {
    case "submitted": {
      const items = { heading: a.items, items: await workingLines(tx, r.id) };
      out.push(
        {
          template: "annual.submitted.receipt",
          audience: "requester",
          to: reps,
          content: {
            subject: a.receipt.subject(...subjectArgs),
            heading: a.receipt.heading,
            status: a.statuses.submitted,
            paragraphs: [a.receipt.intro(ctx.cycleName, time)],
            facts: facts(ctx),
            summary,
            lines: items,
            action: `${emailCopy.noAction} ${a.editsLeft(left)}`,
            button: requesterLink,
          },
        },
        {
          template: "annual.submitted.accountant",
          audience: "accountant",
          to: accountants,
          content: {
            subject: a.newSubmission.subject(...subjectArgs),
            heading: a.newSubmission.heading,
            status: a.statuses.submitted,
            paragraphs: [a.newSubmission.intro(r.departmentNameSnapshot, ctx.actorName)],
            facts: facts(ctx, [{ label: a.facts.submittedOn, value: time }]),
            summary,
            lines: items,
            action: a.newSubmission.action,
            button: reviewLink,
          },
        },
      );
      break;
    }

    case "revised":
    case "clarification_answered": {
      const answered = event.kind === "clarification_answered";
      const changes = await latestChanges(tx, r.id);
      const receipt = answered ? a.answerReceipt : a.updatedReceipt;
      const notice = answered ? a.answerNotice : a.revisionNotice;
      out.push(
        {
          template: answered ? "annual.answered.receipt" : "annual.revised.receipt",
          audience: "requester",
          to: reps,
          content: {
            subject: receipt.subject(...subjectArgs),
            heading: receipt.heading,
            status: answered ? a.statuses.submitted : a.statuses.updated,
            paragraphs: [receipt.intro(ctx.actorName, time)],
            facts: facts(ctx),
            changes,
            summary,
            action: answered ? emailCopy.noAction : `${emailCopy.noAction} ${a.editsLeft(left)}`,
            button: requesterLink,
          },
        },
        {
          template: answered ? "annual.answered.accountant" : "annual.revised.accountant",
          audience: "accountant",
          to: accountants,
          content: {
            subject: notice.subject(...subjectArgs),
            heading: notice.heading,
            status: answered ? a.statuses.submitted : a.statuses.updated,
            paragraphs: [notice.intro(r.departmentNameSnapshot, ctx.actorName)],
            facts: facts(ctx),
            changes,
            summary,
            action: notice.action,
            button: reviewLink,
          },
        },
      );
      break;
    }

    case "review_started":
      out.push({
        template: "annual.review_started",
        audience: "requester",
        to: reps,
        content: {
          subject: a.reviewStarted.subject(...subjectArgs),
          heading: a.reviewStarted.heading,
          status: a.statuses.inReview,
          paragraphs: [a.reviewStarted.intro],
          facts: facts(ctx),
          summary,
          action: emailCopy.noAction,
          button: requesterLink,
        },
      });
      break;

    case "returned": {
      const note = { label: a.returned.question, text: event.question };
      out.push(
        {
          template: "annual.returned",
          audience: "requester",
          to: reps,
          content: {
            subject: a.returned.subject(...subjectArgs),
            heading: a.returned.heading,
            status: a.statuses.returned,
            paragraphs: [a.returned.intro],
            facts: facts(ctx),
            note,
            summary,
            action: a.returned.action,
            button: { label: a.returned.button, href: appUrl(`/annual/${r.id}/edit`) },
          },
        },
        {
          template: "annual.returned.accountant",
          audience: "accountant",
          to: accountants,
          content: {
            subject: a.returnedCopy.subject(...subjectArgs),
            heading: a.returnedCopy.heading,
            status: a.statuses.returned,
            paragraphs: [a.returnedCopy.intro(r.departmentNameSnapshot)],
            facts: facts(ctx),
            note,
            action: emailCopy.noAction,
            button: reviewLink,
          },
        },
      );
      break;
    }

    case "approved": {
      const { decision, lines } = await latestApproval(tx, r.id);
      const approved: TaxBreakdown = {
        subtotal: decision.approvedSubtotalCents!,
        tax: decision.approvedTaxCents!,
        total: decision.approvedTotalCents!,
      };
      const comparison = {
        kind: "comparison" as const,
        requested: requested(r),
        approved,
        rate: r.taxRate!,
        difference: differenceText(requested(r).total, approved.total, a.difference),
      };
      const decidedFacts = facts(ctx, [
        { label: a.facts.approvedOn, value: formatDateTime(decision.createdAt, ctx.zone) },
        ...(decision.boardReference
          ? [{ label: a.facts.board, value: decision.boardReference }]
          : []),
      ]);
      const note = decision.decisionReason
        ? { label: a.approved.note, text: decision.decisionReason }
        : undefined;
      out.push(
        {
          template: "annual.approved",
          audience: "requester",
          to: reps,
          content: {
            subject: a.approved.subject(...subjectArgs),
            heading: a.approved.heading,
            status: a.statuses.approved,
            paragraphs: [a.approved.authorized, ...shared],
            facts: decidedFacts,
            summary: comparison,
            lines: { heading: a.approvedItems, items: lines },
            note,
            action: emailCopy.noAction,
            button: requesterLink,
          },
        },
        {
          template: "annual.approved.accountant",
          audience: "accountant",
          to: accountants,
          content: {
            subject: a.approvedCopy.subject(...subjectArgs),
            heading: a.approvedCopy.heading,
            status: a.statuses.approved,
            paragraphs: [
              release
                ? a.approvedCopy.heldIntro(r.departmentNameSnapshot, release)
                : a.approvedCopy.intro(r.departmentNameSnapshot),
            ],
            facts: decidedFacts,
            summary: comparison,
            note,
            action: emailCopy.noAction,
            button: reviewLink,
          },
        },
        {
          template: "annual.approved.church_admin",
          audience: "church_admin",
          to: await usersWithRole(tx, ["church_admin"]),
          content: {
            subject: a.budgetAvailable.subject(r.departmentNameSnapshot, ctx.cycleName),
            heading: a.budgetAvailable.heading,
            status: a.statuses.approved,
            paragraphs: [a.budgetAvailable.intro(r.departmentNameSnapshot, ctx.cycleName)],
            facts: decidedFacts,
            summary: {
              kind: "single",
              totals: approved,
              rate: r.taxRate!,
              heading: a.approvedHeading,
            },
            action: emailCopy.noAction,
            button: { label: a.viewBudget, href: appUrl("/annual/all") },
          },
        },
      );
      break;
    }

    case "declined": {
      const note = { label: a.declined.reason, text: event.reason };
      const decidedOn = options.decidedAt ? formatDateTime(options.decidedAt, ctx.zone) : time;
      const decidedFacts = facts(ctx, [{ label: a.facts.decidedOn, value: decidedOn }]);
      out.push(
        {
          template: "annual.declined",
          audience: "requester",
          to: reps,
          content: {
            subject: a.declined.subject(...subjectArgs),
            heading: a.declined.heading,
            status: a.statuses.declined,
            ...(shared.length > 0 ? { paragraphs: shared } : {}),
            facts: decidedFacts,
            note,
            summary,
            action: a.declined.action,
            button: requesterLink,
          },
        },
        {
          template: "annual.declined.accountant",
          audience: "accountant",
          to: accountants,
          content: {
            subject: a.declinedCopy.subject(...subjectArgs),
            heading: a.declinedCopy.heading,
            status: a.statuses.declined,
            paragraphs: [
              release
                ? a.declinedCopy.heldIntro(r.departmentNameSnapshot, release)
                : a.declinedCopy.intro(r.departmentNameSnapshot),
            ],
            facts: decidedFacts,
            note,
            action: emailCopy.noAction,
            button: reviewLink,
          },
        },
      );
      break;
    }

    case "reopened": {
      const note = { label: a.reopened.reason, text: event.reason };
      out.push(
        {
          template: "annual.reopened",
          audience: "requester",
          to: reps,
          content: {
            subject: a.reopened.subject(...subjectArgs),
            heading: a.reopened.heading,
            status: a.statuses.returned,
            paragraphs: [a.reopened.intro],
            facts: facts(ctx),
            note,
            summary,
            action: a.reopened.action,
            button: { label: a.reopened.button, href: appUrl(`/annual/${r.id}`) },
          },
        },
        {
          template: "annual.reopened.accountant",
          audience: "accountant",
          to: accountants,
          content: {
            subject: a.reopenedCopy.subject(...subjectArgs),
            heading: a.reopenedCopy.heading,
            status: a.statuses.returned,
            paragraphs: [a.reopenedCopy.intro(r.departmentNameSnapshot)],
            facts: facts(ctx),
            note,
            action: emailCopy.noAction,
            button: reviewLink,
          },
        },
      );
      break;
    }
  }

  // Held: the department hears at release. At release: only the department's email.
  const sending = out.filter((email) =>
    options.only
      ? email.audience === options.only
      : !(options.hold && email.audience === "requester"),
  );
  for (const email of sending) {
    await enqueueEmail(tx, {
      ...email,
      brand: ctx.brand,
      budgetRequestId: r.id,
      cycleId: r.budgetCycleId,
      now,
    });
  }
}
