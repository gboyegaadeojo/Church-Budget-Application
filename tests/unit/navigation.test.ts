import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  allNavHrefs,
  areaForPath,
  isActiveHref,
  labelForHref,
  navigationFor,
  type NavArea,
} from "@/domain/navigation";
import { roleChips } from "@/domain/users/role-chips";
import { ROLES, type Role } from "@/lib/roles";

const APP_DIR = path.resolve(__dirname, "../../src/app/(app)");

const hrefs = (areas: NavArea[]) => areas.flatMap((a) => a.items.map((i) => i.href));
const item = (areas: NavArea[], href: string) =>
  areas.flatMap((a) => a.items).find((i) => i.href === href);

/** Money actions an administrator must never be offered without the matching role (CLAUDE.md 4). */
const MONEY_ACTION_PAGES = [
  "/annual/review",
  "/annual/release",
  "/expenses/review",
  "/expenses/awaiting-approval",
  "/expenses/ready",
  "/spending/record",
  "/spending/ledger",
];

describe("navigationFor", () => {
  it("shows everyone Home with My tasks", () => {
    for (const role of ROLES) {
      const nav = navigationFor([role]);
      expect(nav[0]).toMatchObject({ id: "home", href: "/" });
      expect(item(nav, "/")).toMatchObject({ viewOnly: false });
    }
  });

  it("shows nothing for a person with no roles", () => {
    expect(navigationFor([])).toEqual([]);
  });

  it("gives a requester only requester pages", () => {
    const nav = navigationFor(["requester"]);
    expect(hrefs(nav)).toEqual([
      "/",
      "/annual",
      "/expenses/new",
      "/expenses/mine",
      "/spending/my-department",
      "/reports/analytics",
    ]);
    expect(nav.map((a) => a.id)).not.toContain("admin");
  });

  it("gives every role Analytics & Audit, read-only for the board (FR-52)", () => {
    for (const role of ROLES) {
      expect(item(navigationFor([role]), "/reports/analytics")).toBeDefined();
    }
    expect(item(navigationFor(["board_chair"]), "/reports/analytics")).toMatchObject({
      viewOnly: true,
    });
    expect(item(navigationFor(["accountant"]), "/reports/analytics")).toMatchObject({
      viewOnly: false,
    });
  });

  it("is the union of the roles for a multi-role user, with one entry per page (AC-108)", () => {
    const combined: Role[] = ["accountant", "requester"];
    const nav = navigationFor(combined);
    const all = hrefs(nav);

    for (const role of combined) {
      for (const href of hrefs(navigationFor([role]))) expect(all).toContain(href);
    }
    expect(new Set(all).size).toBe(all.length);
    // One area list, not one per role.
    expect(new Set(nav.map((a) => a.id)).size).toBe(nav.length);
    expect(all).toEqual(expect.arrayContaining(["/annual", "/annual/review", "/expenses/new"]));
  });

  it("keeps area order stable whatever order the roles come in", () => {
    const a = navigationFor(["requester", "church_admin", "board_chair"]);
    const b = navigationFor(["board_chair", "requester", "church_admin"]);
    expect(a).toEqual(b);
  });

  it("links each area to its first visible page", () => {
    const nav = navigationFor(["church_admin"]);
    const spending = nav.find((a) => a.id === "spending");
    expect(spending?.href).toBe("/spending");
    expect(nav.find((a) => a.id === "annual")).toBeUndefined();
  });

  describe("System Administrator", () => {
    const nav = navigationFor(["system_admin"]);

    it("sees the read-only overviews marked view only", () => {
      for (const href of ["/annual/all", "/expenses/all", "/spending/budget-vs-actual"]) {
        expect(item(nav, href)).toMatchObject({ viewOnly: true });
      }
    });

    it("can act in Admin and Reports", () => {
      for (const href of ["/admin/users", "/admin/departments", "/admin/settings", "/reports"]) {
        expect(item(nav, href)).toMatchObject({ viewOnly: false });
      }
    });

    it("is not offered any money action", () => {
      for (const href of MONEY_ACTION_PAGES) expect(item(nav, href)).toBeUndefined();
    });

    it("gains a money action only with the matching role", () => {
      const withAccountant = navigationFor(["system_admin", "accountant"]);
      expect(item(withAccountant, "/annual/review")).toMatchObject({ viewOnly: false });
      expect(item(withAccountant, "/expenses/awaiting-approval")).toBeUndefined();
    });
  });

  it("gives the Vice-Chair the same pages as the Board Chair", () => {
    expect(navigationFor(["vice_chair"])).toEqual(navigationFor(["board_chair"]));
    expect(item(navigationFor(["vice_chair"]), "/expenses/awaiting-approval")).toMatchObject({
      viewOnly: false,
    });
  });

  it("keeps Budget vs actual view only for the board, even combined with other roles", () => {
    const nav = navigationFor(["board_chair", "system_admin"]);
    expect(item(nav, "/spending/budget-vs-actual")).toMatchObject({ viewOnly: true });
  });

  it("drops the view-only mark when another role can act on the page", () => {
    const nav = navigationFor(["system_admin", "church_admin"]);
    expect(item(nav, "/reports")).toMatchObject({ viewOnly: false });
  });
});

describe("helpers", () => {
  it("lists each linked page once", () => {
    const list = allNavHrefs();
    expect(new Set(list).size).toBe(list.length);
    expect(list).toEqual(expect.arrayContaining(["/", "/help", "/privacy", "/admin/audit"]));
  });

  it("has a page for every link, so no navigation link is a 404", () => {
    for (const href of allNavHrefs()) {
      const file = path.join(APP_DIR, ...href.split("/").filter(Boolean), "page.tsx");
      expect(existsSync(file), `${href} has no page at ${file}`).toBe(true);
    }
  });

  it("finds labels for known pages only", () => {
    expect(labelForHref("/expenses/ready")).toBe("Ready to process");
    expect(labelForHref("/help")).toBe("Help");
    expect(labelForHref("/nowhere")).toBeUndefined();
  });

  it("matches the active link exactly", () => {
    expect(isActiveHref("/spending", "/spending")).toBe(true);
    expect(isActiveHref("/spending/ledger", "/spending")).toBe(false);
    expect(isActiveHref("/annual", "/")).toBe(false);
  });

  it("maps a path to its area", () => {
    expect(areaForPath("/")).toBe("home");
    expect(areaForPath("/expenses/new")).toBe("expenses");
    expect(areaForPath("/admin")).toBe("admin");
    expect(areaForPath("/help")).toBe("home");
  });
});

describe("roleChips", () => {
  it("labels each role, and the requester role with each department", () => {
    expect(
      roleChips({
        roles: ["accountant", "requester"],
        departments: [
          { id: "media", name: "Media", representativeType: "primary" },
          { id: "youth", name: "Youth", representativeType: "backup" },
        ],
      }),
    ).toEqual(["Accountant", "Requester: Media", "Requester: Youth"]);
  });

  it("shows three department chips at most, then a count, so the menu stays short", () => {
    const departments = ["A", "B", "C", "D", "E"].map((name) => ({
      id: name,
      name,
      representativeType: "representative" as const,
    }));
    expect(roleChips({ roles: ["requester"], departments })).toEqual([
      "Requester: A",
      "Requester: B",
      "Requester: C",
      "+2 more departments",
    ]);
  });

  it("shows a plain Requester chip when no department is assigned yet", () => {
    expect(roleChips({ roles: ["requester"], departments: [] })).toEqual(["Requester"]);
  });
});
