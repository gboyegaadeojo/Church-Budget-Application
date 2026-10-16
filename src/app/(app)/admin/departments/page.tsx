import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton, TextAreaField } from "@/components/ui/action-form";
import {
  AdminSkeleton,
  Badge,
  EmptyState,
  PageHeader,
  PermissionDenied,
  Section,
} from "@/components/ui/display";
import { linkClass } from "@/components/ui/styles";
import { adminCopy } from "@/copy/admin";
import { getDb } from "@/db";
import {
  countProposed,
  listDepartments,
  type DepartmentListItem,
} from "@/domain/departments/queries";
import { viewerAllowedTo } from "@/lib/admin-server";
import { cn } from "@/lib/cn";
import { addDepartmentsAction } from "./actions";

const d = adminCopy.departments;

export const metadata: Metadata = { title: d.title };

const TABS = ["active", "inactive", "proposed"] as const;
type Tab = (typeof TABS)[number];

/** Admin → Departments (DRD 6.11, FR-03, FR-38). Tab and filter live in the address. */
export default function DepartmentsPage({ searchParams }: PageProps<"/admin/departments">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <DepartmentsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function DepartmentsContent({
  searchParams,
}: Pick<PageProps<"/admin/departments">, "searchParams">) {
  const viewer = await viewerAllowedTo("admin.departments", "/admin/departments");
  if (!viewer) return <PermissionDenied />;
  const params = await searchParams;
  const tab: Tab = TABS.includes(params.tab as Tab) ? (params.tab as Tab) : "active";
  const noBackupOnly = params.filter === "no-backup" && tab === "active";
  const db = getDb();
  const [all, proposedCount] = await Promise.all([listDepartments(db, tab), countProposed(db)]);
  const list = noBackupOnly ? all.filter((x) => x.backups.length === 0) : all;

  return (
    <>
      <PageHeader title={d.title} />

      <nav aria-label={d.title} className="flex flex-wrap gap-2 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t}
            href={t === "active" ? "/admin/departments" : `/admin/departments?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium",
              t === tab
                ? "border-accent text-fg"
                : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {d.tabs[t]}
            {t === "proposed" && proposedCount > 0 && <Badge tone="warning">{proposedCount}</Badge>}
          </Link>
        ))}
      </nav>

      <Section title={d.tabs[tab]} id="department-list">
        {tab === "active" && (
          <Link
            href={noBackupOnly ? "/admin/departments" : "/admin/departments?filter=no-backup"}
            className={cn(linkClass, "inline-flex min-h-11 items-center text-sm lg:min-h-9")}
          >
            {noBackupOnly ? d.showAll : d.noBackupFilter}
          </Link>
        )}
        {list.length === 0 ? (
          <EmptyState>{noBackupOnly ? d.empty.noBackup : d.empty[tab]}</EmptyState>
        ) : (
          <DepartmentsTable departments={list} showLeaders={tab !== "proposed"} />
        )}
      </Section>

      {tab === "active" && (
        <Section title={d.addHeading} id="add-departments">
          <ActionForm action={addDepartmentsAction} resetOnSuccess aria-label={d.addHeading}>
            <TextAreaField name="names" label={d.addLabel} hint={d.addHint} rows={8} required />
            <SubmitButton>{d.add}</SubmitButton>
          </ActionForm>
        </Section>
      )}
    </>
  );
}

function DepartmentsTable({
  departments,
  showLeaders,
}: {
  departments: DepartmentListItem[];
  showLeaders: boolean;
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1" tabIndex={0} role="region" aria-label={d.title}>
      <table className="w-full min-w-[32rem] text-left text-sm">
        <caption className="sr-only">{d.title}</caption>
        <thead className="border-b border-border text-xs text-fg-muted">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">
              {d.columns.name}
            </th>
            {showLeaders && (
              <th scope="col" className="py-2 font-medium">
                {d.columns.leaders}
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {departments.map((x) => (
            <tr key={x.id} className="align-top">
              <td className="py-3 pr-4">
                <Link href={`/admin/departments/${x.id}`} className={linkClass}>
                  {x.name}
                </Link>
                {x.pcoSource && (
                  <span className="block text-xs text-fg-muted">
                    {d.pco.listBadge(x.pcoSource)}
                  </span>
                )}
              </td>
              {showLeaders && (
                <td className="py-3">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {x.primary ? (
                      <Badge tone="info">{d.primaryChip(x.primary.name)}</Badge>
                    ) : (
                      <Badge tone="warning">{d.noPrimary}</Badge>
                    )}
                    {x.backups.length > 0 ? (
                      x.backups.map((b, i) => (
                        <Badge key={b.userId}>{d.backupChip(i + 1, b.name)}</Badge>
                      ))
                    ) : (
                      // DRD 6.11: "No backup" is a warning, not an error.
                      <Badge tone="warning">{d.noBackup}</Badge>
                    )}
                    {x.representatives > 0 && (
                      <span className="text-xs text-fg-muted">
                        {d.representativesCount(x.representatives)}
                      </span>
                    )}
                  </span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
