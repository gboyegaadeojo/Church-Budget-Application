import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { expensePayments, expenseSubmissions } from "@/db/schema";
import type { Tx } from "@/db/types";
import { getChurchTimeZone } from "@/domain/settings";
import { authorize, type Subject } from "@/lib/authz";
import { sumCents } from "@/lib/money";
import { zonedDate } from "@/lib/time-zone";
import { isProcessable } from "./payment";
import { daysBetween } from "./schema";
import { authzContextOf } from "./service";
import type { ExpenseStatus, ExpenseType } from "./status";

/** The Church Administrator's lists (6B.5, FR-48): Ready to process and recently paid. */

export type ReadyRow = {
  id: string;
  referenceNumber: string;
  title: string;
  type: ExpenseType;
  status: ExpenseStatus;
  department: string;
  payee: string | null;
  payeeKind: string | null;
  paymentPreference: string | null;
  howBought: string | null;
  approvedCents: number;
  approvedAt: Date | null;
  daysWaiting: number;
  version: number;
  /** The viewer may record it (not paying themselves). */
  canPay: boolean;
};

export type PaidRow = {
  id: string;
  referenceNumber: string;
  title: string;
  department: string;
  method: string;
  paidOn: string;
  amountCents: number;
};

export type ReadyQueue = {
  rows: ReadyRow[];
  waitingCents: number;
  /** Claims where a person is owed money (not the church card). */
  owedCents: number;
  oldestDays: number | null;
  recent: PaidRow[];
  readOnly: boolean;
};

export async function readyQueue(
  tx: Tx,
  viewer: Subject,
  now: Date = new Date(),
): Promise<ReadyQueue | null> {
  const access = authorize(viewer, "expense.process_queue");
  if (!access.allowed) return null;
  const zone = await getChurchTimeZone(tx);
  const today = zonedDate(now, zone);
  const raw = await tx
    .select()
    .from(expenseSubmissions)
    .where(inArray(expenseSubmissions.status, ["approved", "processing"]))
    .orderBy(asc(expenseSubmissions.approvedAt));
  const rows: ReadyRow[] = raw.filter(isProcessable).map((r) => ({
    id: r.id,
    referenceNumber: r.referenceNumber ?? "",
    title: r.title,
    type: r.type,
    status: r.status,
    department: r.departmentNameSnapshot,
    payee: r.payeeName,
    payeeKind: r.payeeKind,
    paymentPreference: r.paymentPreference,
    howBought: r.howBought,
    approvedCents: r.approvedTotalCents ?? 0,
    approvedAt: r.approvedAt,
    daysWaiting: r.approvedAt ? Math.max(0, daysBetween(zonedDate(r.approvedAt, zone), today)) : 0,
    version: r.version,
    canPay: authorize(viewer, "expense.pay", authzContextOf(r)).allowed,
  }));
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const recent = await tx
    .select({
      id: expenseSubmissions.id,
      referenceNumber: expenseSubmissions.referenceNumber,
      title: expenseSubmissions.title,
      department: expenseSubmissions.departmentNameSnapshot,
      method: expensePayments.method,
      paidOn: expensePayments.paidOn,
      amountCents: expensePayments.amountCents,
    })
    .from(expensePayments)
    .innerJoin(expenseSubmissions, eq(expenseSubmissions.id, expensePayments.expenseSubmissionId))
    .where(and(gte(expensePayments.paidOn, since)))
    .orderBy(desc(expensePayments.paidOn), desc(expensePayments.recordedAt))
    .limit(20);
  return {
    rows,
    waitingCents: sumCents(rows.map((r) => r.approvedCents)),
    owedCents: sumCents(
      rows
        .filter((r) => r.type === "expense_claim" && r.payeeKind !== "church_card")
        .map((r) => r.approvedCents),
    ),
    oldestDays: rows.length > 0 ? Math.max(...rows.map((r) => r.daysWaiting)) : null,
    recent: recent.map((r) => ({ ...r, referenceNumber: r.referenceNumber ?? "" })),
    readOnly: access.readOnly,
  };
}
