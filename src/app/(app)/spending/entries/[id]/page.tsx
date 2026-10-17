import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, PenLine, XCircle } from "lucide-react";
import { ActionForm, SubmitButton, TextAreaField } from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  AdminSkeleton,
  Badge,
  PageHeader,
  PermissionDenied,
  Section,
} from "@/components/ui/display";
import { cardClass, linkClass } from "@/components/ui/styles";
import { spendingCopy } from "@/copy/spending";
import { getDb } from "@/db";
import { entryForEdit } from "@/domain/spending/queries";
import { spendingPeriod } from "@/domain/spending/service";
import { budgetCycles } from "@/db/schema";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/money";
import { formatDate } from "@/lib/time-zone";
import { authorize } from "@/lib/authz";
import { getViewer } from "@/lib/viewer";
import { eq } from "drizzle-orm";
import { correctEntryAction, voidEntryAction } from "../../actions";
import { EntryFields } from "../../entry-fields";

const x = spendingCopy.edit;

export const metadata: Metadata = { title: x.title };

/** Correct a spending entry with a reason, or void it (FR-24, AC-87). */
export default function EntryPage({ params, searchParams }: PageProps<"/spending/entries/[id]">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <EntryContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const centsText = (cents: number) => formatCAD(cents).replace(/^\$/, "").replaceAll(",", "");

async function EntryContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const viewer = await getViewer();
  const db = getDb();
  const found = await entryForEdit(db, viewer, id);
  if (!authorize(viewer, "spending.record").allowed) return <PermissionDenied />;
  if (found === null) notFound();
  const { entry } = found;
  const [cycle] = await db
    .select()
    .from(budgetCycles)
    .where(eq(budgetCycles.id, entry.budgetCycleId));
  const voided = entry.status === "voided";
  const changeable = !voided && !found.locked && !entry.expenseSubmissionId;
  const voidFormId = `void-${entry.id}`;

  return (
    <>
      <PageHeader
        title={`${entry.payee} · ${formatCAD(entry.amountCents)}`}
        back={{ href: `/spending/ledger?cycle=${entry.budgetCycleId}`, label: x.back }}
      >
        <Badge tone={voided ? "neutral" : entry.entryType === "refund" ? "info" : "success"}>
          {voided ? spendingCopy.ledgerStatus.voided : spendingCopy.types[entry.entryType]}
        </Badge>
      </PageHeader>

      {query.done === "voided" && (
        <p
          role="status"
          className={cn(cardClass, "flex items-center gap-3 border-success p-4 text-sm")}
        >
          <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
          {x.voided}
        </p>
      )}

      <section className={cn(cardClass, "space-y-1 text-sm")}>
        <p>
          {found.department} · {found.cycle} · {formatDate(entry.spentOn)}
        </p>
        <p className="text-fg-muted">{entry.description}</p>
        {voided && entry.voidReason && (
          <p className="text-fg-muted">{x.voidedNote(entry.voidReason)}</p>
        )}
        {entry.expenseSubmissionId && (
          <p>
            {x.fromExpense}{" "}
            <Link href={`/expenses/${entry.expenseSubmissionId}`} className={linkClass}>
              {x.openExpense}
            </Link>
          </p>
        )}
        {found.locked && <p className="text-warning">{x.lockedNote}</p>}
      </section>

      {changeable && (
        <>
          <Section title={x.correctHeading} icon={PenLine} tone="green">
            <ActionForm action={correctEntryAction} aria-label={x.correctHeading}>
              <input type="hidden" name="id" value={entry.id} />
              <input type="hidden" name="version" value={entry.version} />
              <EntryFields
                defaults={{
                  entryType: entry.entryType,
                  spentOn: entry.spentOn,
                  payee: entry.payee,
                  description: entry.description,
                  amount: centsText(entry.amountCents),
                  paymentMethod: entry.paymentMethod ?? "",
                  referenceNumber: entry.referenceNumber ?? "",
                  budgetLineItemId: entry.budgetLineItemId ?? "",
                  notes: entry.notes ?? "",
                  overspendNote: entry.overspendNote ?? "",
                }}
                lines={found.lines}
                period={spendingPeriod(cycle)}
                canAllowOutsideYear={found.canAllowOutsideYear}
              />
              <TextAreaField name="reason" label={x.reason} rows={2} required />
              <SubmitButton>{x.save}</SubmitButton>
            </ActionForm>
          </Section>

          <Section title={x.voidHeading} icon={XCircle} tone="red">
            <p className="text-sm text-fg-muted">{x.voidIntro}</p>
            <ActionForm action={voidEntryAction} id={voidFormId} aria-label={x.voidHeading}>
              <input type="hidden" name="id" value={entry.id} />
              <input type="hidden" name="version" value={entry.version} />
              <TextAreaField name="reason" label={x.voidReason} rows={2} required />
              <ConfirmDialog
                formId={voidFormId}
                trigger={x.void}
                triggerTone="danger"
                title={x.voidTitle}
                body={x.voidBody}
                confirmLabel={x.void}
              />
            </ActionForm>
          </Section>
        </>
      )}
    </>
  );
}
