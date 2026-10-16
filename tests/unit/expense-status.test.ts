import { describe, expect, it } from "vitest";
import {
  canTransitionExpense,
  EXPENSE_STATUSES,
  EXPENSE_TYPES,
  InvalidExpenseTransitionError,
  isExpenseEditable,
  transitionExpense,
  type ExpenseEvent,
  type ExpenseStatus,
  type ExpenseType,
} from "@/domain/expenses/status";

const EVENTS: ExpenseEvent[] = [
  "submit",
  "respond",
  "withdraw",
  "start_review",
  "return",
  "approve",
  "board_return",
  "final_approve",
  "decline",
  "start_processing",
  "pay",
  "purchase",
  "close",
  "cancel",
];

/** Every allowed move (FR-45), for both types unless a type is named. */
const ALLOWED: [ExpenseStatus, ExpenseEvent, ExpenseStatus, ExpenseType?][] = [
  ["draft", "submit", "submitted"],
  ["returned", "respond", "submitted"],
  ["submitted", "withdraw", "withdrawn"],
  ["returned", "withdraw", "withdrawn"],
  ["submitted", "start_review", "in_review"],
  ["in_review", "return", "returned"],
  ["in_review", "approve", "awaiting_board"],
  ["awaiting_board", "board_return", "in_review"],
  ["awaiting_board", "final_approve", "approved"],
  ["in_review", "decline", "declined"],
  ["awaiting_board", "decline", "declined"],
  ["approved", "start_processing", "processing"],
  ["processing", "pay", "paid", "expense_claim"],
  ["processing", "purchase", "purchased", "purchase_request"],
  ["paid", "close", "closed"],
  ["purchased", "close", "closed"],
  ["approved", "close", "closed", "purchase_request"],
  ["approved", "cancel", "cancelled", "purchase_request"],
];

function allowed(from: ExpenseStatus, event: ExpenseEvent, type: ExpenseType) {
  return ALLOWED.find(([f, e, , t]) => f === from && e === event && (!t || t === type));
}

describe("expense status machine (FR-45)", () => {
  it.each(ALLOWED)("%s --%s--> %s", (from, event, to, type) => {
    for (const t of type ? [type] : EXPENSE_TYPES) {
      expect(transitionExpense(from, event, t)).toBe(to);
    }
  });

  it("rejects every other move", () => {
    for (const type of EXPENSE_TYPES) {
      for (const from of EXPENSE_STATUSES) {
        for (const event of EVENTS) {
          if (allowed(from, event, type)) continue;
          expect(canTransitionExpense(from, event, type), `${type} ${from} ${event}`).toBe(false);
          expect(() => transitionExpense(from, event, type)).toThrow(InvalidExpenseTransitionError);
        }
      }
    }
  });

  it("keeps purchase-only and claim-only events to their type", () => {
    expect(canTransitionExpense("processing", "pay", "purchase_request")).toBe(false);
    expect(canTransitionExpense("processing", "purchase", "expense_claim")).toBe(false);
    expect(canTransitionExpense("approved", "cancel", "expense_claim")).toBe(false);
    expect(canTransitionExpense("approved", "close", "expense_claim")).toBe(false);
  });

  it("lets nothing skip the Board Chair (6B.4)", () => {
    for (const type of EXPENSE_TYPES) {
      for (const from of EXPENSE_STATUSES) {
        if (from === "awaiting_board") continue;
        expect(canTransitionExpense(from, "final_approve", type)).toBe(false);
      }
    }
  });

  it("is editable only before review starts, or when returned (FR-44, AC-71)", () => {
    const editable = EXPENSE_STATUSES.filter(isExpenseEditable);
    expect(editable).toEqual(["draft", "submitted", "returned"]);
  });
});
