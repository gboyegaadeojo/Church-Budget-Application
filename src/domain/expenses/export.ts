import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { exportsCopy } from "@/copy/exports";
import {
  budgetCycles,
  departments,
  expenseDecisions,
  expenseItems,
  expensePayments,
  expenseReceiptFiles,
  expenseReceiptLines,
  expenseSubmissions,
  users,
} from "@/db/schema";
import type { Tx } from "@/db/types";
import { RuleError } from "@/domain/errors";
import { emailBrand } from "@/domain/notifications/notice";
import { getChurchTimeZone } from "@/domain/settings";
import { getBrand, rasterLogo } from "@/domain/settings/brand";
import { writeAudit } from "@/lib/audit";
import { assertCan, type Subject } from "@/lib/authz";
import type { EmailBrand } from "@/lib/email/layout";
import { appUrl } from "@/lib/email/layout";
import type { WorkbookLogo } from "@/lib/excel/logo";
import { fileNamePart } from "@/lib/excel/safe";
import { lineTotal, type TaxBreakdown } from "@/lib/money";
import { budgetFigures, type BudgetFigures } from "./budget";
import { isIsoDate } from "./schema";
import type { ExpenseStatus, ExpenseType } from "./status";

/**
 * The expense workbook (FR-50): submissions, their lines, receipt links, payments for
 * bank reconciliation, and each department's budget with Committed and Pending. Every
 * figure is the stored, server-calculated value, so it matches the screens to the cent.
 * Accountants, backup approvers, the Church Administrator and the System Administrator
 * may export (6B.2, AC-110). Every export is audited with its filters.
 */

export type ExpenseExportRow = {
  id: string;
  reference: string;
  type: ExpenseType;
  department: string;
  requester: string;
  payee: string;
  title: string;
  submittedAt: Date | null;
  status: ExpenseStatus;
  rate: string | null;
  requested: TaxBreakdown;
  approved: TaxBreakdown | null;
  accountant: string | null;
  accountantAt: Date | null;
  approver: string | null;
  approverRole: string | null;
  approvedAt: Date | null;
  paidOn: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  linkedReference: string | null;
};

export type ExpenseExportLine = {
  reference: string;
  department: string;
  /** Items: name; receipt lines: description. */
  item: string;
  vendor: string | null;
  date: string | null;
  quantity: number | null;
  unitPriceCents: number | null;
  amountCents: number;
  receiptNumber: string | null;
  link: string | null;
};

export type ExpensePaymentRow = {
  paidOn: string;
  reference: string;
  department: string;
  payee: string;
  method: string;
  methodOther: string | null;
  paymentReference: string | null;
  amountCents: number;
  signers: string | null;
  recordedBy: string;
};

export type ExpenseExport = {
  brand: EmailBrand;
  logo: WorkbookLogo | null;
  generatedAt: Date;
  zone: string;
  cycle: { id: string; name: string; budgetYear: number };
  filterLabels: string[];
  fileName: string;
  rows: ExpenseExportRow[];
  lines: ExpenseExportLine[];
  receipts: { reference: string; fileName: string; url: string }[];
  payments: ExpensePaymentRow[];
  budgets: { department: string; figures: BudgetFigures }[];
};

const filterSchema = z.object({
  cycleId: z.uuid(),
  departmentId: z.uuid().optional(),
  from: z.string().refine(isIsoDate).optional(),
  to: z.string().refine(isIsoDate).optional(),
});

export async function buildExpenseExport(
  tx: Tx,
  actor: Subject,
  input: { cycleId?: string; departmentId?: string; from?: string; to?: string },
  now: Date = new Date(),
): Promise<ExpenseExport> {
  const { actingRole } = assertCan(actor, "expense.export");
  const parsed = filterSchema.safeParse({
    cycleId: input.cycleId,
    departmentId: input.departmentId || undefined,
    from: input.from || undefined,
    to: input.to || undefined,
  });
  if (!parsed.success) throw new RuleError(exportsCopy.download.failed);
  const f = parsed.data;
  const [cycle] = await tx
    .select({ id: budgetCycles.id, name: budgetCycles.name, budgetYear: budgetCycles.budgetYear })
    .from(budgetCycles)
    .where(eq(budgetCycles.id, f.cycleId));
  if (!cycle) throw new RuleError(exportsCopy.download.failed);
  const [department] = f.departmentId
    ? await tx
        .select({ name: departments.name })
        .from(departments)
        .where(eq(departments.id, f.departmentId))
    : [];

  const submissions = await tx
    .select({ e: expenseSubmissions, requester: users.displayName })
    .from(expenseSubmissions)
    .innerJoin(users, eq(users.id, expenseSubmissions.requesterUserId))
    .where(
      and(
        eq(expenseSubmissions.budgetCycleId, cycle.id),
        ne(expenseSubmissions.status, "draft"),
        f.departmentId ? eq(expenseSubmissions.departmentId, f.departmentId) : undefined,
      ),
    )
    .orderBy(asc(expenseSubmissions.referenceNumber));
  const ids = submissions.map((s) => s.e.id);
  const references = new Map(submissions.map((s) => [s.e.id, s.e.referenceNumber ?? ""]));

  const decisions = ids.length
    ? await tx
        .select({ d: expenseDecisions, name: users.displayName })
        .from(expenseDecisions)
        .innerJoin(users, eq(users.id, expenseDecisions.decidedByUserId))
        .where(inArray(expenseDecisions.expenseSubmissionId, ids))
        .orderBy(asc(expenseDecisions.createdAt))
    : [];
  const payments = ids.length
    ? await tx
        .select({ p: expensePayments, name: users.displayName })
        .from(expensePayments)
        .innerJoin(users, eq(users.id, expensePayments.recordedByUserId))
        .where(inArray(expensePayments.expenseSubmissionId, ids))
    : [];
  const paymentOf = new Map(payments.map((p) => [p.p.expenseSubmissionId, p]));
  const approving = (d: (typeof decisions)[number]) =>
    d.d.decision === "approved" || d.d.decision === "approved_different_amount";

  const rows: ExpenseExportRow[] = submissions.map(({ e, requester }) => {
    const mine = decisions.filter((d) => d.d.expenseSubmissionId === e.id && approving(d));
    const accountant = mine.findLast((d) => d.d.level === "accountant");
    const board = mine.findLast((d) => d.d.level === "board");
    const pay = paymentOf.get(e.id);
    return {
      id: e.id,
      reference: e.referenceNumber ?? "",
      type: e.type,
      department: e.departmentNameSnapshot,
      requester,
      payee:
        e.type === "purchase_request"
          ? ""
          : e.payeeKind === "church_card"
            ? exportsCopy.expenses.churchCard
            : (e.payeeName ?? ""),
      title: e.title,
      submittedAt: e.submittedAt,
      status: e.status,
      rate: e.taxRate,
      requested: { subtotal: e.subtotalCents ?? 0, tax: e.taxCents ?? 0, total: e.totalCents ?? 0 },
      // Only a final approval is an approved amount (AC-73); before it, nothing.
      approved:
        board && e.approvedTotalCents !== null
          ? {
              subtotal: e.approvedSubtotalCents!,
              tax: e.approvedTaxCents!,
              total: e.approvedTotalCents,
            }
          : null,
      accountant: accountant?.name ?? null,
      accountantAt: accountant?.d.createdAt ?? null,
      approver: board?.name ?? null,
      approverRole: board?.d.actingRole ?? null,
      approvedAt: board ? (e.approvedAt ?? board.d.createdAt) : null,
      paidOn: pay?.p.paidOn ?? null,
      paymentMethod: pay?.p.method ?? null,
      paymentReference: pay?.p.reference ?? null,
      // A linked purchase request is always of the same department and year.
      linkedReference: e.linkedPurchaseRequestId
        ? (references.get(e.linkedPurchaseRequestId) ?? null)
        : null,
    };
  });

  const items = ids.length
    ? await tx
        .select()
        .from(expenseItems)
        .where(inArray(expenseItems.expenseSubmissionId, ids))
        .orderBy(asc(expenseItems.sortOrder))
    : [];
  const receiptLines = ids.length
    ? await tx
        .select()
        .from(expenseReceiptLines)
        .where(inArray(expenseReceiptLines.expenseSubmissionId, ids))
        .orderBy(asc(expenseReceiptLines.sortOrder))
    : [];
  const departmentOf = new Map(submissions.map((s) => [s.e.id, s.e.departmentNameSnapshot]));
  const lines: ExpenseExportLine[] = [
    ...items.map((i) => ({
      reference: references.get(i.expenseSubmissionId) ?? "",
      department: departmentOf.get(i.expenseSubmissionId) ?? "",
      item: i.itemName,
      vendor: null,
      date: null,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      amountCents: lineTotal(i.quantity, i.unitPriceCents),
      receiptNumber: null,
      link: i.productUrl,
    })),
    ...receiptLines.map((l) => ({
      reference: references.get(l.expenseSubmissionId) ?? "",
      department: departmentOf.get(l.expenseSubmissionId) ?? "",
      item: l.description,
      vendor: l.vendor,
      date: l.purchaseDate,
      quantity: null,
      unitPriceCents: null,
      amountCents: l.amountCents,
      receiptNumber: l.receiptNumber,
      link: null,
    })),
  ].sort((a, b) => a.reference.localeCompare(b.reference));

  // 6B.9: receipts are links into the app, which checks who may open them; never files.
  const files = ids.length
    ? await tx
        .select()
        .from(expenseReceiptFiles)
        .where(
          and(
            inArray(expenseReceiptFiles.expenseSubmissionId, ids),
            isNull(expenseReceiptFiles.removedAt),
          ),
        )
        .orderBy(asc(expenseReceiptFiles.uploadedAt))
    : [];
  const receipts = files.map((file) => ({
    reference: references.get(file.expenseSubmissionId) ?? "",
    fileName: file.fileName,
    url: appUrl(`/api/expenses/${file.expenseSubmissionId}/receipts/${file.id}`),
  }));

  // Payments in the date range (whole cycle by default), for bank reconciliation.
  const paymentRows: ExpensePaymentRow[] = payments
    .filter((p) => (!f.from || p.p.paidOn >= f.from) && (!f.to || p.p.paidOn <= f.to))
    .map(({ p, name }) => {
      const e = submissions.find((s) => s.e.id === p.expenseSubmissionId)!.e;
      return {
        paidOn: p.paidOn,
        reference: e.referenceNumber ?? "",
        department: e.departmentNameSnapshot,
        payee:
          e.type === "purchase_request"
            ? (p.purchasedBy ?? exportsCopy.expenses.churchAccount)
            : (e.payeeName ?? exportsCopy.expenses.churchCard),
        method: p.method,
        methodOther: p.methodOther,
        paymentReference: p.reference,
        amountCents: p.amountCents,
        signers: p.chequeSigner1Name ? `${p.chequeSigner1Name}, ${p.chequeSigner2Name}` : null,
        recordedBy: name,
      };
    })
    .sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.reference.localeCompare(b.reference));

  const budgetDepartments = await tx
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(f.departmentId ? eq(departments.id, f.departmentId) : ne(departments.status, "rejected"))
    .orderBy(asc(departments.name));
  const budgets: ExpenseExport["budgets"] = [];
  for (const d of budgetDepartments) {
    const figures = await budgetFigures(tx, cycle.id, d.id);
    if (figures.annualRequestId || figures.spent || figures.committed || figures.pending) {
      budgets.push({ department: d.name, figures });
    }
  }

  const filterLabels = [
    cycle.name,
    department ? department.name : exportsCopy.page.allDepartments,
    ...(f.from || f.to ? [exportsCopy.expenses.paidBetween(f.from ?? "…", f.to ?? "…")] : []),
  ];
  const fileName = [
    "Expenses",
    String(cycle.budgetYear),
    department ? fileNamePart(department.name) : null,
  ]
    .filter(Boolean)
    .join("_")
    .concat(".xlsx");

  await writeAudit(tx, {
    actor: { kind: "user", userId: actor.id, actingRole },
    area: "expenses",
    eventType: "expenses.exported",
    entity: { type: "export", id: fileName },
    cycleId: cycle.id,
    departmentId: f.departmentId,
    details: { filters: filterLabels, rows: rows.length, payments: paymentRows.length },
  });

  return {
    brand: await emailBrand(tx),
    logo: await rasterLogo(tx, await getBrand(tx)),
    generatedAt: now,
    zone: await getChurchTimeZone(tx),
    cycle,
    filterLabels,
    fileName,
    rows,
    lines,
    receipts,
    payments: paymentRows,
    budgets,
  };
}
