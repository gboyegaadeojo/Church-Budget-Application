import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAX_RATE,
  formatCAD,
  formatTaxRate,
  lineTotal,
  normalizeTaxRate,
  parseCAD,
  parseTaxRate,
  splitInclusive,
  sumCents,
  taxForward,
  totalForward,
} from "@/lib/money";

const RATE = DEFAULT_TAX_RATE;

/** Deterministic pseudo-random integers so failures are reproducible. */
function* randomInts(count: number, max: number, seed = 42): Generator<number> {
  let state = seed;
  for (let i = 0; i < count; i++) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    yield state % max;
  }
}

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

describe("tax rate", () => {
  it("parses exact decimals into ten-thousandths", () => {
    expect(parseTaxRate("0.1200")).toBe(1200n);
    expect(parseTaxRate("0.12")).toBe(1200n);
    expect(parseTaxRate("0.05")).toBe(500n);
    expect(parseTaxRate("0.1275")).toBe(1275n);
    expect(parseTaxRate("0")).toBe(0n);
    expect(parseTaxRate("1.0000")).toBe(10000n);
  });

  it.each(["", "12", "12%", "0.12345", "-0.12", ".12", "0,12", "1.5", "0.12 ", "1e-1", "abc"])(
    "rejects %j",
    (bad) => {
      expect(() => parseTaxRate(bad)).toThrow();
    },
  );

  it("normalizes to the 4-place stored form", () => {
    expect(normalizeTaxRate("0.12")).toBe("0.1200");
    expect(normalizeTaxRate("0.1")).toBe("0.1000");
    expect(normalizeTaxRate("0")).toBe("0.0000");
  });

  it("formats for people", () => {
    expect(formatTaxRate("0.1200")).toBe("12%");
    expect(formatTaxRate("0.1250")).toBe("12.5%");
    expect(formatTaxRate("0.0705")).toBe("7.05%");
    expect(formatTaxRate("0")).toBe("0%");
  });
});

describe("lineTotal", () => {
  it("multiplies quantity by unit price in cents", () => {
    expect(lineTotal(1, 102500)).toBe(102500);
    expect(lineTotal(3, 1999)).toBe(5997);
    expect(lineTotal(10, 0)).toBe(0);
  });

  it("handles the largest permitted line exactly", () => {
    expect(lineTotal(10_000, 100_000_000)).toBe(1_000_000_000_000);
  });

  it("rejects zero, negative, fractional and unsafe quantities", () => {
    for (const q of [0, -1, 1.5, Number.NaN, 2 ** 53]) {
      expect(() => lineTotal(q, 100)).toThrow(RangeError);
    }
  });

  it("rejects negative or fractional prices", () => {
    expect(() => lineTotal(1, -1)).toThrow(RangeError);
    expect(() => lineTotal(1, 10.5)).toThrow(TypeError);
  });

  it("rejects a result too large to hold exactly", () => {
    expect(() => lineTotal(2 ** 30, 2 ** 30)).toThrow(RangeError);
  });
});

describe("sumCents", () => {
  it("adds exactly", () => {
    expect(sumCents([])).toBe(0);
    expect(sumCents([10, 20])).toBe(30);
    expect(sumCents([100, -40])).toBe(60);
  });

  it("refuses to overflow", () => {
    expect(() => sumCents([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
  });
});

describe("taxForward and totalForward (FR-07, FR-07a)", () => {
  it.each([
    // [subtotal, tax, total] — CLAUDE.md required values and AC-30 to AC-32
    [3_000_000, 360_000, 3_360_000],
    [102_500, 12_300, 114_800],
    [1_004, 120, 1_124],
    [1_029, 123, 1_152],
    [1_046, 126, 1_172],
    [0, 0, 0],
  ])("subtotal %i → tax %i → total %i", (subtotal, tax, total) => {
    expect(taxForward(subtotal, RATE)).toBe(tax);
    expect(totalForward(subtotal, RATE)).toEqual({ subtotal, tax, total });
  });

  it("rounds an exact half cent up", () => {
    // 0.1250 × 4 cents = 0.5 cent → 1 cent; 0.1250 × 12 = 1.5 → 2.
    expect(taxForward(4, "0.1250")).toBe(1);
    expect(taxForward(12, "0.1250")).toBe(2);
    // Just under a half rounds down: 0.1200 × 4 = 0.48 → 0.
    expect(taxForward(4, RATE)).toBe(0);
  });

  it("mirrors negative amounts (half away from zero)", () => {
    expect(taxForward(-4, "0.1250")).toBe(-1);
    expect(taxForward(-1_004, RATE)).toBe(-120);
  });

  it("taxes once on the subtotal, not per line (AC-33)", () => {
    const lines = [lineTotal(1, 1_004), lineTotal(1, 1_004), lineTotal(1, 1_004)];
    const perLine = sumCents(lines.map((l) => taxForward(l, RATE))); // 3 × 120
    expect(perLine).toBe(360);
    expect(taxForward(sumCents(lines), RATE)).toBe(361); // 3,012 × 0.12 = 361.44
  });

  it("uses the snapshotted rate it is given (AC-34)", () => {
    expect(taxForward(100_000, "0.1200")).toBe(12_000);
    expect(taxForward(100_000, "0.0500")).toBe(5_000);
  });

  it("is within half a cent of the exact tax for many amounts", () => {
    for (const subtotal of randomInts(5_000, 1_000_000_000)) {
      const tax = taxForward(subtotal, RATE);
      const exactTimes10000 = BigInt(subtotal) * 1200n;
      const diff = BigInt(tax) * 10000n - exactTimes10000;
      expect(diff >= -5000n && diff < 5000n).toBe(true);
    }
  });
});

describe("splitInclusive (FR-16 approve a different amount)", () => {
  it.each([
    // [total, subtotal, tax] — CLAUDE.md required values and AC-35
    [3_000_000, 2_678_571, 321_429],
    [50_000, 44_643, 5_357],
    [3_360_000, 3_000_000, 360_000],
    [114_800, 102_500, 12_300],
    [0, 0, 0],
    [1, 1, 0],
  ])("total %i → subtotal %i + tax %i", (total, subtotal, tax) => {
    expect(splitInclusive(total, RATE)).toEqual({ subtotal, tax, total });
  });

  it("keeps the total exactly as entered, for many amounts", () => {
    for (const total of randomInts(5_000, 1_000_000_000, 7)) {
      const split = splitInclusive(total, RATE);
      expect(split.total).toBe(total);
      expect(split.subtotal + split.tax).toBe(total);
      expect(split.tax).toBeGreaterThanOrEqual(0);
    }
  });

  it("round-trips any total produced by totalForward", () => {
    for (const subtotal of randomInts(5_000, 1_000_000_000, 99)) {
      const forward = totalForward(subtotal, RATE);
      expect(splitInclusive(forward.total, RATE)).toEqual(forward);
    }
  });

  it("mirrors negative totals (amendments that reduce a budget)", () => {
    expect(splitInclusive(-50_000, RATE)).toEqual({
      subtotal: -44_643,
      tax: -5_357,
      total: -50_000,
    });
  });

  it("works with a zero rate", () => {
    expect(splitInclusive(12_345, "0")).toEqual({ subtotal: 12_345, tax: 0, total: 12_345 });
  });
});

describe("parseCAD", () => {
  it.each([
    ["0", 0],
    ["1025", 102_500],
    ["1,025", 102_500],
    ["1,025.5", 102_550],
    ["$1,025.50", 102_550],
    ["$ 30,000.00", 3_000_000],
    [".5", 50],
    ["10.04", 1_004],
    ["  12.00 ", 1_200],
  ])("parses %j as %i cents", (input, cents) => {
    expect(parseCAD(input)).toBe(cents);
  });

  it.each(["", "$", ".", "1.005", "-5", "1,00", "12,34.00", "1e3", "abc", "1.2.3", "１２"])(
    "rejects %j",
    (input) => {
      expect(parseCAD(input)).toBeNull();
    },
  );

  it("rejects amounts too large to hold exactly", () => {
    expect(parseCAD("999999999999999999")).toBeNull();
  });
});
