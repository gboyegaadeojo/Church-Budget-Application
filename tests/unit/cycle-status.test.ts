import { describe, expect, it } from "vitest";
import {
  canTransitionCycle,
  deadlineEditable,
  InvalidCycleTransitionError,
  transitionCycle,
} from "@/domain/cycles/status";

/** The budget cycle state machine: Draft → Open → Closed (the year ended), and reopen. */
describe("budget cycle status", () => {
  it("opens a draft, closes an open year and reopens a closed one", () => {
    expect(transitionCycle("draft", "open")).toBe("open");
    expect(transitionCycle("open", "close")).toBe("closed");
    expect(transitionCycle("closed", "reopen")).toBe("open");
  });

  it("refuses anything else", () => {
    expect(canTransitionCycle("draft", "close")).toBe(false);
    expect(canTransitionCycle("open", "open")).toBe(false);
    expect(canTransitionCycle("closed", "close")).toBe(false);
    expect(() => transitionCycle("draft", "reopen")).toThrow(InvalidCycleTransitionError);
  });

  it("lets the deadline change until the year closes", () => {
    expect(deadlineEditable("draft")).toBe(true);
    expect(deadlineEditable("open")).toBe(true);
    expect(deadlineEditable("closed")).toBe(false);
  });
});
