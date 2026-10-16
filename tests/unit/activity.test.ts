import { describe, expect, it } from "vitest";
import { ACTIVITY_EVENTS, activityGroup, activityLabel, eventTypesIn } from "@/copy/activity";
import { detailRows, detailText, fieldLabel } from "@/domain/analytics/details";
import { breadcrumbsFor } from "@/domain/navigation";

describe("activity event names (FR-22, AC-125)", () => {
  it("names known events in plain language", () => {
    expect(activityLabel("annual.approved")).toBe("Approved the budget");
    expect(activityLabel("access.denied")).toBe("Tried a page or action their roles don't allow");
  });

  it("still shows an event it doesn't know, worded from its type", () => {
    expect(activityLabel("admin.something_new")).toBe("Something new");
    expect(activityGroup("admin.something_new")).toBeNull();
  });

  it("puts every listed event in a group", () => {
    for (const [type, entry] of Object.entries(ACTIVITY_EVENTS)) {
      expect(eventTypesIn(entry.group), type).toContain(type);
    }
  });
});

describe("event details as rows", () => {
  it("shows before and after, and marks what changed", () => {
    const rows = detailRows({
      before: { taxRate: "0.1200", note: "x" },
      after: { taxRate: "0.1300", note: "x" },
      reason: "Province changed it",
    });
    expect(rows).toEqual([
      { field: "Tax rate", before: "0.1200", after: "0.1300", changed: true },
      { field: "Note", before: "x", after: "x", changed: false },
      { field: "Reason", value: "Province changed it", changed: false },
    ]);
  });

  it("writes lists, flags and nested values plainly", () => {
    expect(detailText({ roles: ["accountant", "requester"], active: false, empty: null })).toBe(
      "Roles: accountant, requester; Active: No; Empty: —",
    );
    expect(fieldLabel("pcoPersonId")).toBe("Pco person id");
    expect(detailRows(null)).toEqual([]);
  });
});

describe("breadcrumbs (DRD 6.0)", () => {
  const ID = "0b8f6a2e-6a0e-4c8e-9a52-1f1f6b0c2a11";

  it("shows the area and the dashboard above a budget under review", () => {
    expect(breadcrumbsFor(`/annual/review/${ID}`)).toEqual([
      { label: "Annual Budget" },
      { label: "Review dashboard", href: "/annual/review" },
    ]);
  });

  it("includes the request between the department's budget and its edit page", () => {
    expect(breadcrumbsFor(`/annual/${ID}/edit`)).toEqual([
      { label: "Annual Budget" },
      { label: "My department's budget", href: "/annual" },
      { label: "Details", href: `/annual/${ID}` },
    ]);
  });

  it("shows nothing on Home or on a navigation page", () => {
    expect(breadcrumbsFor("/")).toEqual([]);
    expect(breadcrumbsFor("/annual/review")).toEqual([]);
    expect(breadcrumbsFor("/admin/users")).toEqual([]);
  });

  it("puts a person's page under Users & Roles", () => {
    expect(breadcrumbsFor(`/admin/users/${ID}`)).toEqual([
      { label: "Admin" },
      { label: "Users & Roles", href: "/admin/users" },
    ]);
  });
});
