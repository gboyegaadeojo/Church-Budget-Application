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
    awaitingAccountant: "Awaiting accountant",
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
    intro:
      "The accountant and the Board Chair are both asked to approve it. You'll be emailed once both have approved, or if either has a question.",
    action: "Nothing for now. You can still change it until the review starts.",
  },
  newSubmission: {
    subject: (r: string, d: string) => `New expense to review: ${about(r, d)}`,
    heading: "An expense needs your approval",
    intro: (department: string, name: string) => `${name} submitted an expense for ${department}.`,
    together:
      "The accountant and the Board Chair are asked at the same time and can approve in either order. It's approved once you both approve; if your amounts differ, the lower one is approved.",
    action: "Review it and decide: approve, approve a smaller amount, return it, or decline it.",
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
    heading: "Your expense is being reviewed",
    intro: "It can't be changed now. If something needs to change, it will be returned to you.",
  },
  returned: {
    subject: (r: string, d: string) => `Question about ${about(r, d)}`,
    heading: "The accountant has a question",
    headingBy: (role: string) => `The ${role} has a question`,
    question: "Question",
    action: "Answer the question and send the expense back. You can change it while you do.",
    button: "Respond",
    copyHeading: "An expense was returned",
    copyIntro: (department: string, name: string) =>
      `${name} asked ${department} to clarify. Both approvals are needed again once they answer.`,
  },
  approvedOne: {
    subject: (r: string, d: string) => `You approved ${about(r, d)}`,
    heading: "You approved an expense",
    waitingForBoard: "It's approved once the Board Chair approves too.",
    waitingForAccountant: "It's approved once the accountant approves too.",
    lower: "If the two approved amounts differ, the lower one is approved.",
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
    heading: "An expense needs your approval",
    covering: "You're receiving this because the Board Chair is away or can't decide this one.",
    action: "Approve it, approve a smaller amount, return it to the department, or decline it.",
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
    copyHeading: "Expense approved",
    copyIntro: (name: string) => `${name} gave the second approval, so it's approved.`,
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
  carriedOver: {
    subject: (r: string, d: string) => `Carried into next year: ${about(r, d)}`,
    heading: "The purchase request moved to next year's budget",
    intro: (name: string, from: string, to: string) =>
      `${name} closed ${from} and carried this approved purchase request into ${to}. The money set aside now comes from the ${to} budget. It's still approved, so the purchase can go ahead.`,
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
  message: {
    subject: (r: string, d: string) => `New message: ${about(r, d)}`,
    heading: "A new message about an expense",
    status: "Message",
    intro: (name: string, side: string) => `${name} (${side}) wrote:`,
    label: "Message",
    action: "Reply on the expense if you need to.",
    button: "Open the messages",
  },
  reminders: {
    approval: {
      subject: (n: number) =>
        n === 1
          ? "Reminder: 1 expense is waiting for your approval"
          : `Reminder: ${n} expenses are waiting for your approval`,
      heading: "Expenses waiting for your approval",
      intro: (days: number) =>
        `These have waited more than ${days} days for your approval. You'll get this reminder each day until you decide.`,
      action:
        "Open each one and decide: approve, approve a smaller amount, return it or decline it.",
      accountantButton: "Review queue",
      boardButton: "Awaiting my approval",
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
