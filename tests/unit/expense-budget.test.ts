import { describe, expect, it } from "vitest";
import { budgetStatus, figuresFrom, impactOf } from "@/domain/expenses/budget";

const budget = (parts: { available: number; committed?: number; spent?: number }) =>
  figuresFrom({
    annualRequestId: "r1",
    available: parts.available,
    committed: parts.committed ?? 0,
    pending: 0,
    spent: parts.spent ?? 0,
  });

describe("budget figures (FR-25, FR-42)", () => {
  it("Remaining = Available − Committed − Spent", () => {
    expect(budget({ available: 3_000_000, committed: 100_800, spent: 420_000 }).remaining).toBe(
      2_479_200,
    );
  });

  it("AC-66: approving a $1,008.00 purchase request reduces Remaining by $1,008.00", () => {
    const before = budget({ available: 3_000_000 });
    const after = budget({ available: 3_000_000, committed: 100_800 });
    expect(before.remaining - after.remaining).toBe(100_800);
  });

  it("AC-67: a $985.60 claim releases the $1,008.00 commitment", () => {
    const committed = budget({ available: 3_000_000, committed: 100_800 });
    const impact = impactOf(committed, 98_560, 100_800);
    expect(impact.after).toBe(3_000_000 - 98_560);
    expect(impact.overBy).toBe(0);
  });
});

describe("over budget (FR-43)", () => {
  it("reports how far below zero a submission takes Remaining", () => {
    expect(impactOf(budget({ available: 100_000, spent: 90_000 }), 25_000)).toEqual({
      before: 10_000,
      after: -15_000,
      overBy: 15_000,
    });
  });

  it("counts the whole amount when the department was already over", () => {
    expect(impactOf(budget({ available: 100_000, spent: 110_000 }), 5_000)).toEqual({
      before: -10_000,
      after: -15_000,
      overBy: 15_000,
    });
  });

  it("is not over at exactly zero", () => {
    expect(impactOf(budget({ available: 100_000 }), 100_000).overBy).toBe(0);
  });
});

describe("spending status (FR-25)", () => {
  it("is No approved budget without an approved request", () => {
    expect(
      budgetStatus(
        figuresFrom({ annualRequestId: null, available: 0, committed: 0, pending: 0, spent: 0 }),
        "0.80",
      ),
    ).toBe("no_budget");
  });

  it("is Nearing limit at the threshold, counting Committed", () => {
    expect(
      budgetStatus(budget({ available: 100_000, committed: 40_000, spent: 39_999 }), "0.80"),
    ).toBe("on_track");
    expect(
      budgetStatus(budget({ available: 100_000, committed: 40_000, spent: 40_000 }), "0.80"),
    ).toBe("nearing_limit");
  });

  it("is Over budget only when Committed + Spent exceed Available (AC-139)", () => {
    expect(budgetStatus(budget({ available: 100_000, spent: 100_000 }), "0.80")).toBe(
      "nearing_limit",
    );
    expect(budgetStatus(budget({ available: 100_000, spent: 100_001 }), "0.80")).toBe(
      "over_budget",
    );
  });
});
