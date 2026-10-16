import { describe, expect, it } from "vitest";
import { revisionChanges, type Snapshot } from "@/domain/annual/revision-diff";

const BASE: Snapshot = {
  title: "Sound",
  justification: "Why",
  lines: [
    { name: "Mixer", quantity: 1, unitPriceCents: 102_500 },
    { name: "Cable", quantity: 10, unitPriceCents: 1_500 },
  ],
};

describe("revisionChanges", () => {
  it("finds no changes between identical versions", () => {
    expect(revisionChanges(BASE, BASE)).toEqual([]);
  });

  it("reports text, added, removed and changed items", () => {
    const next: Snapshot = {
      title: "Sound desk",
      justification: "Why",
      lines: [
        { name: "mixer", quantity: 2, unitPriceCents: 102_500 },
        { name: "Stand", quantity: 1, unitPriceCents: 2_500 },
      ],
    };
    expect(revisionChanges(BASE, next)).toEqual([
      { kind: "title" },
      {
        kind: "changed",
        item: "mixer",
        from: { quantity: 1, unitPriceCents: 102_500 },
        to: { quantity: 2, unitPriceCents: 102_500 },
      },
      { kind: "added", item: "Stand" },
      { kind: "removed", item: "Cable" },
    ]);
  });

  it("pairs items with the same name in order", () => {
    const twice: Snapshot = {
      ...BASE,
      lines: [
        { name: "Cable", quantity: 1, unitPriceCents: 100 },
        { name: "Cable", quantity: 2, unitPriceCents: 100 },
      ],
    };
    const next: Snapshot = { ...twice, lines: [twice.lines[0]] };
    expect(revisionChanges(twice, next)).toEqual([{ kind: "removed", item: "Cable" }]);
  });
});
