import Link from "next/link";
import { Badge } from "@/components/ui/display";
import { linkClass } from "@/components/ui/styles";
import { activityCopy as a, activityLabel } from "@/copy/activity";
import { annualCopy } from "@/copy/annual";
import { copy } from "@/copy/en-CA";
import type { ActivityItem } from "@/domain/analytics/activity";
import { detailRows } from "@/domain/analytics/details";
import { authorize, type Subject } from "@/lib/authz";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/time-zone";

/**
 * The activity log as a table (DRD 6.13): when, who with the role they acted in, what in
 * plain language, the item, department and reason. Each row with details expands to a
 * before/after comparison; changes are marked with a word as well as colour. Reference
 * numbers, people and departments are links where the viewer may open them.
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
  const requestHref = (id: string) => (reviews ? `/annual/review/${id}` : `/annual/${id}`);
  const th = "py-2 pr-4 font-medium text-fg-muted";

  return (
    <div
      className="overflow-x-auto rounded-card border border-border bg-surface"
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className="w-full min-w-[52rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-border">
          <tr>
            <th scope="col" className={cn(th, "pl-4")}>
              {a.columns.when}
            </th>
            <th scope="col" className={th}>
              {a.columns.who}
            </th>
            <th scope="col" className={th}>
              {a.columns.what}
            </th>
            {showItem && (
              <th scope="col" className={th}>
                {a.columns.item}
              </th>
            )}
            {showItem && (
              <th scope="col" className={th}>
                {a.columns.department}
              </th>
            )}
            <th scope="col" className={th}>
              {a.columns.reason}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((e) => {
            const rows = detailRows(e.details);
            return (
              <tr key={e.id} className="align-top">
                <td className="py-3 pr-4 pl-4 whitespace-nowrap">{formatDateTime(e.at, zone)}</td>
                <td className="py-3 pr-4">
                  {e.actor ? (
                    admin ? (
                      <Link href={`/admin/users/${e.actor.id}`} className={linkClass}>
                        {e.actor.name}
                      </Link>
                    ) : (
                      e.actor.name
                    )
                  ) : (
                    <span className="text-fg-muted">
                      {e.actorKind === "job" ? a.job : a.system}
                    </span>
                  )}
                  {e.actingRole && (
                    <span className="mt-1 block">
                      <Badge>{copy.roles[e.actingRole]}</Badge>
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  <span className="block">{activityLabel(e.eventType)}</span>
                  <span className="block text-xs text-fg-muted">{a.areas[e.area]}</span>
                  {rows.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-accent">
                        {a.showDetails}
                      </summary>
                      <DetailsTable rows={rows} />
                    </details>
                  )}
                </td>
                {showItem && (
                  <td className="py-3 pr-4 whitespace-nowrap">
                    {e.request ? (
                      <Link href={requestHref(e.request.id)} className={linkClass}>
                        {e.request.reference || e.request.title || annualCopy.dashboard.untitled}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                )}
                {showItem && (
                  <td className="py-3 pr-4">
                    {e.department ? (
                      admin ? (
                        <Link href={`/admin/departments/${e.department.id}`} className={linkClass}>
                          {e.department.name}
                        </Link>
                      ) : (
                        e.department.name
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                )}
                <td className="max-w-xs py-3 pr-4 break-words">{e.reason ?? "—"}</td>
              </tr>
            );
          })}
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
