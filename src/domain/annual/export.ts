import { and, asc, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { exportsCopy } from "@/copy/exports";
import { budgetCycles, budgetRequests, departments, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { RuleError } from "@/domain/errors";
import { emailBrand } from "@/domain/notifications/notice";
import { getBrand, rasterLogo } from "@/domain/settings/brand";
import type { WorkbookLogo } from "@/lib/excel/logo";
import { getChurchTimeZone } from "@/domain/settings";
import { writeAudit } from "@/lib/audit";
import { assertCan, type Subject } from "@/lib/authz";
import { fileNamePart } from "@/lib/excel/safe";
import type { EmailBrand } from "@/lib/email/layout";
import type { TaxBreakdown } from "@/lib/money";
import { getReviewView, matchesFilter, QUEUE_FILTERS, type QueueFilter } from "./review-queries";
import type { AnnualStatus } from "./status";

/**
 * The annual budget export (FR-20, AC-92 to AC-96): every figure comes from the same
 * review view the accountant sees, so the workbook matches the screens to the cent.
 * Accountants, backup approvers and the System Administrator may export (AC-4, AC-110).
 * Every export is audited with its filters.
 */

export type AnnualExportFilters = {
  cycleId?: string;
  departmentId?: string;
  status?: string;
  /** One request (the dashboard's per-row download, the request page). */
  requestId?: string;
};

export type ExportLine = {
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  /** Null until approved. */
  approved: {
    quantity: number | null;
    unitPriceCents: number | null;
    lineTotalCents: number;
  } | null;
  link: string | null;
  notes: string | null;
  reason: string | null;
};

export type ExportRequest = {
  reference: string;
  budgetYear: number;
  department: string;
  requester: string;
  requesterEmail: string;
  submittedAt: Date;
  status: Exclude<AnnualStatus, "draft">;
  rate: string;
  requested: TaxBreakdown;
  approved: TaxBreakdown | null;
  /** Approved total minus requested total, once approved. */
  differenceCents: number | null;
  approver: string | null;
  approvedAt: Date | null;
  justification: string;
  editCount: number;
  lines: ExportLine[];
  /** The pre-tax gap when one total was approved (FR-16): its own row, so lines add up. */
  adjustmentCents: number | null;
};

export type AnnualExport = {
  brand: EmailBrand;
  logo: WorkbookLogo | null;
  generatedAt: Date;
  zone: string;
  cycle: { id: string; name: string; budgetYear: number };
  filterLabels: string[];
  single: boolean;
  fileName: string;
  requests: ExportRequest[];
};

const uuid = z.uuid();
const w = exportsCopy.workbook;

async function pickCycle(tx: Tx, filters: AnnualExportFilters) {
  const columns = {
    id: budgetCycles.id,
    name: budgetCycles.name,
    budgetYear: budgetCycles.budgetYear,
    status: budgetCycles.status,
  };
  if (filters.requestId) {
    const [row] = await tx
      .select(columns)
      .from(budgetRequests)
      .innerJoin(budgetCycles, eq(budgetCycles.id, budgetRequests.budgetCycleId))
      .where(eq(budgetRequests.id, filters.requestId));
    return row ?? null;
  }
  const cycles = await tx
    .select(columns)
    .from(budgetCycles)
    .orderBy(desc(budgetCycles.budgetYear), desc(budgetCycles.createdAt));
  return (
    cycles.find((c) => c.id === filters.cycleId) ??
    cycles.find((c) => c.status === "open") ??
    cycles[0] ??
    null
  );
}

export async function buildAnnualExport(
  tx: Tx,
  actor: Subject,
  input: AnnualExportFilters,
  { now = new Date() }: { now?: Date } = {},
): Promise<AnnualExport> {
  const { actingRole } = assertCan(actor, "annual.export_all");
  const filters: AnnualExportFilters = {
    cycleId: uuid.safeParse(input.cycleId).success ? input.cycleId : undefined,
    departmentId: uuid.safeParse(input.departmentId).success ? input.departmentId : undefined,
    requestId: uuid.safeParse(input.requestId).success ? input.requestId : undefined,
  };
  if (input.requestId && !filters.requestId) throw new RuleError(exportsCopy.download.failed);
  const status: QueueFilter = QUEUE_FILTERS.find((f) => f === input.status) ?? "all";

  const cycle = await pickCycle(tx, filters);
  if (!cycle) throw new RuleError(exportsCopy.page.noCycles);

  const rows = await tx
    .select({
      id: budgetRequests.id,
      status: budgetRequests.status,
      departmentName: departments.name,
      requesterEmail: users.email,
    })
    .from(budgetRequests)
    .innerJoin(departments, eq(departments.id, budgetRequests.departmentId))
    .innerJoin(users, eq(users.id, budgetRequests.requesterUserId))
    .where(
      and(
        eq(budgetRequests.budgetCycleId, cycle.id),
        ne(budgetRequests.status, "draft"),
        filters.requestId ? eq(budgetRequests.id, filters.requestId) : undefined,
        filters.departmentId ? eq(budgetRequests.departmentId, filters.departmentId) : undefined,
      ),
    )
    .orderBy(asc(departments.name));
  // A draft is the department's own until it is submitted (FR-14).
  if (filters.requestId && rows.length === 0) throw new RuleError(exportsCopy.download.failed);

  const requests: ExportRequest[] = [];
  for (const row of rows.filter((r) => matchesFilter(r.status, status))) {
    const view = await getReviewView(tx, actor, row.id);
    if (!view || view.status === "draft" || !view.referenceNumber || !view.submittedAt) continue;
    const approval = view.approval;
    const approvedById = new Map(approval?.lines.map((l) => [l.lineId, l]) ?? []);
    const approved = approval
      ? { subtotal: approval.subtotalCents, tax: approval.taxCents, total: approval.totalCents }
      : null;
    requests.push({
      reference: view.referenceNumber,
      budgetYear: view.cycle.budgetYear,
      department: view.department.name,
      requester: view.requesterName,
      requesterEmail: row.requesterEmail,
      submittedAt: view.submittedAt,
      status: view.status,
      rate: view.rate,
      requested: view.totals,
      approved,
      differenceCents: approved ? approved.total - view.totals.total : null,
      approver: approval?.approverName ?? null,
      approvedAt: approval?.approvedAt ?? null,
      justification: view.justification,
      editCount: view.editCount,
      lines: view.lines.map((l) => {
        const a = approvedById.get(l.id);
        return {
          name: l.name,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          lineTotalCents: l.lineTotalCents,
          approved: a
            ? {
                quantity: a.quantity,
                unitPriceCents: a.unitPriceCents,
                lineTotalCents: a.lineTotalCents,
              }
            : null,
          link: l.link,
          notes: l.notes,
          reason: a?.reason ?? null,
        };
      }),
      adjustmentCents: approval?.adjustmentCents ?? null,
    });
  }

  const single = Boolean(filters.requestId);
  const department = filters.departmentId
    ? (
        await tx
          .select({ name: departments.name })
          .from(departments)
          .where(eq(departments.id, filters.departmentId))
      )[0]?.name
    : undefined;
  const filterLabels = [w.filterCycle(cycle.name)];
  if (single && requests[0]) filterLabels.push(w.filterRequest(requests[0].reference));
  if (department) filterLabels.push(w.filterDepartment(department));
  if (status !== "all") filterLabels.push(w.filterStatus(exportsCopy.statusFilters[status]));

  const year = `FY${cycle.budgetYear}`;
  const fileName =
    single && requests[0]
      ? `${year}_${fileNamePart(requests[0].department)}_${fileNamePart(requests[0].reference)}.xlsx`
      : [
          year,
          "Annual_Budgets",
          department ? fileNamePart(department) : null,
          status !== "all" ? fileNamePart(exportsCopy.statusFilters[status]) : null,
        ]
          .filter(Boolean)
          .join("_") + ".xlsx";

  await writeAudit(tx, {
    actor: { kind: "user", userId: actor.id, actingRole },
    area: "annual",
    eventType: "annual.exported",
    entity: { type: "budget_cycle", id: cycle.id },
    cycleId: cycle.id,
    budgetRequestId: single ? filters.requestId : undefined,
    departmentId: filters.departmentId,
    details: {
      fileName,
      requests: requests.length,
      filters: { departmentId: filters.departmentId, status, requestId: filters.requestId },
    },
  });

  return {
    brand: await emailBrand(tx),
    logo: await rasterLogo(tx, await getBrand(tx)),
    generatedAt: now,
    zone: await getChurchTimeZone(tx),
    cycle: { id: cycle.id, name: cycle.name, budgetYear: cycle.budgetYear },
    filterLabels,
    single,
    fileName,
    requests,
  };
}
