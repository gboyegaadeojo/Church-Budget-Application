import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { FilePen, ListTree, PiggyBank } from "lucide-react";
import {
  ActionForm,
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/ui/action-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  AdminSkeleton,
  Badge,
  EmptyState,
  PageHeader,
  PermissionDenied,
  Section,
} from "@/components/ui/display";
import { RevealOnError } from "@/components/ui/reveal-on-error";
import { linkClass } from "@/components/ui/styles";
import { spendingCopy } from "@/copy/spending";
import { getDb } from "@/db";
import { formatPercentTenths } from "@/domain/expenses/budget";
import { departmentSpending } from "@/domain/spending/dashboard";
import { getChurchTimeZone } from "@/domain/settings";
import { authorize } from "@/lib/authz";
import { formatCAD } from "@/lib/money";
import { formatDateTime } from "@/lib/time-zone";
import { getViewer } from "@/lib/viewer";
import { amendBudgetAction } from "../../actions";
import { Remaining, STATUS_TONE, UsedBar } from "../../dashboard-view";

const d = spendingCopy.dashboard;
const p = spendingCopy.department;
const a = spendingCopy.amend;

export const metadata: Metadata = { title: d.title };

/**
 * One department's spending for a year (FR-26 drill-down, DRD 6.8 and 6.9): its budget
 * with amendments, spending by approved line, and the accountant's amendment form.
 */
export default function DepartmentSpendingPage({
  params,
  searchParams,
}: PageProps<"/spending/departments/[id]">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <DepartmentContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function DepartmentContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const viewer = await getViewer();
  if (!authorize(viewer, "spending.view").allowed) return <PermissionDenied />;
  const db = getDb();
  const cycleId = typeof query.cycle === "string" ? query.cycle : "";
  const view = await departmentSpending(db, viewer, cycleId, id);
  if (!view) notFound();
  const zone = await getChurchTimeZone(db);
  const f = view.figures;
  const formId = `amend-${view.department.id}`;
  const back = viewer.roles.some(
    (r) => r === "accountant" || r === "backup_approver" || r === "church_admin",
  )
    ? "/spending"
    : "/spending/budget-vs-actual";

  return (
    <>
      <PageHeader
        title={`${view.department.name} · ${view.cycle.name}`}
        back={{ href: `${back}?cycle=${view.cycle.id}`, label: p.back }}
      >
        <Badge tone={STATUS_TONE[view.status]}>{d.status[view.status]}</Badge>
      </PageHeader>

      <Section title={p.budget} icon={PiggyBank} tone="blue">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            [d.approved, formatCAD(f.approved)],
            [d.amendments, f.amendments === 0 ? d.none : formatCAD(f.amendments)],
            [d.available, formatCAD(f.available)],
            [d.committed, formatCAD(f.committed)],
            [d.pending, formatCAD(f.pending)],
            [d.spent, formatCAD(f.spent)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-fg-muted">{label}</dt>
              <dd className="tabular font-semibold">{value}</dd>
            </div>
          ))}
          <div>
            <dt className="text-fg-muted">{d.remaining}</dt>
            <dd className="tabular font-semibold">
              <Remaining cents={f.remaining} />
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">{d.used}</dt>
            <dd>
              <UsedBar tenths={view.usedTenths} status={view.status} />
            </dd>
          </div>
        </dl>
        <Link
          href={`/spending/ledger?cycle=${view.cycle.id}&department=${view.department.id}`}
          className={linkClass}
        >
          {p.ledger}
        </Link>
      </Section>

      <Section title={p.amendmentsHeading} icon={FilePen} tone="violet">
        {view.amendments.length === 0 ? (
          <EmptyState>{p.noAmendments}</EmptyState>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {view.amendments.map((am) => (
              <li key={am.id} className="space-y-1 py-2">
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {am.amountCents > 0 ? p.increase : p.reduction}
                    {am.boardReference && ` · ${am.boardReference}`}
                  </span>
                  <span className="tabular font-semibold">{formatCAD(am.amountCents)}</span>
                </p>
                <p className="text-fg-muted">{am.reason}</p>
                <p className="text-xs text-fg-muted">
                  {p.by(am.by, formatDateTime(am.at, zone))} · {formatCAD(am.amountBeforeTaxCents)}{" "}
                  + {formatCAD(am.taxCents)}
                </p>
              </li>
            ))}
          </ul>
        )}

        {view.canAmend && (
          <ActionForm action={amendBudgetAction} id={formId} aria-label={a.heading} resetOnSuccess>
            <h3 className="text-base font-semibold">{a.heading}</h3>
            <p className="text-sm text-fg-muted">{a.intro}</p>
            <input type="hidden" name="cycleId" value={view.cycle.id} />
            <input type="hidden" name="departmentId" value={view.department.id} />
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                name="direction"
                label={a.direction}
                defaultValue="increase"
                options={[
                  { value: "increase", label: a.increase },
                  { value: "reduction", label: a.reduction },
                ]}
                required
              />
              <TextField
                name="amount"
                label={a.amount}
                hint={a.amountHint}
                inputMode="decimal"
                placeholder="0.00"
                required
              />
            </div>
            <TextAreaField name="reason" label={a.reason} rows={2} required />
            <TextField name="boardReference" label={a.boardReference} hint={a.boardReferenceHint} />
            <RevealOnError name="confirmNegative">
              <CheckboxField name="confirmNegative" label={a.confirmNegative} />
            </RevealOnError>
            <ConfirmDialog
              formId={formId}
              trigger={a.save}
              triggerTone="primary"
              title={a.confirmTitle}
              body={a.confirmBody}
              confirmLabel={a.save}
            />
          </ActionForm>
        )}
      </Section>

      <Section title={p.lines} icon={ListTree} tone="teal">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{p.lines}</caption>
          <thead className="border-b border-border text-[11px] tracking-wide text-fg-muted uppercase">
            <tr>
              <th scope="col" className="py-2 pr-4 font-medium">
                {p.line}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {p.spent}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {view.lines.map((l) => (
              <tr key={l.lineId ?? "general"}>
                <td className="py-2 pr-4">{l.lineId ? l.name : p.general}</td>
                <td className="tabular py-2 text-right">{formatCAD(l.spentCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {view.usedTenths !== null && (
          <p className="text-xs text-fg-muted">{d.usedOf(formatPercentTenths(view.usedTenths))}</p>
        )}
      </Section>
    </>
  );
}
