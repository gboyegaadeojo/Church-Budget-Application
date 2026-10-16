import { describe, expect, it } from "vitest";
import {
  assertCan,
  authorize,
  can,
  ForbiddenError,
  type Action,
  type AuthzContext,
  type Subject,
} from "@/lib/authz";
import { ROLES, type Department, type Role } from "@/lib/roles";

const MEDIA: Department = { id: "media", name: "Media", representativeType: "primary" };

function who(roles: Role[], departments: Department[] = [], id = "u1"): Subject {
  return { id, roles, departments };
}

/** A single-role person; requesters represent Media as its Primary. */
const single = (role: Role) => who([role], role === "requester" ? [MEDIA] : []);

type Outcome = "act" | "read" | "no";

function outcome(subject: Subject, action: Action, ctx: AuthzContext): Outcome {
  const d = authorize(subject, action, ctx);
  return !d.allowed ? "no" : d.readOnly ? "read" : "act";
}

const YOUTH = { departmentId: "youth" } as const;
const OWN = { departmentId: "media" } as const;

/**
 * Requirements 3.6, one row per capability. Columns follow ROLES:
 * requester, accountant, backup_approver, board_chair, vice_chair, church_admin, system_admin.
 */
const MATRIX: [string, Action, AuthzContext, Outcome[]][] = [
  [
    "view another department's approved budget",
    "annual.view",
    { ...YOUTH, annualStatus: "approved" },
    ["no", "act", "act", "read", "read", "read", "read"],
  ],
  [
    "view another department's request in review",
    "annual.view",
    { ...YOUTH, annualStatus: "in_review" },
    ["no", "act", "act", "no", "no", "no", "read"],
  ],
  [
    "view another department's draft",
    "annual.view",
    { ...YOUTH, annualStatus: "draft" },
    ["no", "no", "no", "no", "no", "no", "read"],
  ],
  [
    "view own department's draft",
    "annual.view",
    { ...OWN, annualStatus: "draft" },
    ["act", "no", "no", "no", "no", "no", "read"],
  ],
  [
    "create and save a draft",
    "annual.edit_draft",
    OWN,
    ["act", "no", "no", "no", "no", "no", "no"],
  ],
  [
    "start a budget for any department (FR-03)",
    "annual.start",
    YOUTH,
    ["act", "no", "no", "no", "no", "no", "no"],
  ],
  ["delete a draft", "annual.delete_draft", OWN, ["act", "no", "no", "no", "no", "no", "no"]],
  ["submit a budget request", "annual.submit", OWN, ["act", "no", "no", "no", "no", "no", "no"]],
  ["edit a submitted request", "annual.revise", OWN, ["act", "no", "no", "no", "no", "no", "no"]],
  [
    "see the accountant dashboard and review queue",
    "annual.review",
    {},
    ["no", "act", "act", "no", "no", "no", "read"],
  ],
  [
    "approve, adjust, return or decline",
    "annual.decide",
    YOUTH,
    ["no", "act", "act", "no", "no", "no", "no"],
  ],
  [
    "reopen a decided request",
    "annual.reopen",
    YOUTH,
    ["no", "act", "act", "no", "no", "no", "no"],
  ],
  [
    "export all departments",
    "annual.export_all",
    {},
    ["no", "act", "act", "no", "no", "no", "act"],
  ],
  ["manage departments", "admin.departments", {}, ["no", "no", "no", "no", "no", "no", "act"]],
  ["manage users and roles", "admin.users", {}, ["no", "no", "no", "no", "no", "no", "act"]],
  ["configure cycles", "admin.cycles", {}, ["no", "no", "no", "no", "no", "no", "act"]],
  ["change the sales tax rate", "admin.settings", {}, ["no", "no", "no", "no", "no", "no", "act"]],
  [
    "map departments to Planning Center",
    "admin.pco_mapping",
    {},
    ["no", "no", "no", "no", "no", "no", "act"],
  ],
  ["see and retry emails", "admin.notifications", {}, ["no", "no", "no", "no", "no", "no", "act"]],
  [
    "set the Primary requester",
    "department.set_primary",
    OWN,
    ["no", "no", "no", "no", "no", "no", "act"],
  ],
  [
    "set the Backup requester",
    "department.set_backup",
    OWN,
    ["act", "no", "no", "no", "no", "no", "act"],
  ],
  [
    "extend one department's deadline",
    "cycle.extend_deadline",
    YOUTH,
    ["no", "act", "act", "no", "no", "no", "act"],
  ],
  [
    "record and correct spending",
    "spending.record",
    YOUTH,
    ["no", "act", "act", "no", "no", "act", "no"],
  ],
  [
    "create budget amendments",
    "spending.amend",
    YOUTH,
    ["no", "act", "act", "no", "no", "no", "no"],
  ],
  [
    "lock or reopen the spending period",
    "spending.lock",
    {},
    ["no", "act", "act", "no", "no", "no", "no"],
  ],
  [
    "view another department's budget vs actual",
    "spending.view",
    YOUTH,
    ["no", "act", "act", "read", "read", "act", "read"],
  ],
  [
    "view own department's budget vs actual",
    "spending.view",
    OWN,
    ["read", "act", "act", "read", "read", "act", "read"],
  ],
  [
    "export spending reports",
    "spending.export",
    {},
    ["no", "act", "act", "no", "no", "act", "act"],
  ],
  ["submit an expense", "expense.submit", OWN, ["act", "no", "no", "no", "no", "no", "no"]],
  [
    "expense first approval",
    "expense.first_approve",
    YOUTH,
    ["no", "act", "act", "no", "no", "no", "no"],
  ],
  [
    "expense final approval",
    "expense.final_approve",
    YOUTH,
    ["no", "no", "no", "act", "act", "no", "no"],
  ],
  [
    "record an expense payment",
    "expense.pay",
    YOUTH,
    ["no", "act", "act", "no", "no", "act", "no"],
  ],
  [
    "view another department's expense",
    "expense.view",
    YOUTH,
    ["no", "act", "act", "no", "no", "act", "read"],
  ],
  [
    "view an expense sent to the board",
    "expense.view",
    { ...YOUTH, sentToBoard: true },
    ["no", "act", "act", "read", "read", "act", "read"],
  ],
  ["see My tasks", "home.view", {}, ["act", "act", "act", "act", "act", "act", "act"]],
  [
    // Staff only (docs/decisions.md, 2026-10-16).
    "use Analytics & Audit",
    "analytics.view",
    {},
    ["no", "act", "act", "read", "read", "act", "act"],
  ],
];

describe("authorization matrix (Requirements 3.6)", () => {
  for (const [capability, action, ctx, expected] of MATRIX) {
    it(capability, () => {
      expect(ROLES.map((role) => outcome(single(role), action, ctx))).toEqual(expected);
    });
  }

  it("denies everything to a person with no roles", () => {
    for (const [, action, ctx] of MATRIX) {
      expect(authorize(who([]), action, ctx)).toEqual({ allowed: false, reason: "missing_role" });
    }
  });
});

describe("requesters", () => {
  it("cannot open another department's request (AC-3)", () => {
    expect(
      authorize(single("requester"), "annual.view", { ...YOUTH, annualStatus: "submitted" }),
    ).toEqual({ allowed: false, reason: "not_department_representative" });
  });

  it("Backup and other representatives act like the Primary on the budget (FR-38)", () => {
    for (const representativeType of ["backup", "representative"] as const) {
      const rep = who(["requester"], [{ ...MEDIA, representativeType }]);
      expect(can(rep, "annual.submit", OWN)).toBe(true);
      expect(can(rep, "annual.revise", OWN)).toBe(true);
    }
  });

  it("only the Primary can nominate a Backup (FR-38)", () => {
    const backup = who(["requester"], [{ ...MEDIA, representativeType: "backup" }]);
    expect(authorize(backup, "department.set_backup", OWN)).toEqual({
      allowed: false,
      reason: "not_primary_requester",
    });
    expect(can(single("requester"), "department.set_backup", YOUTH)).toBe(false);
  });

  it("fails closed when the department is unknown", () => {
    expect(can(single("requester"), "annual.submit", {})).toBe(false);
  });
});

describe("multi-role users (union of roles)", () => {
  const accountantRequester = who(["accountant", "requester"], [MEDIA]);

  it("acts as requester for their own department", () => {
    expect(authorize(accountantRequester, "annual.submit", OWN)).toMatchObject({
      allowed: true,
      actingRole: "requester",
    });
    expect(
      authorize(accountantRequester, "annual.view", { ...OWN, annualStatus: "draft" }),
    ).toMatchObject({ allowed: true, actingRole: "requester", readOnly: false });
  });

  it("opens Analytics & Audit through the staff role", () => {
    expect(authorize(accountantRequester, "analytics.view")).toMatchObject({
      allowed: true,
      actingRole: "accountant",
    });
  });

  it("acts as accountant for other departments", () => {
    expect(authorize(accountantRequester, "annual.decide", YOUTH)).toMatchObject({
      allowed: true,
      actingRole: "accountant",
    });
  });

  it("cannot decide their own department's budget (FR-33)", () => {
    expect(authorize(accountantRequester, "annual.decide", OWN)).toEqual({
      allowed: false,
      reason: "conflict_of_interest",
    });
    expect(can(accountantRequester, "annual.reopen", OWN)).toBe(false);
    expect(can(accountantRequester, "expense.first_approve", OWN)).toBe(false);
  });

  it("refuses a decision when the department is not given", () => {
    expect(authorize(single("accountant"), "annual.decide", {})).toEqual({
      allowed: false,
      reason: "conflict_of_interest",
    });
  });

  it("prefers a role that can act over a read-only one", () => {
    const both = who(["system_admin", "church_admin"]);
    expect(authorize(both, "spending.view", YOUTH)).toMatchObject({
      actingRole: "church_admin",
      readOnly: false,
    });
  });
});

describe("System Administrator", () => {
  const admin = who(["system_admin"]);
  const MONEY_ACTIONS: Action[] = [
    "annual.start",
    "annual.edit_draft",
    "annual.delete_draft",
    "annual.submit",
    "annual.revise",
    "annual.decide",
    "annual.reopen",
    "expense.submit",
    "expense.first_approve",
    "expense.final_approve",
    "expense.pay",
    "spending.record",
    "spending.amend",
    "spending.lock",
  ];

  it("reads everything, drafts included, read-only", () => {
    for (const status of ["draft", "submitted", "in_review", "approved", "declined"] as const) {
      expect(authorize(admin, "annual.view", { ...YOUTH, annualStatus: status })).toMatchObject({
        allowed: true,
        readOnly: true,
      });
    }
    expect(authorize(admin, "expense.view", YOUTH)).toMatchObject({ readOnly: true });
    expect(authorize(admin, "spending.view", YOUTH)).toMatchObject({ readOnly: true });
  });

  it("takes no money action without the matching role", () => {
    for (const action of MONEY_ACTIONS) {
      expect(authorize(admin, action, YOUTH)).toEqual({ allowed: false, reason: "missing_role" });
    }
  });

  it("gains exactly the matching money action with another role", () => {
    const withAccountant = who(["system_admin", "accountant"]);
    expect(authorize(withAccountant, "annual.decide", YOUTH)).toMatchObject({
      allowed: true,
      actingRole: "accountant",
    });
    expect(can(withAccountant, "expense.final_approve", YOUTH)).toBe(false);
  });
});

describe("Board Chair and Vice-Chair", () => {
  it("gives the Vice-Chair the Chair's permissions, recorded as the Vice-Chair", () => {
    for (const [action, ctx] of MATRIX.map(([, a, c]) => [a, c] as const)) {
      expect(can(single("vice_chair"), action, ctx)).toBe(can(single("board_chair"), action, ctx));
    }
    expect(authorize(single("vice_chair"), "expense.final_approve", YOUTH)).toMatchObject({
      allowed: true,
      actingRole: "vice_chair",
    });
  });

  it("records the Chair when one person holds both", () => {
    expect(
      authorize(who(["vice_chair", "board_chair"]), "expense.final_approve", YOUTH),
    ).toMatchObject({ actingRole: "board_chair" });
  });

  it("cannot approve for their own department or themselves (3.3)", () => {
    const chairRequester = who(["board_chair", "requester"], [MEDIA]);
    expect(authorize(chairRequester, "expense.final_approve", OWN)).toEqual({
      allowed: false,
      reason: "conflict_of_interest",
    });
    expect(
      authorize(single("board_chair"), "expense.final_approve", { ...YOUTH, payeeUserId: "u1" }),
    ).toEqual({ allowed: false, reason: "conflict_of_interest" });
    expect(
      can(single("board_chair"), "expense.final_approve", { ...YOUTH, payeeUserId: "someone" }),
    ).toBe(true);
  });

  it("cannot decide annual budgets", () => {
    expect(can(single("board_chair"), "annual.decide", YOUTH)).toBe(false);
  });
});

describe("payments", () => {
  it("nobody records a payment to themselves", () => {
    expect(
      authorize(single("church_admin"), "expense.pay", { ...YOUTH, payeeUserId: "u1" }),
    ).toEqual({ allowed: false, reason: "conflict_of_interest" });
    expect(can(single("church_admin"), "expense.pay", { ...YOUTH, payeeUserId: "u2" })).toBe(true);
  });
});

describe("assertCan", () => {
  it("returns the acting role when allowed", () => {
    expect(assertCan(single("accountant"), "annual.decide", YOUTH)).toEqual({
      actingRole: "accountant",
      readOnly: false,
    });
  });

  it("throws ForbiddenError with the reason when not", () => {
    try {
      assertCan(single("requester"), "annual.decide", YOUTH);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error).toMatchObject({ action: "annual.decide", reason: "missing_role" });
    }
  });
});
