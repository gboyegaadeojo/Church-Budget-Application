import { eq } from "drizzle-orm";
import { z } from "zod";
import { spendingCopy } from "@/copy/spending";
import { spendingEmailCopy as m } from "@/copy/spending-email";
import {
  budgetAmendments,
  budgetCycles,
  budgetRequests,
  departments,
  idempotencyKeys,
} from "@/db/schema";
import type { Tx } from "@/db/types";
import { actorOf, parseKey, previousResult } from "@/domain/annual/service";
import { parseInput, RuleError, ValidationError } from "@/domain/errors";
import { approvedAnnualBudget, budgetFigures } from "@/domain/expenses/budget";
import { emailBrand } from "@/domain/notifications/notice";
import { departmentRepresentatives } from "@/domain/notifications/recipients";
import { writeAudit } from "@/lib/audit";
import { assertCan, type Subject } from "@/lib/authz";
import { appUrl } from "@/lib/email/layout";
import { enqueueEmail } from "@/lib/email/outbox";
import { formatCAD, parseCAD, splitInclusive } from "@/lib/money";
import { checkSpendingAlerts } from "./alerts";

/**
 * Budget amendments (FR-27, DRD 6.9): only the accountant raises or lowers a department's
 * available budget, entering one amount including tax with a reason and an optional board
 * reference. The tax inside it is worked out as in FR-16. The original approval is never
 * changed; each amendment is its own permanent, audited record. A reduction that would
 * take Remaining below zero needs the warning confirmed. The department's leaders are
 * emailed the new available budget.
 */

const e = spendingCopy.errors;
const a = spendingCopy.amend;

const schema = z.object({
  direction: z.enum(["increase", "reduction"], { error: a.errors.direction }),
  amount: z.union([z.string(), z.number()]).transform((value, ctx) => {
    const cents = parseCAD(String(value));
    if (cents === null || cents <= 0 || cents > 10_000_000_000) {
      ctx.addIssue({ code: "custom", message: a.errors.amount });
      return z.NEVER;
    }
    return cents;
  }),
  reason: z.string({ error: e.reasonRequired }).trim().min(1, e.reasonRequired).max(2_000),
  boardReference: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null),
  confirmNegative: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === "true" || v === "on"),
});

export type AmendResult = { amendmentId: string; availableCents: number };

export async function amendBudget(
  tx: Tx,
  actor: Subject,
  input: Record<string, unknown> & {
    cycleId: string;
    departmentId: string;
    idempotencyKey: unknown;
  },
  { now = new Date() }: { now?: Date } = {},
): Promise<AmendResult> {
  const key = parseKey(input.idempotencyKey);
  const repeat = await previousResult<AmendResult>(tx, key, actor, "spending.amend");
  if (repeat) return repeat;
  const { actingRole } = assertCan(actor, "spending.amend");
  if (
    !z.uuid().safeParse(input.cycleId).success ||
    !z.uuid().safeParse(input.departmentId).success
  ) {
    throw new RuleError(e.notFound);
  }
  const [cycle] = await tx.select().from(budgetCycles).where(eq(budgetCycles.id, input.cycleId));
  if (!cycle) throw new RuleError(e.cycleNotFound);
  const annual = await approvedAnnualBudget(tx, cycle.id, input.departmentId);
  if (!annual) throw new RuleError(a.errors.noBudget);
  const parsed = parseInput(schema, input);

  const [request] = await tx
    .select({ rate: budgetRequests.taxRate })
    .from(budgetRequests)
    .where(eq(budgetRequests.id, annual.requestId));
  const rate = request.rate ?? cycle.defaultTaxRate;
  const split = splitInclusive(parsed.amount, rate);
  const sign = parsed.direction === "reduction" ? -1 : 1;
  const amendment = {
    subtotal: sign * split.subtotal,
    tax: sign * split.tax,
    total: sign * split.total,
  };

  const before = await budgetFigures(tx, cycle.id, input.departmentId);
  const remainingAfter = before.remaining + amendment.total;
  if (amendment.total < 0 && remainingAfter < 0 && !parsed.confirmNegative) {
    throw new ValidationError({
      confirmNegative: a.errors.negative(formatCAD(-remainingAfter)),
    });
  }

  const [row] = await tx
    .insert(budgetAmendments)
    .values({
      budgetRequestId: annual.requestId,
      departmentId: input.departmentId,
      budgetCycleId: cycle.id,
      amountBeforeTaxCents: amendment.subtotal,
      taxCents: amendment.tax,
      amountCents: amendment.total,
      taxRate: rate,
      reason: parsed.reason,
      boardReference: parsed.boardReference,
      createdByUserId: actor.id,
      createdAt: now,
    })
    .returning({ id: budgetAmendments.id });
  const availableAfter = before.available + amendment.total;
  await writeAudit(tx, {
    actor: actorOf(actor, actingRole),
    area: "spending",
    eventType: "spending.budget_amended",
    entity: { type: "budget_request", id: annual.requestId },
    budgetRequestId: annual.requestId,
    departmentId: input.departmentId,
    cycleId: cycle.id,
    reason: parsed.reason,
    details: {
      amendmentId: row.id,
      amount: amendment,
      boardReference: parsed.boardReference,
      before: { availableCents: before.available, remainingCents: before.remaining },
      after: { availableCents: availableAfter, remainingCents: remainingAfter },
    },
  });

  // The department's leaders hear the new available budget (FR-27).
  const [department] = await tx
    .select({ name: departments.name })
    .from(departments)
    .where(eq(departments.id, input.departmentId));
  await enqueueEmail(tx, {
    template: "spending.amended",
    audience: "requester",
    to: await departmentRepresentatives(tx, input.departmentId),
    brand: await emailBrand(tx),
    budgetRequestId: annual.requestId,
    cycleId: cycle.id,
    now,
    content: {
      subject: m.amendment.subject(department.name),
      heading: m.amendment.heading,
      status: m.amendment.status,
      paragraphs: [m.amendment.intro(department.name, cycle.name)],
      facts: [
        { label: m.facts.approved, value: formatCAD(before.approved) },
        { label: m.facts.amendment, value: formatCAD(amendment.total) },
        { label: m.facts.available, value: formatCAD(availableAfter) },
        {
          label: m.facts.remaining,
          value:
            remainingAfter < 0 ? m.overBy(formatCAD(-remainingAfter)) : formatCAD(remainingAfter),
        },
        { label: m.facts.reason, value: parsed.reason },
        ...(parsed.boardReference
          ? [{ label: m.facts.boardReference, value: parsed.boardReference }]
          : []),
      ],
      action: m.amendment.action,
      button: { label: m.amendment.button, href: appUrl("/spending/my-department") },
    },
  });
  await checkSpendingAlerts(tx, cycle.id, input.departmentId, { now });

  const result: AmendResult = { amendmentId: row.id, availableCents: availableAfter };
  await tx
    .insert(idempotencyKeys)
    .values({ key, userId: actor.id, action: "spending.amend", entityId: row.id, result });
  return result;
}
