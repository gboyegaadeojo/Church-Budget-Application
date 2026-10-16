import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminSkeleton, PageHeader, PermissionDenied } from "@/components/ui/display";
import { cardClass } from "@/components/ui/styles";
import { expensesCopy } from "@/copy/expenses";
import { getDb } from "@/db";
import { centsToInput } from "@/domain/annual/schema";
import { isProcessable, signerOptions } from "@/domain/expenses/payment";
import { getExpenseView } from "@/domain/expenses/queries";
import { authzContextOf, loadExpense } from "@/domain/expenses/service";
import { getChurchTimeZone } from "@/domain/settings";
import { authorize } from "@/lib/authz";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import { zonedDate } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";
import { ExpenseNotFound } from "../../[id]/not-found-state";
import { ExpenseStatusBadge } from "../../status-badge";
import { PaymentForm } from "./payment-form";

const p = expensesCopy.payment;
const v = expensesCopy.view;

export const metadata: Metadata = { title: p.record };

/** Record payment for one approved expense (6B.5 steps 3-4, DRD 6.9a). */
export default function RecordPaymentPage({ params }: PageProps<"/expenses/ready/[id]">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <RecordPaymentContent params={params} />
      </Suspense>
    </div>
  );
}

async function RecordPaymentContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  const db = getDb();
  const expense = await getExpenseView(db, viewer, id);
  if (!expense) return <ExpenseNotFound />;
  const row = await loadExpense(db, id);
  if (!authorize(viewer, "expense.pay", authzContextOf(row)).allowed) return <PermissionDenied />;
  if (!["approved", "processing"].includes(row.status) || !isProcessable(row)) {
    redirect(`/expenses/${id}`);
  }
  const today = zonedDate(new Date(), await getChurchTimeZone(db));
  const signers = await signerOptions(db, today);
  const c = expense.content;
  const payee =
    expense.type === "purchase_request"
      ? p.churchAccount
      : c.payeeKind === "church_card"
        ? p.nothingOwed
        : (expense.payee.name ?? "");
  const defaultMethod =
    expense.type === "purchase_request"
      ? c.howBought === "supplier_invoice"
        ? "supplier_eft"
        : "church_card"
      : c.payeeKind === "church_card"
        ? "church_card"
        : c.paymentPreference === "e_transfer"
          ? "e_transfer"
          : "cheque";

  return (
    <>
      <PageHeader
        title={p.recordTitle(expense.referenceNumber ?? "")}
        intro={expense.title}
        back={{ href: "/expenses/ready", label: p.queueTitle }}
      >
        <ExpenseStatusBadge status={expense.status} />
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <dl className={cn(cardClass, "space-y-3 text-sm")}>
          <Item label={v.type}>{expensesCopy.types[expense.type]}</Item>
          <Item label={v.department}>{expense.department.name}</Item>
          <Item label={v.payee}>{payee}</Item>
          {c.paymentPreference && c.payeeKind !== "church_card" && (
            <Item label={v.paymentPreference}>
              {expensesCopy.paymentPreference[c.paymentPreference]}
              {expense.payee.email && ` (${expense.payee.email})`}
            </Item>
          )}
          {c.howBought && <Item label={v.howBought}>{expensesCopy.howBought[c.howBought]}</Item>}
          <Item label={v.approvedAmount}>
            <span className="tabular text-lg font-semibold">
              {formatCAD(expense.approved?.total ?? 0)}
            </span>
          </Item>
        </dl>
        <section className={cardClass} aria-label={p.record}>
          <PaymentForm
            id={expense.id}
            version={expense.version}
            type={expense.type}
            approvedCents={expense.approved?.total ?? 0}
            approvedInput={centsToInput(expense.approved?.total ?? 0)}
            today={today}
            signers={signers}
            payeeEmail={expense.payee.email}
            defaultMethod={defaultMethod}
          />
        </section>
      </div>
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
