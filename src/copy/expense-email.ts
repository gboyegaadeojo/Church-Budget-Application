/**
 * Expense email text (FR-49, DRD 7.5): the same shared layout as every other email.
 * Subjects name the reference, the department and what happened.
 */

const about = (reference: string, department: string) => `${reference} (${department})`;

export const expenseEmailCopy = {
  facts: {
    reference: "Reference",
    type: "Type",
    department: "Department",
    cycle: "Budget year",
    title: "Expense",
    requester: "Submitted by",
    payee: "Payee",
    preference: "Payment preference",
    howBought: "How it will be bought",
    submittedOn: "Submitted",
    approvedBy: "Approved by",
    method: "How it was paid",
    paidOn: "Date paid",
    reference2: "Payment reference",
    remaining: "Remaining after this",
  },
  statuses: {
    submitted: "Submitted",
    inReview: "In Review",
    returned: "Returned for Clarification",
    awaitingBoard: "Awaiting Board Chair",
    approved: "Approved",
    processing: "Processing",
    paid: "Paid",
    purchased: "Purchased",
    declined: "Declined",
    withdrawn: "Withdrawn",
    cancelled: "Cancelled",
  },
  items: "Items",
  lines: "Receipts",
  totalPaid: "Total paid (incl. tax)",
  requested: "Requested",
  approvedHeading: "Approved",
  viewExpense: "View expense",
  reviewExpense: "Review expense",
  decide: "Decide",
  process: "Record payment",

  receipt: {
    subject: (r: string, d: string) => `Received: ${about(r, d)}`,
    heading: "Your expense was submitted",
    intro: "The accountant reviews it first, then the Board Chair. You'll be emailed at each step.",
    action: "Nothing for now. You can still change it until the accountant starts reviewing it.",
  },
  newSubmission: {
    subject: (r: string, d: string) => `New expense to review: ${about(r, d)}`,
    heading: "A new expense is waiting for you",
    intro: (department: string, name: string) => `${name} submitted an expense for ${department}.`,
    action: "Review it and decide: approve and send to the Board Chair, return it, or decline it.",
  },
  updated: {
    subject: (r: string, d: string) => `Updated: ${about(r, d)}`,
    heading: "The expense was changed",
    intro: (name: string) => `${name} changed the expense before the review started.`,
  },
  answered: {
    subject: (r: string, d: string) => `Answered: ${about(r, d)}`,
    heading: "The department answered your question",
    intro: (name: string) => `${name} answered and sent the expense back for review.`,
  },
  reviewStarted: {
    subject: (r: string, d: string) => `In review: ${about(r, d)}`,
    heading: "The accountant is reviewing your expense",
    intro: "It can't be changed now. If something needs to change, the accountant will return it.",
  },
  returned: {
    subject: (r: string, d: string) => `Question about ${about(r, d)}`,
    heading: "The accountant has a question",
    question: "Question",
    action: "Answer the question and send the expense back. You can change it while you do.",
    button: "Respond",
    copyHeading: "You returned an expense",
    copyIntro: (department: string) => `${department} has been asked to clarify.`,
  },
  accountantApproved: {
    subject: (r: string, d: string) => `Approved by the accountant: ${about(r, d)}`,
    heading: "Approved by the accountant, waiting for the Board Chair",
    intro: "The Board Chair gives the final approval. You'll be emailed when they decide.",
    copyHeading: "You approved an expense",
    copyIntro: "It's waiting for the Board Chair's final approval.",
  },
  boardNeeded: {
    subject: (r: string, d: string) => `Approval needed: ${about(r, d)}`,
    heading: "An expense needs your final approval",
    intro: (name: string, amount: string) => `${name} (accountant) approved ${amount}.`,
    covering: "You're receiving this because the Board Chair is away or can't decide this one.",
    action:
      "Give final approval, approve a smaller amount, return it to the accountant, or decline it.",
  },
  boardReturned: {
    subject: (r: string, d: string) => `The Board Chair has a question: ${about(r, d)}`,
    heading: "The Board Chair returned an expense to you",
    question: "Question",
    action: "Look at the question, then decide again (you can return it to the department).",
    copyHeading: "You returned an expense to the accountant",
  },
  finalApproved: {
    subject: (r: string, d: string) => `Your expense has been approved: ${about(r, d)}`,
    heading: "Your expense has been approved",
    purchaseIntro: "The money is set aside in your department's budget.",
    selfBuyIntro:
      "The money is set aside. Buy it, then submit an expense claim linked to this request.",
    claimIntro:
      "The Church Administrator will process the payment. You'll be emailed when it's paid.",
    churchCardIntro: "The Church Administrator will record the church card purchase.",
    copyHeading: "Final approval given",
    copyIntro: (name: string) => `${name} gave the final approval.`,
  },
  readyForProcessing: {
    subject: (r: string, d: string) => `Approved, ready for processing: ${about(r, d)}`,
    heading: "Approved, ready for processing",
    intro: "Both approvals are given. Pay or buy it outside the app, then record how it was paid.",
    action: "Process it and record the payment.",
  },
  overBudget: {
    subject: (d: string) => `${d} is over budget`,
    heading: "A department is over budget",
    intro: (department: string, amount: string) =>
      `With this approval, ${department} is over budget by ${amount}.`,
    requesterIntro: (department: string, amount: string) =>
      `With this approval, ${department} is over budget by ${amount}. Talk to the accountant before spending more.`,
  },
  declined: {
    subject: (r: string, d: string) => `Declined: ${about(r, d)}`,
    heading: "Your expense was declined",
    reason: "Reason",
    by: (name: string, role: string) => `Declined by ${name} (${role}).`,
    action: "Nothing. Talk to the accountant if you have questions.",
    copyHeading: "An expense was declined",
  },
  withdrawn: {
    subject: (r: string, d: string) => `Withdrawn: ${about(r, d)}`,
    heading: "The expense was withdrawn",
    intro: (name: string) => `${name} withdrew it. It won't be reviewed.`,
  },
  cancelled: {
    subject: (r: string, d: string) => `Cancelled: ${about(r, d)}`,
    heading: "The purchase request was cancelled",
    intro: (name: string) => `${name} cancelled it. The money set aside is back in the budget.`,
    reason: "Reason",
  },
  processing: {
    subject: (r: string, d: string) => `Being processed: ${about(r, d)}`,
    heading: "Your expense is being processed",
    intro: "The Church Administrator is preparing the payment or purchase.",
  },
  paid: {
    subject: (r: string, d: string) => `Paid: ${about(r, d)}`,
    purchasedSubject: (r: string, d: string) => `Purchased: ${about(r, d)}`,
    heading: "Your expense has been paid",
    purchasedHeading: "Your purchase request has been bought",
    copyHeading: "A payment was recorded",
  },
  reminders: {
    board: {
      subject: (n: number) =>
        n === 1
          ? "1 expense is waiting for your approval"
          : `${n} expenses are waiting for your approval`,
      heading: "Expenses waiting for your final approval",
      intro: (days: number) => `These have waited more than ${days} days.`,
      accountantSubject: (n: number) =>
        n === 1
          ? "1 expense has waited for the Board Chair"
          : `${n} expenses have waited for the Board Chair`,
      accountantHeading: "Expenses waiting for the Board Chair",
      action: "Open each one and decide.",
      accountantAction: "Nothing, unless you want to follow up with the Board Chair.",
      button: "Awaiting my approval",
    },
    payment: {
      subject: (n: number) =>
        n === 1
          ? "1 approved expense hasn't been processed"
          : `${n} approved expenses haven't been processed`,
      heading: "Approved expenses waiting to be processed",
      intro: (days: number) => `These were approved more than ${days} days ago.`,
      action: "Process them and record the payments.",
      button: "Ready to process",
    },
    unclaimed: {
      subject: (r: string) => `Reminder: ${r} hasn't been bought or claimed`,
      heading: "An approved purchase request is still open",
      intro: (days: number) =>
        `It was approved more than ${days} days ago. Buy it and submit a claim, or cancel it if it won't go ahead, so the money goes back to the budget.`,
      officeSubject: (n: number) =>
        n === 1
          ? "1 approved purchase request is still open"
          : `${n} approved purchase requests are still open`,
      action: "Submit a claim linked to it, or cancel it.",
    },
  },
} as const;
