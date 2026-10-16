import { describe, expect, it } from "vitest";
import {
  approvedFigures,
  approvedLineTotal,
  decisionSchema,
  type Decision,
  type RequestedLine,
} from "@/domain/annual/decision";

const RATE = "0.1200";
const MIC = "00000000-0000-4000-8000-000000000001";
const STAND = "00000000-0000-4000-8000-000000000002";

/** 40 × $1,000.00 and 1 × $25.00: subtotal $40,025.00. */
const LINES: RequestedLine[] = [
  { id: MIC, quantity: 40, unitPriceCents: 100_000 },
  { id: STAND, quantity: 1, unitPriceCents: 2_500 },
];

type Approval = Extract<Decision, { kind: `approve_${string}` }>;
const parse = (input: unknown) => decisionSchema.parse(input) as Approval;

describe("decisionSchema", () => {
  it("parses a typed approved total into cents", () => {
    expect(
      parse({ kind: "approve_different_amount", approvedTotal: "$30,000.00", note: " Board " }),
    ).toEqual({
      kind: "approve_different_amount",
      approvedTotal: 3_000_000,
      note: "Board",
      boardReference: null,
    });
  });

  it.each([
    ["0", "more than $0.00"],
    ["-5", "approved total including tax"],
    ["12.345", "approved total including tax"],
    ["100,000,000.01", "$100,000,000.00 or less"],
  ])("refuses an approved total of %s", (approvedTotal, message) => {
    const result = decisionSchema.safeParse({
      kind: "approve_different_amount",
      approvedTotal,
      note: "x",
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toContain(message);
  });

  it("requires a note to approve a different amount, return or decline", () => {
    for (const kind of ["approve_different_amount", "return", "decline"]) {
      const result = decisionSchema.safeParse({ kind, approvedTotal: "10", note: "   " });
      expect(result.success, kind).toBe(false);
    }
    expect(decisionSchema.safeParse({ kind: "approve_as_requested" }).success).toBe(true);
  });

  it("refuses approved quantities and prices out of range", () => {
    const result = decisionSchema.safeParse({
      kind: "approve_line_changes",
      note: "x",
      lines: [{ lineId: MIC, quantity: "1.5", unitPrice: "-1" }],
    });
    expect(result.error!.issues.map((i) => i.path.join("."))).toEqual([
      "lines.0.quantity",
      "lines.0.unitPrice",
    ]);
  });
});

describe("approvedFigures (FR-16)", () => {
  it("as requested: tax forward on the requested subtotal", () => {
    const figures = approvedFigures(LINES, RATE, parse({ kind: "approve_as_requested" }));
    expect(figures).toMatchObject({
      totals: { subtotal: 4_002_500, tax: 480_300, total: 4_482_800 },
      adjustmentCents: 0,
    });
  });

  it("AC-35 a different amount: $30,000.00 → $26,785.71 + $3,214.29, gap as the adjustment", () => {
    const figures = approvedFigures(
      LINES,
      RATE,
      parse({ kind: "approve_different_amount", approvedTotal: "30000", note: "Board" }),
    );
    expect(figures).toEqual({
      totals: { subtotal: 2_678_571, tax: 321_429, total: 3_000_000 },
      lines: [
        {
          lineId: MIC,
          quantity: 40,
          unitPriceCents: 100_000,
          lineTotalCents: 4_000_000,
          reason: null,
        },
        { lineId: STAND, quantity: 1, unitPriceCents: 2_500, lineTotalCents: 2_500, reason: null },
      ],
      adjustmentCents: 2_678_571 - 4_002_500,
    });
  });

  it("AC-69 a different amount of $500.00 → $446.43 + $53.57", () => {
    const figures = approvedFigures(
      LINES,
      RATE,
      parse({ kind: "approve_different_amount", approvedTotal: "500.00", note: "Board" }),
    );
    expect("totals" in figures && figures.totals).toEqual({
      subtotal: 44_643,
      tax: 5_357,
      total: 50_000,
    });
  });

  it("an amount above the request is allowed; the adjustment is positive", () => {
    const figures = approvedFigures(
      LINES,
      RATE,
      parse({ kind: "approve_different_amount", approvedTotal: "56,000", note: "More" }),
    );
    expect("adjustmentCents" in figures && figures.adjustmentCents).toBe(5_000_000 - 4_002_500);
  });

  it("line changes: tax forward on the approved lines; quantity 0 excludes an item", () => {
    const figures = approvedFigures(
      LINES,
      RATE,
      parse({
        kind: "approve_line_changes",
        note: "Fewer",
        lines: [
          { lineId: STAND, quantity: "0", unitPrice: "25" },
          { lineId: MIC, quantity: "10", unitPrice: "1,025.00", reason: "Price went up" },
        ],
      }),
    );
    // $10,250.00 + $1,230.00 = $11,480.00, lines back in the request's order.
    expect(figures).toMatchObject({
      totals: { subtotal: 1_025_000, tax: 123_000, total: 1_148_000 },
      lines: [
        { lineId: MIC, lineTotalCents: 1_025_000, reason: "Price went up" },
        { lineId: STAND, quantity: 0, lineTotalCents: 0 },
      ],
    });
  });

  it("line changes must cover every line once, change something, and leave more than $0.00", () => {
    const lines = (a: [string, string, string][]) =>
      parse({
        kind: "approve_line_changes",
        note: "x",
        lines: a.map(([lineId, quantity, unitPrice]) => ({ lineId, quantity, unitPrice })),
      });
    expect(approvedFigures(LINES, RATE, lines([[MIC, "1", "1"]]))).toEqual({
      error: expect.stringContaining("items changed"),
    });
    expect(
      approvedFigures(
        LINES,
        RATE,
        lines([
          [MIC, "1", "1"],
          [MIC, "1", "1"],
        ]),
      ),
    ).toEqual({ error: expect.stringContaining("items changed") });
    expect(
      approvedFigures(
        LINES,
        RATE,
        lines([
          [MIC, "40", "1000"],
          [STAND, "1", "25"],
        ]),
      ),
    ).toEqual({ error: expect.stringContaining("No item was changed") });
    expect(
      approvedFigures(
        LINES,
        RATE,
        lines([
          [MIC, "0", "1000"],
          [STAND, "0", "25"],
        ]),
      ),
    ).toEqual({ error: expect.stringContaining("more than $0.00") });
  });

  it("approvedLineTotal treats quantity 0 as excluded", () => {
    expect(approvedLineTotal(0, 99_999)).toBe(0);
    expect(approvedLineTotal(3, 1_004)).toBe(3_012);
  });
});
