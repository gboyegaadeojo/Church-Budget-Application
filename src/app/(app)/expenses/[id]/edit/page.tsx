import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminSkeleton } from "@/components/ui/display";
import { expensesCopy } from "@/copy/expenses";
import { getDb } from "@/db";
import { centsToInput } from "@/domain/annual/schema";
import { getExpenseView } from "@/domain/expenses/queries";
import { receiptCount } from "@/domain/expenses/service";
import { getViewer } from "@/lib/viewer";
import { ExpenseNotFound } from "../not-found-state";
import { ExpenseEditor, type ExpenseEditorMode } from "./expense-editor";

export const metadata: Metadata = { title: expensesCopy.start.title };

/**
 * The expense form (DRD 6.9a) for a draft, a change before review starts, or an answer
 * to a return for clarification (FR-44).
 */
export default function EditExpensePage({ params }: PageProps<"/expenses/[id]/edit">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <EditContent params={params} />
      </Suspense>
    </div>
  );
}

async function EditContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  const db = getDb();
  const expense = await getExpenseView(db, viewer, id);
  if (!expense) return <ExpenseNotFound />;
  if (!expense.canEdit) redirect(`/expenses/${id}`);
  const mode: ExpenseEditorMode =
    expense.status === "draft" ? "draft" : expense.status === "returned" ? "respond" : "edit";
  const c = expense.content;

  return (
    <ExpenseEditor
      mode={mode}
      info={{
        id: expense.id,
        version: expense.version,
        type: expense.type,
        department: expense.department.name,
        cycleName: expense.cycle.name,
        requesterName: expense.requester.name,
        rate: expense.rate,
        figures: expense.figures,
        linkable: expense.linkable,
        annualLines: expense.annualLines,
        today: expense.today,
        claimDeadlineDays: expense.claimDeadlineDays,
        receiptCount: await receiptCount(db, expense.id),
        question: expense.question,
      }}
      initial={{
        title: c.title,
        justification: c.justification,
        items: c.items.map((i) => ({
          name: i.name,
          quantity: String(i.quantity),
          unitPrice: centsToInput(i.unitPriceCents),
          link: i.link ?? "",
          annualLineItemId: i.annualLineItemId ?? "",
        })),
        howBought: c.howBought ?? "",
        lines: c.lines.map((l) => ({
          date: l.date,
          vendor: l.vendor,
          description: l.description,
          amount: centsToInput(l.amountCents),
          receiptNumber: l.receiptNumber ?? "",
        })),
        linkedPurchaseRequestId: c.linkedPurchaseRequestId ?? "",
        payeeKind: c.payeeKind ?? "",
        payeeName: c.payeeName ?? "",
        payeeEmail: c.payeeKind === "self" && !c.payeeEmail ? "" : (c.payeeEmail ?? ""),
        paymentPreference: c.paymentPreference ?? "",
        noReceipt: c.noReceipt,
        noReceiptReason: c.noReceiptReason ?? "",
        overBudgetExplanation: c.overBudgetExplanation ?? "",
        lateExplanation: c.lateExplanation ?? "",
      }}
    />
  );
}
