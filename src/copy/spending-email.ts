/** Spending email text (FR-27, FR-28): the shared layout, like every other email. */
export const spendingEmailCopy = {
  facts: {
    department: "Department",
    cycle: "Budget year",
    approved: "Approved budget",
    amendment: "This amendment (incl. tax)",
    available: "Available budget",
    committed: "Committed",
    spent: "Spent",
    remaining: "Remaining",
    used: "Used",
    reason: "Reason",
    boardReference: "Board reference",
    unspent: "Unspent, back to the church",
  },
  overBy: (amount: string) => `Over budget by ${amount}`,
  button: "Open the spending dashboard",
  near: {
    subject: (d: string) => `${d} is nearing its budget limit`,
    heading: "A department is nearing its budget limit",
    status: "Nearing limit",
    intro: (d: string, cycle: string) =>
      `${d} has reached the near-limit threshold of its ${cycle} budget. You'll get this once per budget year.`,
    action: "Nothing unless you want to follow up with the department.",
  },
  over: {
    subject: (d: string) => `${d} is over budget`,
    heading: "A department is over budget",
    status: "Over budget",
    intro: (d: string, cycle: string) =>
      `${d} has gone over its ${cycle} budget. You'll get this once per budget year.`,
    action: "Follow up with the department, or amend the budget if the board agreed.",
  },
  locked: {
    subject: (cycle: string) => `The ${cycle} budget year has closed`,
    heading: "A budget year has closed",
    status: "Closed",
    intro: (cycle: string) =>
      `${cycle} has closed. Its spending can no longer be added, corrected or voided, and the budget left unspent goes back to the church.`,
    action: "Nothing. Ask the accountant if something for that year still needs recording.",
  },
  reopened: {
    subject: (cycle: string) => `The ${cycle} budget year is open again`,
    heading: "A budget year was reopened",
    status: "Reopened",
    intro: (cycle: string) =>
      `${cycle} was reopened. Its spending can be recorded and changed again.`,
    action: "Record or correct what the accountant asked for.",
  },
  amendment: {
    subject: (d: string) => `${d}'s budget was amended`,
    heading: "Your department's budget was amended",
    status: "Budget amended",
    intro: (d: string, cycle: string) => `The accountant changed ${d}'s ${cycle} budget.`,
    action: "Nothing. Spend within the new available budget.",
    button: "View my department's budget",
  },
} as const;
