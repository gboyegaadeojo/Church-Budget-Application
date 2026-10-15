import { describe, expect, it } from "vitest";
import { formatCAD } from "@/lib/money";

describe("formatCAD", () => {
  it.each([
    [0, "$0.00"],
    [5, "$0.05"],
    [99, "$0.99"],
    [100, "$1.00"],
    [1004, "$10.04"],
    [120, "$1.20"],
    [102500, "$1,025.00"],
    [114800, "$1,148.00"],
    [3000000, "$30,000.00"],
    [3360000, "$33,600.00"],
    [2678571, "$26,785.71"],
    [321429, "$3,214.29"],
    [44643, "$446.43"],
    [100000000, "$1,000,000.00"],
  ])("formats %i cents as %s", (cents, expected) => {
    expect(formatCAD(cents)).toBe(expected);
  });

  it("formats the largest safe amount without float rounding", () => {
    expect(formatCAD(Number.MAX_SAFE_INTEGER)).toBe("$90,071,992,547,409.91");
  });

  it("uses a true minus sign for negative amounts (DRD 3.7)", () => {
    expect(formatCAD(-50000)).toBe("−$500.00");
    expect(formatCAD(-1)).toBe("−$0.01");
  });

  it("rejects anything that is not a whole number of cents", () => {
    for (const bad of [1.5, 0.1 + 0.2, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(() => formatCAD(bad)).toThrow(TypeError);
    }
  });
});
