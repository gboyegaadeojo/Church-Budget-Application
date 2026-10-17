import { asc, desc, eq } from "drizzle-orm";
import { expenseEmailCopy as x } from "@/copy/expense-email";
import { emailCopy } from "@/copy/email";
import { expensesCopy } from "@/copy/expenses";
import {
  budgetCycles,
  expenseDecisions,
  expenseItems,
  expensePayments,
  expenseSubmissions,
  users,
} from "@/db/schema";
import type { Tx } from "@/db/types";
import { emailBrand } from "@/domain/notifications/notice";
import {
  accountantRecipients,
  boardCover,
  person,
  usersWithRole,
} from "@/domain/notifications/recipients";
import { getChurchTimeZone } from "@/domain/settings";
import { appUrl, type EmailContent, type EmailSummary } from "@/lib/email/layout";
import { enqueueEmail, type EmailAudience, type Recipient } from "@/lib/email/outbox";
import { formatCAD, type TaxBreakdown } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/time-zone";
import type { ExpenseStatus } from "./status";

/**
 * The expense emails (FR-49). Each service calls `queueExpenseEmails` in its
 * transaction, after the change and its audit event; rows are sent after commit. The
 * content is built from what's stored, never from what the browser sent. Amounts show
 * Subtotal / Sales tax / Total, or Total paid for a claim (its receipts include tax).
 *
 * "Requester" is the person who submitted it, plus the payee when that's someone else.
 */

export type ExpenseEmailEvent =
  | { kind: "submitted" }
  | { kind: "edited" }
  | { kind: "clarification_answered" }
  | { kind: "withdrawn"; from: ExpenseStatus }
  | { kind: "cancelled"; reason: string }
  | { kind: "review_started" }
  | { kind: "returned"; question: string }
  | { kind: "declined"; reason: string; level: "accountant" | "board" }
  | { kind: "accountant_approved" }
  | { kind: "board_returned"; question: string }
  | { kind: "final_approved"; overBy: number }
  | { kind: "processing_started" }
  | { kind: "paid" };

export type ExpenseEmailOptions = { now?: Date };

const ROLE_NAMES = expensesCopy.review.roles;

type Outgoing = {
  template: string;
  audience: EmailAudience;
  to: Recipient[];
  content: EmailContent;
};

async function loadContext(tx: Tx, expenseId: string, actorId: string) {
  const [row] = await tx
    .select({ expense: expenseSubmissions, cycleName: budgetCycles.name })
    .from(expenseSubmissions)
    .innerJoin(budgetCycles, eq(budgetCycles.id, expenseSubmissions.budgetCycleId))
    .where(eq(expenseSubmissions.id, expenseId));
  const [actor] = await tx
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, actorId));
  const [requester] = await tx
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, row.expense.requesterUserId));
  return {
    e: row.expense,
    cycleName: row.cycleName,
    actorName: actor?.name ?? "",
    requesterName: requester?.name ?? "",
    zone: await getChurchTimeZone(tx),
    brand: await emailBrand(tx),
  };
}

type Context = Awaited<ReturnType<typeof loadContext>>;

function requested(e: Context["e"]): TaxBreakdown {
  return { subtotal: e.subtotalCents ?? 0, tax: e.taxCents ?? 0, total: e.totalCents ?? 0 };
}

function approved(e: Context["e"]): TaxBreakdown | null {
  return e.approvedTotalCents === null
    ? null
    : {
        subtotal: e.approvedSubtotalCents!,
        tax: e.approvedTaxCents!,
        total: e.approvedTotalCents,
      };
}

/** The amount block: tax shown for purchase requests, Total paid for claims. */
function summaryOf(ctx: Context, totals: TaxBreakdown, heading?: string): EmailSummary {
  return ctx.e.type === "purchase_request"
    ? { kind: "single", totals, rate: ctx.e.taxRate ?? "0.1200", heading }
    : { kind: "paid", label: x.totalPaid, totalCents: totals.total, heading };
}

/** Requested beside the final approved amount (a claim: just the approved total). */
function comparisonOf(ctx: Context): EmailSummary {
  const asked = requested(ctx.e);
  const final = approved(ctx.e) ?? asked;
  if (ctx.e.type === "expense_claim") {
    return {
      kind: "paid",
      label: x.totalPaid,
      totalCents: final.total,
      heading: x.approvedHeading,
    };
  }
  const diff = asked.total - final.total;
  return {
    kind: "comparison",
    requested: asked,
    approved: final,
    rate: ctx.e.taxRate ?? "0.1200",
    difference:
      diff === 0
        ? emailCopy.annual.difference.none
        : emailCopy.annual.difference.less(formatCAD(diff)),
  };
}

function facts(ctx: Context, extra: { label: string; value: string }[] = []) {
  const e = ctx.e;
  return [
    { label: x.facts.reference, value: e.referenceNumber ?? "" },
    { label: x.facts.type, value: expensesCopy.types[e.type] },
    { label: x.facts.department, value: e.departmentNameSnapshot },
    { label: x.facts.cycle, value: ctx.cycleName },
    { label: x.facts.title, value: e.title },
    ...extra,
  ];
}

function payeeFacts(ctx: Context) {
  const e = ctx.e;
  if (e.type !== "expense_claim") {
    return e.howBought
      ? [{ label: x.facts.howBought, value: expensesCopy.howBought[e.howBought] }]
      : [];
  }
  if (e.payeeKind === "church_card") {
    return [{ label: x.facts.payee, value: expensesCopy.payee.church_card }];
  }
  const preference =
    e.paymentPreference && e.paymentPreference !== "none"
      ? [
          {
            label: x.facts.preference,
            value: `${expensesCopy.paymentPreference[e.paymentPreference]}${
              e.paymentPreference === "e_transfer" && e.payeeEmail ? ` (${e.payeeEmail})` : ""
            }`,
          },
        ]
      : [];
  return [{ label: x.facts.payee, value: e.payeeName ?? "" }, ...preference];
}

async function itemLines(tx: Tx, ctx: Context) {
  if (ctx.e.type !== "purchase_request") return undefined;
  const rows = await tx
    .select()
    .from(expenseItems)
    .where(eq(expenseItems.expenseSubmissionId, ctx.e.id))
    .orderBy(asc(expenseItems.sortOrder));
  return {
    heading: x.items,
    items: rows.map((r) => ({
      name: r.itemName,
      quantity: r.quantity,
      unitPriceCents: r.unitPriceCents,
      totalCents: r.lineTotalCents,
    })),
  };
}

/** The submitter, and the payee when that's someone else (FR-49 "Requester (+ payee)"). */
async function requesterAndPayee(tx: Tx, ctx: Context): Promise<Recipient[]> {
  const out: Recipient[] = await person(tx, ctx.e.requesterUserId);
  if (ctx.e.payeeKind === "other" && ctx.e.payeeEmail) {
    out.push({ email: ctx.e.payeeEmail, userId: ctx.e.payeeUserId });
  }
  return out;
}

const churchAdmins = (tx: Tx) => usersWithRole(tx, ["church_admin"]);

async function latestDecision(tx: Tx, expenseId: string) {
  const [d] = await tx
    .select({ actingRole: expenseDecisions.actingRole, reason: expenseDecisions.reason })
    .from(expenseDecisions)
    .where(eq(expenseDecisions.expenseSubmissionId, expenseId))
    .orderBy(desc(expenseDecisions.createdAt))
    .limit(1);
  return d ?? null;
}

export async function queueExpenseEmails(
  tx: Tx,
  expenseId: string,
  actorId: string,
  event: ExpenseEmailEvent,
  options: ExpenseEmailOptions = {},
): Promise<void> {
  const now = options.now ?? new Date();
  const ctx = await loadContext(tx, expenseId, actorId);
  const e = ctx.e;
  const ref = e.referenceNumber ?? "";
  const dept = e.departmentNameSnapshot;
  const view = { label: x.viewExpense, href: appUrl(`/expenses/${e.id}`) };
  const review = { label: x.reviewExpense, href: appUrl(`/expenses/review/${e.id}`) };
  const decide = { label: x.decide, href: appUrl(`/expenses/awaiting-approval/${e.id}`) };
  const process = { label: x.process, href: appUrl(`/expenses/ready/${e.id}`) };
  const time = formatDateTime(now, ctx.zone);
  const asked = summaryOf(ctx, requested(e));
  const current = approved(e) ?? requested(e);
  const requesterTo = await requesterAndPayee(tx, ctx);
  const accountants = () => accountantRecipients(tx, now);
  const noAction = emailCopy.noAction;
  const out: Outgoing[] = [];

  switch (event.kind) {
    case "submitted": {
      const lines = await itemLines(tx, ctx);
      out.push(
        {
          template: "expenses.submitted.receipt",
          audience: "requester",
          to: requesterTo,
          content: {
            subject: x.receipt.subject(ref, dept),
            heading: x.receipt.heading,
            status: x.statuses.submitted,
            paragraphs: [x.receipt.intro],
            facts: facts(ctx, [{ label: x.facts.submittedOn, value: time }, ...payeeFacts(ctx)]),
            summary: asked,
            lines,
            action: x.receipt.action,
            button: view,
          },
        },
        {
          template: "expenses.submitted.accountant",
          audience: "accountant",
          to: await accountants(),
          content: {
            subject: x.newSubmission.subject(ref, dept),
            heading: x.newSubmission.heading,
            status: x.statuses.submitted,
            paragraphs: [x.newSubmission.intro(dept, ctx.actorName)],
            facts: facts(ctx, [
              { label: x.facts.requester, value: ctx.requesterName },
              ...payeeFacts(ctx),
            ]),
            summary: asked,
            lines,
            action: x.newSubmission.action,
            button: review,
          },
        },
      );
      break;
    }

    case "edited":
    case "clarification_answered": {
      const answered = event.kind === "clarification_answered";
      const words = answered ? x.answered : x.updated;
      const content: EmailContent = {
        subject: words.subject(ref, dept),
        heading: words.heading,
        status: x.statuses.submitted,
        paragraphs: [words.intro(ctx.actorName)],
        facts: facts(ctx),
        summary: asked,
        action: noAction,
        button: view,
      };
      out.push(
        {
          template: answered ? "expenses.answered.receipt" : "expenses.edited.receipt",
          audience: "requester",
          to: requesterTo,
          content,
        },
        {
          template: answered ? "expenses.answered.accountant" : "expenses.edited.accountant",
          audience: "accountant",
          to: await accountants(),
          content: { ...content, action: x.newSubmission.action, button: review },
        },
      );
      break;
    }

    case "review_started":
      out.push({
        template: "expenses.review_started",
        audience: "requester",
        to: requesterTo,
        content: {
          subject: x.reviewStarted.subject(ref, dept),
          heading: x.reviewStarted.heading,
          status: x.statuses.inReview,
          paragraphs: [x.reviewStarted.intro],
          facts: facts(ctx),
          summary: asked,
          action: noAction,
          button: view,
        },
      });
      break;

    case "returned": {
      const note = { label: x.returned.question, text: event.question };
      out.push(
        {
          template: "expenses.returned",
          audience: "requester",
          to: requesterTo,
          content: {
            subject: x.returned.subject(ref, dept),
            heading: x.returned.heading,
            status: x.statuses.returned,
            facts: facts(ctx),
            note,
            summary: asked,
            action: x.returned.action,
            button: { label: x.returned.button, href: appUrl(`/expenses/${e.id}/edit`) },
          },
        },
        {
          template: "expenses.returned.accountant",
          audience: "accountant",
          to: await accountants(),
          content: {
            subject: x.returned.subject(ref, dept),
            heading: x.returned.copyHeading,
            status: x.statuses.returned,
            paragraphs: [x.returned.copyIntro(dept)],
            facts: facts(ctx),
            note,
            action: noAction,
            button: review,
          },
        },
      );
      break;
    }

    case "accountant_approved": {
      const summary = summaryOf(ctx, current, x.approvedHeading);
      const cover = await boardCover(tx, e, now);
      const decision = await latestDecision(tx, e.id);
      const note = decision?.reason
        ? { label: expensesCopy.review.accountantNote, text: decision.reason }
        : undefined;
      out.push(
        {
          template: "expenses.accountant_approved",
          audience: "requester",
          to: requesterTo,
          content: {
            subject: x.accountantApproved.subject(ref, dept),
            heading: x.accountantApproved.heading,
            status: x.statuses.awaitingBoard,
            paragraphs: [x.accountantApproved.intro],
            facts: facts(ctx),
            summary,
            action: noAction,
            button: view,
          },
        },
        {
          template: "expenses.accountant_approved.accountant",
          audience: "accountant",
          to: await accountants(),
          content: {
            subject: x.accountantApproved.subject(ref, dept),
            heading: x.accountantApproved.copyHeading,
            status: x.statuses.awaitingBoard,
            paragraphs: [x.accountantApproved.copyIntro],
            facts: facts(ctx, [{ label: x.facts.approvedBy, value: ctx.actorName }]),
            summary,
            note,
            action: noAction,
            button: review,
          },
        },
        {
          template: "expenses.board_needed",
          audience: "board",
          to: cover.recipients,
          content: {
            subject: x.boardNeeded.subject(ref, dept),
            heading: x.boardNeeded.heading,
            status: x.statuses.awaitingBoard,
            paragraphs: [
              x.boardNeeded.intro(ctx.actorName, formatCAD(current.total)),
              ...(cover.viceCovering ? [x.boardNeeded.covering] : []),
            ],
            facts: facts(ctx, [
              { label: x.facts.requester, value: ctx.requesterName },
              ...payeeFacts(ctx),
            ]),
            summary,
            note,
            action: x.boardNeeded.action,
            button: decide,
          },
        },
      );
      break;
    }

    case "board_returned": {
      const note = { label: x.boardReturned.question, text: event.question };
      out.push(
        {
          template: "expenses.board_returned",
          audience: "accountant",
          to: await accountants(),
          content: {
            subject: x.boardReturned.subject(ref, dept),
            heading: x.boardReturned.heading,
            status: x.statuses.inReview,
            facts: facts(ctx),
            note,
            action: x.boardReturned.action,
            button: review,
          },
        },
        {
          template: "expenses.board_returned.board",
          audience: "board",
          to: await person(tx, actorId),
          content: {
            subject: x.boardReturned.subject(ref, dept),
            heading: x.boardReturned.copyHeading,
            status: x.statuses.inReview,
            facts: facts(ctx),
            note,
            action: noAction,
            button: view,
          },
        },
      );
      break;
    }

    case "final_approved": {
      const summary = comparisonOf(ctx);
      const intro =
        e.type === "purchase_request"
          ? e.howBought === "requester_claims"
            ? x.finalApproved.selfBuyIntro
            : x.finalApproved.purchaseIntro
          : e.payeeKind === "church_card"
            ? x.finalApproved.churchCardIntro
            : x.finalApproved.claimIntro;
      const decidedBy = facts(ctx, [{ label: x.facts.approvedBy, value: ctx.actorName }]);
      const copy: EmailContent = {
        subject: x.finalApproved.subject(ref, dept),
        heading: x.finalApproved.copyHeading,
        status: x.statuses.approved,
        paragraphs: [x.finalApproved.copyIntro(ctx.actorName)],
        facts: decidedBy,
        summary,
        action: noAction,
        button: view,
      };
      out.push(
        {
          template: "expenses.final_approved",
          audience: "requester",
          to: requesterTo,
          content: {
            subject: x.finalApproved.subject(ref, dept),
            heading: x.finalApproved.heading,
            status: x.statuses.approved,
            paragraphs: [intro],
            facts: decidedBy,
            summary,
            action: noAction,
            button: view,
          },
        },
        {
          template: "expenses.final_approved.accountant",
          audience: "accountant",
          to: await accountants(),
          content: { ...copy, button: review },
        },
        {
          template: "expenses.final_approved.board",
          audience: "board",
          to: await person(tx, actorId),
          content: copy,
        },
      );
      // A purchase the requester buys themselves isn't processed by the office.
      if (!(e.type === "purchase_request" && e.howBought === "requester_claims")) {
        out.push({
          template: "expenses.ready_for_processing",
          audience: "church_admin",
          to: await churchAdmins(tx),
          content: {
            subject: x.readyForProcessing.subject(ref, dept),
            heading: x.readyForProcessing.heading,
            status: x.statuses.approved,
            paragraphs: [x.readyForProcessing.intro],
            facts: facts(ctx, [
              { label: x.facts.requester, value: ctx.requesterName },
              ...payeeFacts(ctx),
            ]),
            summary: summaryOf(ctx, current, x.approvedHeading),
            action: x.readyForProcessing.action,
            button: process,
          },
        });
      }
      if (event.overBy > 0) {
        const over = formatCAD(event.overBy);
        const alert = (intro: string): EmailContent => ({
          subject: x.overBudget.subject(dept),
          heading: x.overBudget.heading,
          status: expensesCopy.budget.overBy(over),
          paragraphs: [intro],
          facts: facts(ctx),
          action: noAction,
          button: view,
        });
        out.push(
          {
            template: "expenses.over_budget.requester",
            audience: "requester",
            to: await person(tx, e.requesterUserId),
            content: alert(x.overBudget.requesterIntro(dept, over)),
          },
          {
            template: "expenses.over_budget.accountant",
            audience: "accountant",
            to: await accountants(),
            content: alert(x.overBudget.intro(dept, over)),
          },
          {
            template: "expenses.over_budget.church_admin",
            audience: "church_admin",
            to: await churchAdmins(tx),
            content: alert(x.overBudget.intro(dept, over)),
          },
        );
      }
      break;
    }

    case "declined": {
      const decided = await latestDecision(tx, e.id);
      const role = decided ? (ROLE_NAMES[decided.actingRole] ?? decided.actingRole) : "";
      const note = { label: x.declined.reason, text: event.reason };
      const by = x.declined.by(ctx.actorName, role);
      const copy: EmailContent = {
        subject: x.declined.subject(ref, dept),
        heading: x.declined.copyHeading,
        status: x.statuses.declined,
        paragraphs: [by],
        facts: facts(ctx),
        note,
        action: noAction,
        button: view,
      };
      out.push(
        {
          template: "expenses.declined",
          audience: "requester",
          to: requesterTo,
          content: {
            ...copy,
            heading: x.declined.heading,
            summary: asked,
            action: x.declined.action,
          },
        },
        {
          template: "expenses.declined.accountant",
          audience: "accountant",
          to: await accountants(),
          content: { ...copy, button: review },
        },
      );
      if (event.level === "board") {
        out.push({
          template: "expenses.declined.board",
          audience: "board",
          to: await person(tx, actorId),
          content: copy,
        });
      }
      break;
    }

    case "withdrawn":
    case "cancelled": {
      const cancelled = event.kind === "cancelled";
      const words = cancelled ? x.cancelled : x.withdrawn;
      const content: EmailContent = {
        subject: words.subject(ref, dept),
        heading: words.heading,
        status: cancelled ? x.statuses.cancelled : x.statuses.withdrawn,
        paragraphs: [words.intro(ctx.actorName)],
        facts: facts(ctx),
        note: cancelled ? { label: x.cancelled.reason, text: event.reason } : undefined,
        summary: summaryOf(ctx, current),
        action: noAction,
        button: view,
      };
      out.push(
        { template: `expenses.${event.kind}`, audience: "requester", to: requesterTo, content },
        {
          template: `expenses.${event.kind}.accountant`,
          audience: "accountant",
          to: await accountants(),
          content: { ...content, button: review },
        },
      );
      // An approved purchase request may have been waiting for the office.
      if (cancelled) {
        out.push({
          template: "expenses.cancelled.church_admin",
          audience: "church_admin",
          to: await churchAdmins(tx),
          content,
        });
      }
      break;
    }

    case "processing_started":
      out.push({
        template: "expenses.processing",
        audience: "requester",
        to: requesterTo,
        content: {
          subject: x.processing.subject(ref, dept),
          heading: x.processing.heading,
          status: x.statuses.processing,
          paragraphs: [x.processing.intro],
          facts: facts(ctx, payeeFacts(ctx)),
          summary: summaryOf(ctx, current, x.approvedHeading),
          action: noAction,
          button: view,
        },
      });
      break;

    case "paid": {
      const [payment] = await tx
        .select()
        .from(expensePayments)
        .where(eq(expensePayments.expenseSubmissionId, e.id));
      const purchase = e.type === "purchase_request";
      const content: EmailContent = {
        subject: (purchase ? x.paid.purchasedSubject : x.paid.subject)(ref, dept),
        heading: purchase ? x.paid.purchasedHeading : x.paid.heading,
        status: purchase ? x.statuses.purchased : x.statuses.paid,
        facts: facts(ctx, [
          ...payeeFacts(ctx),
          { label: x.facts.method, value: expensesCopy.payment.methods[payment.method] },
          { label: x.facts.paidOn, value: formatDate(payment.paidOn) },
          ...(payment.reference ? [{ label: x.facts.reference2, value: payment.reference }] : []),
        ]),
        summary: { kind: "paid", label: x.totalPaid, totalCents: payment.amountCents },
        action: noAction,
        button: view,
      };
      out.push(
        { template: "expenses.paid", audience: "requester", to: requesterTo, content },
        {
          template: "expenses.paid.accountant",
          audience: "accountant",
          to: await accountants(),
          content: { ...content, heading: x.paid.copyHeading },
        },
        {
          template: "expenses.paid.church_admin",
          audience: "church_admin",
          to: await churchAdmins(tx),
          content: { ...content, heading: x.paid.copyHeading },
        },
      );
      break;
    }
  }

  for (const email of out) {
    await enqueueEmail(tx, {
      ...email,
      brand: ctx.brand,
      expenseSubmissionId: e.id,
      cycleId: e.budgetCycleId,
      now,
    });
  }
}
