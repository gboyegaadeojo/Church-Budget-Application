import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminSkeleton, EmptyState, PageHeader, PermissionDenied } from "@/components/ui/display";
import { expensesCopy } from "@/copy/expenses";
import { getDb } from "@/db";
import { expenseStartOptions } from "@/domain/expenses/queries";
import { hasRole } from "@/lib/roles";
import { getViewer } from "@/lib/viewer";
import { StartExpenseForm } from "./start-form";

const s = expensesCopy.start;

export const metadata: Metadata = { title: s.title };

/** New expense (DRD 6.9a "type chooser", 6B.3 steps 1-3). */
export default function NewExpensePage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <NewExpenseContent />
      </Suspense>
    </div>
  );
}

async function NewExpenseContent() {
  const viewer = await getViewer();
  if (!hasRole(viewer, "requester")) return <PermissionDenied />;
  const options = await expenseStartOptions(getDb(), viewer);
  const withBudget = options.filter((d) => d.cycles.length > 0);
  return (
    <>
      <PageHeader
        title={s.title}
        intro={s.intro}
        back={{ href: "/expenses/mine", label: expensesCopy.mine.title }}
      />
      {options.length === 0 ? (
        <EmptyState>{s.noDepartments}</EmptyState>
      ) : withBudget.length === 0 ? (
        <EmptyState>{s.noBudgets}</EmptyState>
      ) : (
        <StartExpenseForm departments={withBudget} />
      )}
    </>
  );
}
