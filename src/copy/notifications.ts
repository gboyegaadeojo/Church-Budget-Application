import type { NotificationArea, NotificationFilter } from "@/domain/notifications/in-app";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The bell and the Notifications page (docs/decisions.md 2026-10-19). */
export const notificationsCopy = {
  title: "Notifications",
  intro: "Everything the app has emailed you, in one place.",
  bell: (unread: number) => (unread === 0 ? "Notifications" : `Notifications, ${unread} unread`),
  markAllRead: "Mark all as read",
  allRead: "All marked as read.",
  seeAll: "See all notifications",
  needsAction: "Needs action",
  unreadDot: "Unread",
  empty: "You're all caught up.",
  emptyHint: "When something happens to your budgets or expenses, it shows here and in your email.",
  emptyFilter: "Nothing here.",
  loading: "Loading notifications…",
  panelTabs: { all: "All", action: "Needs action" },
  filtersLabel: "Show",
  filters: {
    all: "All",
    unread: "Unread",
    action: "Needs action",
    annual: "Annual Budget",
    expenses: "Expenses",
    spending: "Spending",
    cycles: "Budget years",
    people: "Departments & people",
  } satisfies Record<NotificationFilter, string>,
  areas: {
    annual: "Annual Budget",
    expenses: "Expenses",
    spending: "Spending",
    cycles: "Budget year",
    people: "Departments & people",
  } satisfies Record<NotificationArea, string>,
  sections: {
    today: "Today",
    yesterday: "Yesterday",
    week: "This week",
    earlier: "Earlier",
  },
  previous: "Previous",
  next: "Next",
  pagesLabel: "Pages",
  showing: (from: number, to: number, total: number) => `${from}–${to} of ${total}`,
  close: "Close",
  justNow: "Just now",
  minutesAgo: (n: number) => `${n} ${plural(n, "minute", "minutes")} ago`,
  hoursAgo: (n: number) => `${n} ${plural(n, "hour", "hours")} ago`,
} as const;
