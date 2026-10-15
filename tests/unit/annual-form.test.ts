import { describe, expect, it } from "vitest";
import { centsToInput, formErrors, lineTotalOf, totalsOf } from "@/domain/annual/schema";

/** Helpers the annual form shares between the browser and the server (FR-05 to FR-09). */

describe("lineTotalOf (the line total shown while typing)", () => {
  it("multiplies a whole quantity by the price before tax", () => {
    expect(lineTotalOf("2", "500.00")).toBe(100_000);
    expect(lineTotalOf("1,000", "$1.25")).toBe(125_000);
  });

  it("treats a blank quantity as 1 and a blank price as $0.00, like saving", () => {
    expect(lineTotalOf("", "19.99")).toBe(1_999);
    expect(lineTotalOf("3", "")).toBe(0);
  });

  it("is null until both values are valid (AC-24)", () => {
    expect(lineTotalOf("1.5", "10")).toBeNull();
    expect(lineTotalOf("0", "10")).toBeNull();
    expect(lineTotalOf("10001", "10")).toBeNull();
    expect(lineTotalOf("1", "-20")).toBeNull();
    expect(lineTotalOf("1", "1000000.01")).toBeNull();
    expect(lineTotalOf("1", "abc")).toBeNull();
  });
});

describe("totalsOf", () => {
  it("AC-31 AC-33 charges tax once on the subtotal", () => {
    const line = (quantity: number, unitPriceCents: number) => ({
      name: "x",
      quantity,
      unitPriceCents,
      link: null,
      notes: null,
    });
    expect(totalsOf([line(2, 50_000), line(1, 2_500)], "0.1200")).toEqual({
      subtotal: 102_500,
      tax: 12_300,
      total: 114_800,
    });
  });
});

describe("formErrors", () => {
  const ok = {
    title: "Media 2027",
    justification: "Why",
    lines: [{ name: "Mic", quantity: "1", unitPrice: "10" }],
  };

  it("is empty for a complete request", () => {
    expect(formErrors(ok, true)).toEqual({});
  });

  it("reports format problems keyed like the form", () => {
    expect(
      Object.keys(
        formErrors(
          { ...ok, lines: [{ name: "Mic", quantity: "x", unitPrice: "1", link: "ftp://a" }] },
          false,
        ),
      ).sort(),
    ).toEqual(["lines.0.link", "lines.0.quantity"]);
  });

  it("only checks what submission needs when asked (drafts may be unfinished)", () => {
    const draft = { title: "", justification: "", lines: [] };
    expect(formErrors(draft, false)).toEqual({});
    expect(Object.keys(formErrors(draft, true)).sort()).toEqual([
      "justification",
      "lines",
      "title",
    ]);
  });

  it("needs a note on a $0.00 item", () => {
    expect(formErrors({ ...ok, lines: [{ name: "Gift", unitPrice: "0" }] }, true)).toEqual({
      "lines.0.notes": expect.any(String),
    });
  });
});

describe("centsToInput", () => {
  it("shows cents as the price field's text without floats", () => {
    expect(centsToInput(102_500)).toBe("1025.00");
    expect(centsToInput(5)).toBe("0.05");
    expect(centsToInput(0)).toBe("0.00");
    expect(centsToInput(100_000_000)).toBe("1000000.00");
  });
});
