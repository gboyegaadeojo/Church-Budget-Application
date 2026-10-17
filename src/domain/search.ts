import { and, asc, desc, eq, exists, ilike, isNull, ne, or } from "drizzle-orm";
import { annualCopy } from "@/copy/annual";
import {
  budgetLineItems,
  budgetRequests,
  departments,
  expenseSubmissions,
  users,
} from "@/db/schema";
import { expensesCopy } from "@/copy/expenses";
import { authzContextOf } from "@/domain/expenses/service";
import type { Tx } from "@/db/types";
import { FOOTER_LINKS, navigationFor } from "@/domain/navigation";
import { authorize, type Subject } from "@/lib/authz";
import { hiddenDecisions } from "@/domain/annual/release";

/**
 * Global search (DRD 6.0 "Finding things quickly"): a reference number, a department, a
 * person, an item name or a page, grouped, and only what the person's roles allow. Each
 * budget is checked with the same `annual.view` rule as its page.
 */

export type SearchGroup = "budgets" | "expenses" | "departments" | "people" | "pages";
export type SearchResult = { group: SearchGroup; label: string; detail?: string; href: string };

const PER_GROUP = 6;

export async function globalSearch(
  tx: Tx,
  viewer: Subject,
  query: string,
): Promise<SearchResult[]> {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const results: SearchResult[] = [];
  const reviews = authorize(viewer, "annual.review").allowed;

  // Budgets: by reference, title, department or one of their items.
  const budgets = await tx
    .select({
      id: budgetRequests.id,
      reference: budgetRequests.referenceNumber,
      title: budgetRequests.title,
      status: budgetRequests.status,
      departmentId: budgetRequests.departmentId,
      department: departments.name,
    })
    .from(budgetRequests)
    .innerJoin(departments, eq(departments.id, budgetRequests.departmentId))
    .where(
      or(
        ilike(budgetRequests.referenceNumber, pattern),
        ilike(budgetRequests.title, pattern),
        ilike(departments.name, pattern),
        exists(
          tx
            .select()
            .from(budgetLineItems)
            .where(
              and(
                eq(budgetLineItems.budgetRequestId, budgetRequests.id),
                isNull(budgetLineItems.supersededAt),
                ilike(budgetLineItems.itemName, pattern),
              ),
            ),
        ),
      ),
    )
    .orderBy(desc(budgetRequests.updatedAt))
    .limit(40);
  // A held decision reads In Review to the department until it's released (FR-19a).
  const hidden = await hiddenDecisions(
    tx,
    viewer,
    budgets.map((b) => b.id),
  );
  for (const b of budgets) {
    const ctx = { departmentId: b.departmentId, annualStatus: b.status };
    if (!authorize(viewer, "annual.view", ctx).allowed) continue;
    const status = hidden.has(b.id) ? "in_review" : b.status;
    results.push({
      group: "budgets",
      label: [b.reference, b.title].filter(Boolean).join(" · ") || annualCopy.dashboard.untitled,
      detail: `${b.department} · ${annualCopy.status[status].label}`,
      href: reviews && b.status !== "draft" ? `/annual/review/${b.id}` : `/annual/${b.id}`,
    });
    if (results.length >= PER_GROUP) break;
  }

  // Expenses: by reference, title or department, each checked like its page (Part B).
  const expenses = await tx
    .select()
    .from(expenseSubmissions)
    .where(
      or(
        ilike(expenseSubmissions.referenceNumber, pattern),
        ilike(expenseSubmissions.title, pattern),
        ilike(expenseSubmissions.departmentNameSnapshot, pattern),
      ),
    )
    .orderBy(desc(expenseSubmissions.updatedAt))
    .limit(40);
  const reviewsExpenses = authorize(viewer, "expense.review_queue").allowed;
  let expenseCount = 0;
  for (const e of expenses) {
    if (expenseCount >= PER_GROUP) break;
    if (!authorize(viewer, "expense.view", authzContextOf(e)).allowed) continue;
    const ours = viewer.departments.some((d) => d.id === e.departmentId);
    // A draft stays with its department (and the System Administrator, who reads all).
    if (e.status === "draft" && !ours && !viewer.roles.includes("system_admin")) continue;
    expenseCount++;
    results.push({
      group: "expenses",
      label: [e.referenceNumber, e.title].filter(Boolean).join(" · ") || expensesCopy.mine.untitled,
      detail: `${e.departmentNameSnapshot} · ${expensesCopy.status[e.status].label}`,
      href:
        reviewsExpenses && !ours && e.status !== "draft"
          ? `/expenses/review/${e.id}`
          : `/expenses/${e.id}`,
    });
  }

  // Departments: where each role works with them.
  const admin = viewer.roles.includes("system_admin");
  const mine = new Set(viewer.departments.map((d) => d.id));
  if (admin || reviews || mine.size > 0) {
    const found = await tx
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .where(and(ilike(departments.name, pattern), ne(departments.status, "rejected")))
      .orderBy(asc(departments.name))
      .limit(20);
    results.push(
      ...found
        .filter((d) => admin || reviews || mine.has(d.id))
        .slice(0, PER_GROUP)
        .map((d): SearchResult => ({
          group: "departments",
          label: d.name,
          href: admin
            ? `/admin/departments/${d.id}`
            : reviews
              ? `/annual/review?department=${d.id}`
              : "/annual",
        })),
    );
  }

  // People: the administrator's Users & Roles.
  if (admin) {
    const people = await tx
      .select({ id: users.id, name: users.displayName, email: users.email })
      .from(users)
      .where(or(ilike(users.displayName, pattern), ilike(users.email, pattern)))
      .orderBy(asc(users.displayName))
      .limit(PER_GROUP);
    results.push(
      ...people.map((p): SearchResult => ({
        group: "people",
        label: p.name,
        detail: p.email,
        href: `/admin/users/${p.id}`,
      })),
    );
  }

  // Pages the person's navigation has.
  const lower = q.toLowerCase();
  const pages = [...navigationFor(viewer.roles).flatMap((a) => a.items), ...FOOTER_LINKS];
  const seen = new Set<string>();
  for (const page of pages) {
    if (seen.has(page.href) || !page.label.toLowerCase().includes(lower)) continue;
    seen.add(page.href);
    results.push({ group: "pages", label: page.label, href: page.href });
  }
  return results;
}
