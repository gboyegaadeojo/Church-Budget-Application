import { describe, expect, it } from "vitest";
import { toursCopy } from "@/copy/tours";
import {
  applicableStep,
  catchUp,
  firstStepOn,
  onPage,
  TOUR_IDS,
  TOURS,
} from "@/domain/tours/tours";

const index = (tour: "annual" | "expense", id: string) => TOURS[tour].findIndex((s) => s.id === id);

describe("guided tours (decided 2026-11-12)", () => {
  it("has words for every step, and a waiting line for steps the form reaches later", () => {
    for (const tour of TOUR_IDS) {
      for (const step of TOURS[tour]) {
        const words = (toursCopy.steps[tour] as Record<string, { title: string; body: string }>)[
          step.id
        ];
        expect(words?.title, `${tour}.${step.id}`).toBeTruthy();
        expect(words?.body, `${tour}.${step.id}`).toBeTruthy();
      }
    }
  });

  it("knows each form's pages", () => {
    expect(onPage("annual-new", "/annual/new")).toBe(true);
    expect(onPage("annual-edit", "/annual/0d3c/edit")).toBe(true);
    expect(onPage("annual-edit", "/annual/new")).toBe(false);
    expect(onPage("expense-new", "/expenses/new")).toBe(true);
    expect(onPage("expense-edit", "/expenses/abc/edit")).toBe(true);
    expect(onPage("expense-edit", "/expenses/abc")).toBe(false);
  });

  it("Show me how starts at the first step on the page", () => {
    expect(firstStepOn("annual", "/annual/new")).toBe(0);
    expect(firstStepOn("annual", "/annual/x/edit")).toBe(index("annual", "details"));
    expect(firstStepOn("expense", "/expenses/x/edit")).toBe(index("expense", "budget"));
    expect(firstStepOn("expense", "/")).toBe(0);
  });

  it("follows the person when the form takes them to its next page", () => {
    const cont = index("annual", "continue");
    expect(catchUp("annual", cont, "/annual/r1/edit")).toBe(index("annual", "details"));
    // Still on the right page: stays put.
    expect(catchUp("annual", cont, "/annual/new")).toBe(cont);
    // Somewhere the tour has no later step: stays put, so Take me there can bring them back.
    expect(catchUp("annual", cont, "/help")).toBe(cont);
    // Never goes backwards.
    expect(catchUp("annual", index("annual", "submit"), "/annual/new")).toBe(
      index("annual", "submit"),
    );
  });

  it("skips the sales tax step on an expense claim, both ways", () => {
    const tax = index("expense", "tax");
    expect(applicableStep("expense", tax, 1, "expense_claim")).toBe(index("expense", "send"));
    expect(applicableStep("expense", tax, -1, "expense_claim")).toBe(index("expense", "next"));
    expect(applicableStep("expense", tax, 1, "purchase_request")).toBe(tax);
    // Before the form is on screen its type isn't known: nothing is skipped.
    expect(applicableStep("expense", tax, 1, null)).toBe(tax);
  });

  it("reports running off either end", () => {
    expect(applicableStep("annual", TOURS.annual.length, 1, null)).toBe(TOURS.annual.length);
    expect(applicableStep("annual", -1, -1, null)).toBe(-1);
  });
});
