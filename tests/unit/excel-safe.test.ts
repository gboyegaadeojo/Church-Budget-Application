import { describe, expect, it } from "vitest";
import { centsToDollars, fileNamePart, safeText } from "@/lib/excel/safe";

describe("spreadsheet formula guard (AC-96)", () => {
  it.each([
    ["=1+1", "'=1+1"],
    ["+cmd", "'+cmd"],
    ["-2+3", "'-2+3"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["\t=1", "'\t=1"],
    ["\r=1", "'\r=1"],
  ])("prefixes %j", (input, output) => expect(safeText(input)).toBe(output));

  it.each([["Microphone"], ["Sound desk = new"], ["50% off"], [""]])("leaves %j alone", (input) =>
    expect(safeText(input)).toBe(input),
  );

  it("turns null into an empty cell", () => {
    expect(safeText(null)).toBe("");
    expect(safeText(undefined)).toBe("");
  });
});

describe("export file names", () => {
  it.each([
    ["Women's Fellowship Team", "Womens_Fellowship_Team"],
    ["Media Team", "Media_Team"],
    ["IFC-2027-0007", "IFC-2027-0007"],
    ["Café / Hospitality", "Cafe_Hospitality"],
    ["!!!", "Export"],
  ])("%j becomes %j", (input, output) => expect(fileNamePart(input)).toBe(output));
});

it("writes cents as dollars for display", () => {
  expect(centsToDollars(114_800)).toBe(1148);
  expect(centsToDollars(1_004)).toBe(10.04);
});
