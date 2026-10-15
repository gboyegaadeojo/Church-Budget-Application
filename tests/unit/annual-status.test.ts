import { describe, expect, it } from "vitest";
import {
  ANNUAL_STATUSES,
  canTransition,
  InvalidTransitionError,
  isApproved,
  isRequesterEditable,
  isSubmitted,
  transition,
  type AnnualEvent,
  type AnnualStatus,
} from "@/domain/annual/status";

/** Every allowed move (Requirements 12, FR-12, FR-17, FR-18a, FR-34, FR-03). */
const ALLOWED: [AnnualStatus, AnnualEvent, AnnualStatus][] = [
  ["draft", "submit", "submitted"],
  ["submitted", "revise", "updated"],
  ["updated", "revise", "updated"],
  ["in_review", "revise", "updated"],
  ["returned", "respond", "updated"],
  ["submitted", "start_review", "in_review"],
  ["updated", "start_review", "in_review"],
  ["in_review", "return", "returned"],
  ["in_review", "approve", "approved"],
  ["in_review", "approve_pending_second", "awaiting_second_approval"],
  ["awaiting_second_approval", "second_approve", "approved"],
  ["awaiting_second_approval", "second_refuse", "in_review"],
  ["in_review", "decline", "declined"],
  ["approved", "reopen", "returned"],
  ["declined", "reopen", "returned"],
  ["submitted", "department_rejected", "draft"],
  ["updated", "department_rejected", "draft"],
  ["in_review", "department_rejected", "draft"],
  ["returned", "department_rejected", "draft"],
  ["approved", "close", "closed"],
];

const EVENTS = [...new Set(ALLOWED.map(([, e]) => e))];

describe("annual status machine", () => {
  it.each(ALLOWED)("%s --%s--> %s", (from, event, to) => {
    expect(transition(from, event)).toBe(to);
  });

  it("rejects every other move", () => {
    for (const from of ANNUAL_STATUSES) {
      for (const event of EVENTS) {
        const allowed = ALLOWED.some(([f, e]) => f === from && e === event);
        expect(canTransition(from, event)).toBe(allowed);
        if (!allowed) expect(() => transition(from, event)).toThrow(InvalidTransitionError);
      }
    }
  });

  it("never lets a requester edit a decided request (Requirements 12)", () => {
    for (const status of ["approved", "declined", "closed", "awaiting_second_approval"] as const) {
      expect(isRequesterEditable(status)).toBe(false);
      expect(canTransition(status, "revise")).toBe(false);
      expect(canTransition(status, "respond")).toBe(false);
    }
  });

  it("reopens only through the reopen event, back to Returned", () => {
    expect(transition("approved", "reopen")).toBe("returned");
    expect(canTransition("closed", "reopen")).toBe(false);
  });

  it("does not count a draft as submitted (FR-14)", () => {
    expect(isSubmitted("draft")).toBe(false);
    expect(ANNUAL_STATUSES.filter(isSubmitted)).not.toContain("draft");
  });

  it("treats only approved and closed requests as approved", () => {
    expect(ANNUAL_STATUSES.filter(isApproved)).toEqual(["approved", "closed"]);
  });

  it("names the move in the error", () => {
    expect(() => transition("declined", "approve")).toThrow(
      "Cannot approve an annual budget request that is declined",
    );
  });
});
