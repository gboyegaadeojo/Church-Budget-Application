import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { exportsCopy } from "@/copy/exports";
import { budgetAmendments, departments, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { RuleError } from "@/domain/errors";
import { emailBrand } from "@/domain/notifications/notice";
import { getChurchTimeZone } from "@/domain/settings";
import { getBrand, rasterLogo } from "@/domain/settings/brand";
import { writeAudit } from "@/lib/audit";
import { assertCan, type Subject } from "@/lib/authz";
import type { EmailBrand } from "@/lib/email/layout";
import type { WorkbookLogo } from "@/lib/excel/logo";
import { fileNamePart } from "@/lib/excel/safe";
import { sumCents } from "@/lib/money";
import { usedTenthsOfPercent } from "@/domain/expenses/budget";
import { spendingDashboard, type Dashboard, type DashboardRow } from "./dashboard";
import { getLedger, type LedgerRow } from "./ledger";

/**
 * The spending workbook (FR-26 Export, DRD 6.10): Budget vs Actual, the spending ledger
 * and amendments for a cycle, optionally one department. The figures come from the same
 * `spendingDashboard` and `getLedger` the screens use, so the export matches the
 * dashboard to the cent (AC-91, AC-127). The accountant, backup approvers, the Church
 * Administrator and the System Administrator export; each export is audited.
 */

export type AmendmentRow = {
  createdAt: Date;
  department: string;
  amountBeforeTaxCents: number;
  taxCents: number;
  amountCents: number;
  rate: string;
  reason: string;
  boardReference: string | null;
  by: string;
};

export type SpendingExport = {
  brand: EmailBrand;
  logo: WorkbookLogo | null;
  generatedAt: Date;
  zone: string;
  cycle: { id: string; name: string; budgetYear: number; locked: boolean };
  filterLabels: string[];
  fileName: string;
  rows: DashboardRow[];
  totals: Dashboard["totals"];
  ledger: LedgerRow[];
  amendments: AmendmentRow[];
};

const filterSchema = z.object({ cycleId: z.uuid(), departmentId: z.uuid().optional() });

export async function buildSpendingExport(
  tx: Tx,
  actor: Subject,
  input: { cycleId?: string; departmentId?: string },
  now: Date = new Date(),
): Promise<SpendingExport> {
  const { actingRole } = assertCan(actor, "spending.export");
  const parsed = filterSchema.safeParse({
    cycleId: input.cycleId,
    departmentId: input.departmentId || undefined,
  });
  if (!parsed.success) throw new RuleError(exportsCopy.download.failed);
  const f = parsed.data;
  const dashboard = await spendingDashboard(tx, actor, f.cycleId);
  if (!dashboard?.cycle || dashboard.cycle.id !== f.cycleId) {
    throw new RuleError(exportsCopy.download.failed);
  }
  const cycle = dashboard.cycle;
  const [department] = f.departmentId
    ? await tx
        .select({ name: departments.name })
        .from(departments)
        .where(eq(departments.id, f.departmentId))
    : [];
  if (f.departmentId && !department) throw new RuleError(exportsCopy.download.failed);

  const rows = f.departmentId
    ? dashboard.rows.filter((r) => r.departmentId === f.departmentId)
    : dashboard.rows;
  // One department's totals are its own row; all departments use the dashboard's totals.
  const totals = f.departmentId ? totalsOf(rows) : dashboard.totals;
  const ledger = await getLedger(
    tx,
    actor,
    cycle.id,
    f.departmentId ? { department: f.departmentId } : {},
    { all: true },
  );
  const amendments = await tx
    .select({
      createdAt: budgetAmendments.createdAt,
      department: departments.name,
      amountBeforeTaxCents: budgetAmendments.amountBeforeTaxCents,
      taxCents: budgetAmendments.taxCents,
      amountCents: budgetAmendments.amountCents,
      rate: budgetAmendments.taxRate,
      reason: budgetAmendments.reason,
      boardReference: budgetAmendments.boardReference,
      by: users.displayName,
    })
    .from(budgetAmendments)
    .innerJoin(departments, eq(departments.id, budgetAmendments.departmentId))
    .innerJoin(users, eq(users.id, budgetAmendments.createdByUserId))
    .where(
      and(
        eq(budgetAmendments.budgetCycleId, cycle.id),
        f.departmentId ? eq(budgetAmendments.departmentId, f.departmentId) : undefined,
      ),
    )
    .orderBy(asc(budgetAmendments.createdAt));

  const filterLabels = [cycle.name, department ? department.name : exportsCopy.page.allDepartments];
  const fileName = [
    "Spending",
    String(cycle.budgetYear),
    department ? fileNamePart(department.name) : null,
  ]
    .filter(Boolean)
    .join("_")
    .concat(".xlsx");

  await writeAudit(tx, {
    actor: { kind: "user", userId: actor.id, actingRole },
    area: "spending",
    eventType: "spending.exported",
    entity: { type: "export", id: fileName },
    cycleId: cycle.id,
    departmentId: f.departmentId,
    details: {
      filters: filterLabels,
      departments: rows.length,
      entries: ledger?.rows.length ?? 0,
      amendments: amendments.length,
    },
  });

  return {
    brand: await emailBrand(tx),
    logo: await rasterLogo(tx, await getBrand(tx)),
    generatedAt: now,
    zone: await getChurchTimeZone(tx),
    cycle: { id: cycle.id, name: cycle.name, budgetYear: cycle.budgetYear, locked: cycle.locked },
    filterLabels,
    fileName,
    rows,
    totals,
    ledger: ledger?.rows ?? [],
    amendments,
  };
}

/** Totals for some of the dashboard's rows, summed in cents (one department, a filter). */
export function totalsOf(rows: DashboardRow[]): Dashboard["totals"] {
  const sum = (pick: (r: DashboardRow) => number) => sumCents(rows.map(pick));
  const parts = {
    approved: sum((r) => r.figures.approved),
    amendments: sum((r) => r.figures.amendments),
    available: sum((r) => r.figures.available),
    committed: sum((r) => r.figures.committed),
    pending: sum((r) => r.figures.pending),
    spent: sum((r) => r.figures.spent),
    remaining: sum((r) => r.figures.remaining),
  };
  return { ...parts, usedTenths: usedTenthsOfPercent(parts) };
}
