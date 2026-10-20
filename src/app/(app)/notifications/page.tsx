import { ChevronLeft, ChevronRight } from "lucide-react";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminSkeleton, PageHeader } from "@/components/ui/display";
import { buttonClass, cardClass } from "@/components/ui/styles";
import { groupBySection } from "@/components/notifications/format";
import { NotificationRow } from "@/components/notifications/notification-row";
import { notificationsCopy as n } from "@/copy/notifications";
import { getDb } from "@/db";
import {
  filterCounts,
  isNotificationFilter,
  listNotifications,
  NOTIFICATION_FILTERS,
  type NotificationFilter,
} from "@/domain/notifications/in-app";
import { getChurchTimeZone } from "@/domain/settings";
import { cn } from "@/lib/cn";
import { getViewer } from "@/lib/viewer";
import { MarkAllReadButton } from "./mark-all-read";

export const metadata: Metadata = { title: n.title };

const PAGE_SIZE = 25;

/** Everything the app has told the person, newest first, in date sections (decided 2026-10-19). */
export default function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<AdminSkeleton />}>
        <NotificationsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function href(filter: NotificationFilter, page: number) {
  const search = new URLSearchParams();
  if (filter !== "all") search.set("filter", filter);
  if (page > 1) search.set("page", String(page));
  const s = search.toString();
  return s ? `/notifications?${s}` : "/notifications";
}

async function NotificationsContent({
  searchParams,
}: Pick<PageProps<"/notifications">, "searchParams">) {
  const viewer = await getViewer();
  const params = await searchParams;
  const filter: NotificationFilter = isNotificationFilter(params.filter) ? params.filter : "all";
  const db = getDb();
  const [counts, zone] = await Promise.all([filterCounts(db, viewer.id), getChurchTimeZone(db)]);
  const total = counts[filter];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number.parseInt(typeof params.page === "string" ? params.page : "1", 10);
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(requested) ? requested : 1));
  const from = (page - 1) * PAGE_SIZE;
  const items = await listNotifications(db, viewer.id, {
    filter,
    limit: PAGE_SIZE,
    offset: from,
  });
  const now = new Date();
  // Area chips only for areas the person has heard about, so the row stays short.
  const shownFilters = NOTIFICATION_FILTERS.filter(
    (f) => f === "all" || f === "unread" || f === "action" || counts[f] > 0 || f === filter,
  );

  return (
    <>
      <PageHeader title={n.title} intro={n.intro}>
        {counts.unread > 0 && <MarkAllReadButton />}
      </PageHeader>

      <nav aria-label={n.filtersLabel}>
        <ul className="-mb-1 flex gap-2 overflow-x-auto pb-1">
          {shownFilters.map((f) => (
            <li key={f} className="shrink-0">
              <Link
                href={href(f, 1)}
                aria-current={f === filter ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none",
                  f === filter
                    ? "border-accent bg-accent text-on-accent"
                    : "border-border bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                {n.filters[f]}
                <span className="tabular">{counts[f]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {items.length === 0 ? (
        <div className={cn(cardClass, "py-10 text-center")}>
          <p className="font-medium">{filter === "all" ? n.empty : n.emptyFilter}</p>
          {filter === "all" && <p className="mt-1 text-sm text-fg-muted">{n.emptyHint}</p>}
        </div>
      ) : (
        <div className="space-y-6">
          {groupBySection(items, now, zone).map((g) => (
            <section key={g.section} aria-labelledby={`section-${g.section}`}>
              <h2
                id={`section-${g.section}`}
                className="mb-2 text-sm font-semibold tracking-wide text-fg-muted uppercase"
              >
                {n.sections[g.section]}
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
                {g.items.map((item) => (
                  <NotificationRow key={item.id} item={item} now={now} zone={zone} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {pages > 1 && (
        <nav aria-label={n.pagesLabel} className="flex items-center justify-between gap-2">
          {page > 1 ? (
            <Link href={href(filter, page - 1)} className={buttonClass("secondary")}>
              <ChevronLeft className="size-4" aria-hidden="true" />
              {n.previous}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-fg-muted tabular">
            {n.showing(from + 1, from + items.length, total)}
          </span>
          {page < pages ? (
            <Link href={href(filter, page + 1)} className={buttonClass("secondary")}>
              {n.next}
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
