import { and, eq, sql, type SQL } from "drizzle-orm";
import { expenseSubmissions } from "@/db/schema";
import { parseCAD } from "@/lib/money";
import { EXPENSE_STATUSES, EXPENSE_TYPES, type ExpenseStatus, type ExpenseType } from "./status";

/**
 * Search and filters shared by every expense list (FR-48): department, type, status, payee
 * (through the search), the submitted date range and the amount. The values stay as typed,
 * so the form can show them again; anything that doesn't parse is ignored.
 */
export type ExpenseListFilters = {
  q?: string;
  department?: string;
  type?: string;
  status?: string;
  /** Submitted on or after, YYYY-MM-DD in the church's time zone. */
  from?: string;
  /** Submitted on or before, YYYY-MM-DD in the church's time zone. */
  to?: string;
  /** Amount at least, as typed ("1,000"); the approved amount once there is one. */
  min?: string;
  /** Amount at most, as typed. */
  max?: string;
  /** Approver queues only: "yes" keeps over-budget rows. */
  overBudget?: string;
};

const KEYS = [
  "q",
  "department",
  "type",
  "status",
  "from",
  "to",
  "min",
  "max",
  "overBudget",
] as const;

/** The filters from the address, as plain strings. */
export function parseListFilters(
  query: Record<string, string | string[] | undefined>,
): ExpenseListFilters {
  const out: ExpenseListFilters = {};
  for (const key of KEYS) {
    const value = query[key];
    if (typeof value === "string" && value.trim()) out[key] = value.trim().slice(0, 100);
  }
  return out;
}

export function hasListFilters(filters: ExpenseListFilters): boolean {
  return Object.values(filters).some(Boolean);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string | undefined): string | null {
  if (!value || !DATE.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value;
}

export function filterType(value: string | undefined): ExpenseType | null {
  return value && (EXPENSE_TYPES as readonly string[]).includes(value)
    ? (value as ExpenseType)
    : null;
}

export function filterStatus(value: string | undefined): ExpenseStatus | null {
  return value && (EXPENSE_STATUSES as readonly string[]).includes(value)
    ? (value as ExpenseStatus)
    : null;
}

/** The amount filters in cents, or null when blank or not an amount. */
export function amountBounds(filters: ExpenseListFilters): {
  min: number | null;
  max: number | null;
} {
  return {
    min: filters.min ? parseCAD(filters.min) : null,
    max: filters.max ? parseCAD(filters.max) : null,
  };
}

/**
 * The SQL for the filters on `expense_submissions`. Status is left to the caller when it
 * narrows a fixed set of statuses (the queues). Dates compare the submitted day in the
 * church's time zone.
 */
export function listFilterConditions(
  filters: ExpenseListFilters,
  zone: string,
  options: { status?: boolean } = { status: true },
): SQL | undefined {
  const s = expenseSubmissions;
  const conditions: (SQL | undefined)[] = [];
  if (filters.department && /^[0-9a-f-]{36}$/i.test(filters.department)) {
    conditions.push(eq(s.departmentId, filters.department));
  }
  const type = filterType(filters.type);
  if (type) conditions.push(eq(s.type, type));
  const status = filterStatus(filters.status);
  if (options.status && status) conditions.push(eq(s.status, status));

  const q = filters.q?.trim();
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conditions.push(
      sql`(${s.referenceNumber} ilike ${pattern} or ${s.title} ilike ${pattern} or ${s.payeeName} ilike ${pattern} or ${s.departmentNameSnapshot} ilike ${pattern})`,
    );
  }

  const day = sql`(${s.submittedAt} at time zone ${zone})::date`;
  const from = validDate(filters.from);
  if (from) conditions.push(sql`${day} >= ${from}::date`);
  const to = validDate(filters.to);
  if (to) conditions.push(sql`${day} <= ${to}::date`);

  const amount = sql`coalesce(${s.approvedTotalCents}, ${s.totalCents})`;
  const { min, max } = amountBounds(filters);
  if (min !== null) conditions.push(sql`${amount} >= ${min}`);
  if (max !== null) conditions.push(sql`${amount} <= ${max}`);

  return and(...conditions);
}
