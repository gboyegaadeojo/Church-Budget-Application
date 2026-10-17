import { describe, expect, it } from "vitest";
import {
  amountBounds,
  filterStatus,
  filterType,
  hasListFilters,
  parseListFilters,
} from "@/domain/expenses/list-filters";

describe("expense list filters (FR-48)", () => {
  it("keeps the known keys as trimmed strings and drops blanks and arrays", () => {
    expect(
      parseListFilters({
        q: "  tripod ",
        min: "",
        max: "1,000",
        status: ["a", "b"],
        unknown: "x",
        from: "2026-01-01",
      }),
    ).toEqual({ q: "tripod", max: "1,000", from: "2026-01-01" });
    expect(hasListFilters({})).toBe(false);
    expect(hasListFilters({ to: "2026-12-31" })).toBe(true);
  });

  it("caps what's typed at 100 characters", () => {
    expect(parseListFilters({ q: "x".repeat(300) }).q).toHaveLength(100);
  });

  it("reads amounts as cents without floats, and ignores anything that isn't one", () => {
    expect(amountBounds({ min: "$1,025.50", max: "10.04" })).toEqual({ min: 102_550, max: 1_004 });
    expect(amountBounds({ min: "abc", max: "-5" })).toEqual({ min: null, max: null });
    expect(amountBounds({})).toEqual({ min: null, max: null });
  });

  it("accepts only real types and statuses", () => {
    expect(filterType("expense_claim")).toBe("expense_claim");
    expect(filterType("refund")).toBeNull();
    expect(filterStatus("awaiting_board")).toBe("awaiting_board");
    expect(filterStatus("'; drop table")).toBeNull();
  });
});
