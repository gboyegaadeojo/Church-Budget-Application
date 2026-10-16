import Link from "next/link";
import { KeyRound } from "lucide-react";
import { AREA_STYLE, AreaBadge } from "@/components/app-shell/area-icon";
import { linkClass } from "@/components/ui/styles";
import { activityCopy as a, activityLabel } from "@/copy/activity";
import { annualCopy } from "@/copy/annual";
import { copy } from "@/copy/en-CA";
import type { ActivityItem, AuditAreaName } from "@/domain/analytics/activity";
import type { AreaId } from "@/domain/navigation";
import { detailRows } from "@/domain/analytics/details";
import { authorize, type Subject } from "@/lib/authz";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/roles";
import { formatDateTime } from "@/lib/time-zone";

/** Each role's chip colour (text names the role, so colour is never the only signal). */
const ROLE_TONE: Record<Role, string> = {
  requester: "bg-area-expenses-soft text-area-expenses",
  accountant: "bg-area-annual-soft text-area-annual",
  backup_approver: "bg-area-annual-soft text-area-annual",
  board_chair: "bg-area-reports-soft text-area-reports",
  vice_chair: "bg-area-reports-soft text-area-reports",
  church_admin: "bg-area-spending-soft text-area-spending",
  system_admin: "bg-area-admin-soft text-area-admin",
};

/** The audit areas in the navigation's colours; Access uses Admin's, with its own icon. */
const AUDIT_AREA: Record<AuditAreaName, AreaId> = {
  annual: "annual",
  expenses: "expenses",
  spending: "spending",
  admin: "admin",
  access: "admin",
};

function AuditAreaBadge({ area }: { area: AuditAreaName }) {
  if (area !== "access") return <AreaBadge area={AUDIT_AREA[area]} size="sm" />;
  const s = AREA_STYLE.admin;
  return (
    <span
      aria-hidden="true"
      className={cn("grid size-7 shrink-0 place-items-center rounded-control", s.soft, s.text)}
    >
      <KeyRound className="size-4" />
    </span>
  );
}

export function RoleChip({ role }: { role: Role }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        ROLE_TONE[role],
      )}
    >
      {copy.roles[role]}
    </span>
  );
}

/**
 * The activity log (DRD 6.13): each event with its area's icon and colour, what happened
 * in plain language with its budget and department, who did it in which role, when, and
 * why. Rows with details expand to a before/after comparison; changes are marked with a
 * word as well as colour. A table on wider screens, a list of cards on phones.
 */
export function ActivityTable({
  items,
  viewer,
  zone,
  caption = a.caption,
  showItem = true,
}: {
  items: ActivityItem[];
  viewer: Subject;
  zone: string;
  caption?: string;
  /** Off on an item's own History, where every row is the same item. */
  showItem?: boolean;
}) {
  const reviews = authorize(viewer, "annual.review").allowed;
  const admin = viewer.roles.includes("system_admin");
  // A leader opens their own department's budget (drafts too); the accountant opens the
  // review screen; anyone else the read-only budget page.
  const leads = (departmentId: string | undefined) =>
    departmentId !== undefined && viewer.departments.some((d) => d.id === departmentId);
  const requestHref = (e: ActivityItem) =>
    reviews && !leads(e.department?.id)
      ? `/annual/review/${e.request!.id}`
      : `/annual/${e.request!.id}`;
  const th = "px-4 py-2.5 text-xs font-semibold tracking-wide text-fg-muted uppercase";

  const what = (e: ActivityItem) => {
    const rows = detailRows(e.details);
    return (
      <div className="min-w-0 space-y-1">
        <p className="font-medium">{activityLabel(e.eventType)}</p>
        <p className="text-xs text-fg-muted">
          {a.areas[e.area]}
          {showItem && e.request && (
            <>
              {" · "}
              <Link href={requestHref(e)} className={linkClass}>
                {e.request.reference || e.request.title || annualCopy.dashboard.untitled}
              </Link>
            </>
          )}
          {showItem && e.department && (
            <>
              {" · "}
              {admin ? (
                <Link href={`/admin/departments/${e.department.id}`} className={linkClass}>
                  {e.department.name}
                </Link>
              ) : (
                e.department.name
              )}
            </>
          )}
        </p>
        {rows.length > 0 && (
          <details className="group/details">
            {/* 24 px tall at least, so it's an easy target (WCAG 2.5.8). */}
            <summary className="cursor-pointer py-1 text-xs leading-4 font-medium text-accent">
              {a.showDetails}
            </summary>
            <DetailsTable rows={rows} />
          </details>
        )}
      </div>
    );
  };

  const who = (e: ActivityItem) => (
    <div className="space-y-1">
      <p>
        {e.actor ? (
          admin ? (
            <Link href={`/admin/users/${e.actor.id}`} className={linkClass}>
              {e.actor.name}
            </Link>
          ) : (
            e.actor.name
          )
        ) : (
          <span className="text-fg-muted">{e.actorKind === "job" ? a.job : a.system}</span>
        )}
      </p>
      {e.actingRole && <RoleChip role={e.actingRole} />}
    </div>
  );

  return (
    <div
      role="region"
      aria-label={caption}
      className="overflow-hidden rounded-card border border-border bg-surface shadow-card"
    >
      {/* Phones: one card per event. */}
      <ul className="divide-y divide-border md:hidden">
        {items.map((e) => (
          <li key={e.id} className="flex gap-3 p-4">
            <AuditAreaBadge area={e.area} />
            <div className="min-w-0 flex-1 space-y-2 text-sm">
              {what(e)}
              {who(e)}
              <p className="text-xs text-fg-muted">{formatDateTime(e.at, zone)}</p>
              {e.reason && <p className="break-words">{e.reason}</p>}
            </div>
          </li>
        ))}
      </ul>

      <table className="hidden w-full text-left text-sm md:table">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-border bg-surface-2">
          <tr>
            <th scope="col" className={th}>
              {a.columns.what}
            </th>
            <th scope="col" className={th}>
              {a.columns.who}
            </th>
            <th scope="col" className={th}>
              {a.columns.when}
            </th>
            <th scope="col" className={th}>
              {a.columns.reason}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((e) => (
            <tr key={e.id} className="align-top transition-colors hover:bg-surface-hover">
              <td className="px-4 py-3">
                <div className="flex gap-3">
                  <AuditAreaBadge area={e.area} />
                  {what(e)}
                </div>
              </td>
              <td className="px-4 py-3">{who(e)}</td>
              <td className="px-4 py-3 whitespace-nowrap text-fg-muted">
                {formatDateTime(e.at, zone)}
              </td>
              <td className="max-w-xs px-4 py-3 break-words">{e.reason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailsTable({ rows }: { rows: ReturnType<typeof detailRows> }) {
  const comparison = rows.some((r) => r.value === undefined);
  return (
    <table className="mt-2 w-full text-xs">
      <thead>
        <tr className="text-fg-muted">
          <th scope="col" className="pr-3 text-left font-medium">
            {a.field}
          </th>
          {comparison ? (
            <>
              <th scope="col" className="pr-3 text-left font-medium">
                {a.before}
              </th>
              <th scope="col" className="text-left font-medium">
                {a.after}
              </th>
            </>
          ) : (
            <th scope="col" className="text-left font-medium">
              {a.details}
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.field} className={cn(r.changed && "bg-warning/10")}>
            <th scope="row" className="pr-3 text-left font-medium">
              {r.field}
              {r.changed && <span className="ml-1 font-normal text-fg-muted">({a.changed})</span>}
            </th>
            {r.value !== undefined ? (
              <td colSpan={comparison ? 2 : 1} className="break-words">
                {r.value}
              </td>
            ) : (
              <>
                <td className="pr-3 break-words">{r.before}</td>
                <td className="break-words">{r.after}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
