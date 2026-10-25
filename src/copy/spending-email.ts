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
  /** Every spending entry recorded, corrected or voided by hand (decided 2026-10-24). */
  entry: {
    facts: {
      type: "Type",
      spentOn: "Date spent",
      payee: "Payee",
      description: "Description",
      amount: "Amount (incl. tax)",
      method: "Payment method",
      reference: "Reference",
      by: "By",
      when: "When",
      reason: "Reason",
      before: "Before",
    },
    recorded: {
      subject: (d: string, amount: string) => `Spending recorded: ${amount} for ${d}`,
      heading: "Spending was recorded",
      status: "Recorded",
      intro: (who: string, d: string) => `${who} recorded spending for ${d}.`,
    },
    corrected: {
      subject: (d: string, amount: string) => `Spending corrected: ${amount} for ${d}`,
      heading: "A spending entry was corrected",
      status: "Corrected",
      intro: (who: string, d: string) =>
        `${who} corrected a spending entry for ${d}. The previous values are kept in the activity log.`,
    },
    voided: {
      subject: (d: string, amount: string) => `Spending voided: ${amount} for ${d}`,
      heading: "A spending entry was voided",
      status: "Voided",
      intro: (who: string, d: string) =>
        `${who} voided a spending entry for ${d}. It stays in the ledger, marked Voided, and no longer counts as spent.`,
    },
    action: "Nothing, unless this doesn't match the church's records.",
    button: "Open the entry",
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
