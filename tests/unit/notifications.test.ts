import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sectionFor, whenLabel } from "@/components/notifications/format";
import { appPath, classify } from "@/domain/notifications/in-app";

/** Every fixed email template name written in src/domain ("template: \"…\""). */
function templatesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return templatesIn(full);
    if (!name.endsWith(".ts")) return [];
    const text = readFileSync(full, "utf8");
    return [...text.matchAll(/template: (?:[^"`\n]*\? )?"([a-z_.]+)"/g)].map((m) => m[1]);
  });
}

/** Templates built at run time, spelled out. */
const DYNAMIC = [
  "expenses.approved_one.accountant",
  "expenses.approved_one.board",
  "expenses.verbal_recorded.accountant",
  "expenses.verbal_recorded.board",
  "expenses.message.department",
  "expenses.message.accountant",
  "annual.message.department",
  "annual.message.accountant",
  "cycle.opened",
  "cycle.closed",
  "cycle.reopened",
  "spending.alert.over_budget",
  "spending.entry_recorded",
  "spending.entry_corrected",
  "spending.entry_voided",
  "spending.alert.near_limit",
];

describe("in-app notifications: every email has a place on the bell", () => {
  const templates = [...new Set([...templatesIn("src/domain"), ...DYNAMIC])];

  it("finds the templates", () => {
    expect(templates.length).toBeGreaterThan(60);
  });

  it("files each one under an area, except system emails", () => {
    const missing = templates.filter((t) => !t.startsWith("system.") && classify(t) === null);
    expect(missing).toEqual([]);
    expect(classify("system.test_email")).toBeNull();
    expect(classify("system.failure_digest")).toBeNull();
  });

  it("marks requests for action", () => {
    expect(classify("expenses.board_needed")).toEqual({ area: "expenses", actionNeeded: true });
    expect(classify("annual.second_needed")?.actionNeeded).toBe(true);
    expect(classify("expenses.reminder.payment")?.actionNeeded).toBe(true);
    expect(classify("annual.message.department")?.actionNeeded).toBe(true);
    expect(classify("expenses.paid")).toEqual({ area: "expenses", actionNeeded: false });
    expect(classify("cycle.deadline_changed")).toEqual({ area: "cycles", actionNeeded: false });
    expect(classify("department.assigned")).toEqual({ area: "people", actionNeeded: false });
  });
});

describe("appPath keeps links inside the app", () => {
  const base = "https://budget.example.org";
  it("strips the origin", () => {
    expect(appPath("https://budget.example.org/expenses/abc/edit", base)).toBe(
      "/expenses/abc/edit",
    );
    expect(appPath("/annual/review#top", base)).toBe("/annual/review#top");
  });
  it("refuses another site", () => {
    expect(appPath("https://evil.example.com/x", base)).toBe("/");
    expect(appPath("javascript:alert(1)", base)).toBe("/");
  });
});

describe("notification times and sections (America/Winnipeg)", () => {
  const zone = "America/Winnipeg";
  const now = new Date("2026-10-19T18:00:00Z"); // 1 p.m. in Winnipeg
  it("says how long ago", () => {
    expect(whenLabel(new Date("2026-10-19T17:59:40Z"), now, zone)).toBe("Just now");
    expect(whenLabel(new Date("2026-10-19T17:55:00Z"), now, zone)).toBe("5 minutes ago");
    expect(whenLabel(new Date("2026-10-19T15:00:00Z"), now, zone)).toBe("3 hours ago");
    expect(whenLabel(new Date("2026-10-17T15:00:00Z"), now, zone)).toMatch(/Oct 17, 2026/);
  });
  it("groups by the church's calendar day", () => {
    expect(sectionFor(new Date("2026-10-19T06:00:00Z"), now, zone)).toBe("today");
    // 11 p.m. on the 18th in Winnipeg, though already the 19th in UTC.
    expect(sectionFor(new Date("2026-10-19T04:00:00Z"), now, zone)).toBe("yesterday");
    expect(sectionFor(new Date("2026-10-15T18:00:00Z"), now, zone)).toBe("week");
    expect(sectionFor(new Date("2026-10-01T18:00:00Z"), now, zone)).toBe("earlier");
  });
});
