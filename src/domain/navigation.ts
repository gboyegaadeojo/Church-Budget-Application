import { copy } from "@/copy/en-CA";
import type { Role } from "@/lib/roles";

/**
 * Navigation grouped by area, not by role (DRD 6.0, FR-37). Each item lists the
 * roles that can act there and, separately, the roles that can only look.
 * Hiding a link is not security: every route still checks permissions on the server.
 */
export type AreaId = "home" | "annual" | "expenses" | "spending" | "reports" | "admin";

export type NavItemDef = {
  href: string;
  label: string;
  /** Roles that can use this page. */
  act: readonly Role[];
  /** Roles that can open it read-only (System Administrator, Requirements 3.5). */
  view?: readonly Role[];
};

export type AreaDef = {
  id: AreaId;
  label: string;
  items: readonly NavItemDef[];
};

const n = copy.nav;
const ACCOUNTANTS: readonly Role[] = ["accountant", "backup_approver"];
const BOARD: readonly Role[] = ["board_chair", "vice_chair"];

export const AREAS: readonly AreaDef[] = [
  {
    id: "home",
    label: copy.areas.home,
    items: [
      {
        href: "/",
        label: n.myTasks,
        act: [
          "requester",
          "accountant",
          "backup_approver",
          "board_chair",
          "vice_chair",
          "church_admin",
          "system_admin",
        ],
      },
    ],
  },
  {
    id: "annual",
    label: copy.areas.annual,
    items: [
      { href: "/annual", label: n.myDepartmentBudget, act: ["requester"] },
      { href: "/annual/review", label: n.reviewDashboard, act: ACCOUNTANTS },
      { href: "/annual/departments", label: n.departments, act: ACCOUNTANTS },
      { href: "/annual/release", label: n.decisionRelease, act: ["accountant"] },
      { href: "/annual/all", label: n.allBudgets, act: [], view: ["system_admin"] },
    ],
  },
  {
    id: "expenses",
    label: copy.areas.expenses,
    items: [
      { href: "/expenses/new", label: n.newExpense, act: ["requester"] },
      { href: "/expenses/mine", label: n.myExpenses, act: ["requester"] },
      { href: "/expenses/review", label: n.reviewQueue, act: ACCOUNTANTS },
      { href: "/expenses/awaiting-approval", label: n.awaitingMyApproval, act: BOARD },
      { href: "/expenses/ready", label: n.readyToProcess, act: ["church_admin", "accountant"] },
      { href: "/expenses/all", label: n.allExpenses, act: [], view: ["system_admin"] },
    ],
  },
  {
    id: "spending",
    label: copy.areas.spending,
    items: [
      { href: "/spending/my-department", label: n.myDepartmentBudget, act: ["requester"] },
      { href: "/spending", label: n.spendingDashboard, act: ["church_admin", "accountant"] },
      { href: "/spending/record", label: n.recordSpending, act: ["church_admin", "accountant"] },
      { href: "/spending/ledger", label: n.ledger, act: ["church_admin", "accountant"] },
      {
        href: "/spending/budget-vs-actual",
        label: n.budgetVsActual,
        act: [],
        view: ["board_chair", "vice_chair", "system_admin"],
      },
    ],
  },
  {
    id: "reports",
    label: copy.areas.reports,
    items: [
      {
        href: "/reports",
        label: n.exports,
        act: ["accountant", "backup_approver", "church_admin", "system_admin"],
      },
      {
        // FR-52, DRD 6.13: everyone sees it, scoped by role on the server; the board reads only.
        href: "/reports/analytics",
        label: n.analyticsAndAudit,
        act: ["requester", "accountant", "backup_approver", "church_admin", "system_admin"],
        view: BOARD,
      },
    ],
  },
  {
    id: "admin",
    label: copy.areas.admin,
    items: [
      { href: "/admin/users", label: n.usersAndRoles, act: ["system_admin"] },
      { href: "/admin/departments", label: n.departments, act: ["system_admin"] },
      { href: "/admin/cycles", label: n.budgetCycles, act: ["system_admin"] },
      { href: "/admin/settings", label: n.settings, act: ["system_admin"] },
      { href: "/admin/audit", label: n.notificationsAndAudit, act: ["system_admin"] },
    ],
  },
];

/** Pages linked from the footer, open to everyone signed in. */
export const FOOTER_LINKS = [
  { href: "/help", label: n.help },
  { href: "/privacy", label: n.privacy },
] as const;

export type NavItem = { href: string; label: string; viewOnly: boolean };
export type NavArea = { id: AreaId; label: string; href: string; items: NavItem[] };

/**
 * The navigation one person sees: the union of their roles' items, grouped by
 * area. Areas with nothing to show are left out. An item is "view only" when
 * none of the person's roles can act on it.
 */
export function navigationFor(roles: readonly Role[]): NavArea[] {
  const has = (list: readonly Role[] | undefined) => !!list?.some((r) => roles.includes(r));

  return AREAS.flatMap((area) => {
    const items = area.items
      .filter((item) => has(item.act) || has(item.view))
      .map((item) => ({ href: item.href, label: item.label, viewOnly: !has(item.act) }));
    if (items.length === 0) return [];
    return [{ id: area.id, label: area.label, href: items[0].href, items }];
  });
}

/** Every page the navigation can link to, for routes that are not built yet. */
export function allNavHrefs(): string[] {
  const hrefs = AREAS.flatMap((a) => a.items.map((i) => i.href)).concat(
    FOOTER_LINKS.map((l) => l.href),
  );
  return [...new Set(hrefs)];
}

/** The link label for a known page, or undefined if the navigation has no such page. */
export function labelForHref(href: string): string | undefined {
  const all = [...AREAS.flatMap((a) => a.items), ...FOOTER_LINKS];
  return all.find((item) => item.href === href)?.label;
}

/** Whether a link is the current page. Links match exactly so "/spending" is not active on "/spending/ledger". */
export function isActiveHref(pathname: string, href: string): boolean {
  return pathname === href;
}

/** The area a path belongs to, for highlighting the active link. */
export function areaForPath(pathname: string): AreaId {
  if (pathname === "/") return "home";
  const first = pathname.split("/")[1];
  const match = AREAS.find((a) => a.id === first);
  return match ? match.id : "home";
}
