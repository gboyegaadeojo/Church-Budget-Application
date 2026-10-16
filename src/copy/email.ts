/**
 * Email text (FR-11, FR-19, FR-21, DRD 7.5). One shared layout; each email fills in
 * its heading, status, facts, changes, amounts, note and "what you need to do".
 */

const noAction = "Nothing, this is for your records.";
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "Media Team FY2027 (IFC-2027-0007)". */
const about = (department: string, cycle: string, reference: string) =>
  `${department} ${cycle} (${reference})`;

export const emailCopy = {
  layout: {
    status: "Status",
    whatChanged: "What changed",
    whatToDo: "What you need to do",
    subtotal: "Subtotal",
    salesTax: (rate: string) => `Sales tax (${rate})`,
    total: "Total (incl. tax)",
    requested: "Requested",
    approved: "Approved",
    difference: "Difference",
    orOpen: "Or open this link:",
    footer: (app: string, church: string) => `Sent by ${app}, ${church}.`,
    signInNote: "The link asks you to sign in. We never put budget details in links.",
  },

  noAction,

  annual: {
    facts: {
      reference: "Reference",
      department: "Department",
      cycle: "Budget year",
      title: "Request",
      submittedOn: "Submitted",
      decidedOn: "Decided",
      approvedOn: "Approved",
      board: "Board reference",
    },
    items: "Items",
    approvedItems: "Approved items",
    approvedHeading: "Approved",
    viewRequest: "View request",
    reviewRequest: "Review request",
    viewBudget: "View budget",
    statuses: {
      submitted: "Submitted",
      updated: "Updated",
      inReview: "In Review",
      returned: "Returned for Clarification",
      approved: "Approved",
      declined: "Declined",
    },
    difference: {
      less: (amount: string) => `${amount} less than requested`,
      more: (amount: string) => `${amount} more than requested`,
      none: "Same as requested",
    },
    editsLeft: (n: number) =>
      n === 0
        ? "You have no changes left before review."
        : `You can still change it ${n} more ${plural(n, "time", "times")} before it's reviewed.`,

    receipt: {
      subject: (d: string, c: string, r: string) => `Budget received: ${about(d, c, r)}`,
      heading: "We received your budget request",
      intro: (cycle: string, time: string) =>
        `Your ${cycle} budget request was submitted on ${time}.`,
    },
    newSubmission: {
      subject: (d: string, c: string, r: string) => `New budget submitted: ${about(d, c, r)}`,
      heading: "A new budget request is waiting for review",
      intro: (department: string, person: string) =>
        `${person} submitted ${department}'s budget request.`,
      action: "Review it on the review dashboard.",
    },
    updatedReceipt: {
      subject: (d: string, c: string, r: string) => `Budget updated: ${about(d, c, r)}`,
      heading: "Your changes were saved",
      intro: (person: string, time: string) =>
        `${person} changed your department's request on ${time}.`,
    },
    revisionNotice: {
      subject: (d: string, c: string, r: string) => `Budget changed: ${about(d, c, r)}`,
      heading: "A budget request was changed",
      intro: (department: string, person: string) =>
        `${person} changed ${department}'s request after submitting it.`,
      action: "Review the new version.",
    },
    answerReceipt: {
      subject: (d: string, c: string, r: string) => `Answer sent: ${about(d, c, r)}`,
      heading: "Your answer was sent to the accountant",
      intro: (person: string, time: string) =>
        `${person} answered the accountant's question on ${time}. This didn't use one of your changes.`,
    },
    answerNotice: {
      subject: (d: string, c: string, r: string) => `Clarification answered: ${about(d, c, r)}`,
      heading: "Your question was answered",
      intro: (department: string, person: string) =>
        `${person} answered your question about ${department}'s request.`,
      action: "Review the answer and decide.",
    },
    reviewStarted: {
      subject: (d: string, c: string, r: string) =>
        `Your budget is being reviewed: ${about(d, c, r)}`,
      heading: "Your budget request is being reviewed",
      intro:
        "The accountant has started reviewing your request. You can't change it while it's in review.",
    },
    returned: {
      subject: (d: string, c: string, r: string) => `Question about your budget: ${about(d, c, r)}`,
      heading: "The accountant has a question",
      intro: "Your request was returned for clarification.",
      question: "The accountant's question",
      action: "Answer the question and resubmit. This doesn't use one of your changes.",
      button: "Answer the question",
    },
    returnedCopy: {
      subject: (d: string, c: string, r: string) => `Copy: question sent about ${about(d, c, r)}`,
      heading: "You returned a request for clarification",
      intro: (department: string) => `Your question was sent to ${department}'s representatives.`,
    },
    approved: {
      subject: (d: string, c: string, r: string) => `Budget approved: ${about(d, c, r)}`,
      heading: "Your budget request was approved",
      authorized:
        "The approved total, including tax, is the amount authorized for your department. It may differ from the amount you requested.",
      note: "The accountant's notes",
    },
    approvedCopy: {
      subject: (d: string, c: string, r: string) => `Copy: approved ${about(d, c, r)}`,
      heading: "You approved a budget request",
      intro: (department: string) => `${department}'s representatives were sent the approval.`,
    },
    budgetAvailable: {
      subject: (d: string, c: string) => `New budget available: ${d} ${c}`,
      heading: "A department has a new approved budget",
      intro: (department: string, cycle: string) =>
        `${department}'s ${cycle} budget was approved and is now available for spending.`,
    },
    declined: {
      subject: (d: string, c: string, r: string) => `Budget declined: ${about(d, c, r)}`,
      heading: "Your budget request was declined",
      reason: "Reason",
      action: "Nothing right now. Contact the accountant if you have questions.",
    },
    declinedCopy: {
      subject: (d: string, c: string, r: string) => `Copy: declined ${about(d, c, r)}`,
      heading: "You declined a budget request",
      intro: (department: string) => `${department}'s representatives were sent the reason.`,
    },
    reopened: {
      subject: (d: string, c: string, r: string) => `Budget reopened: ${about(d, c, r)}`,
      heading: "Your budget request was reopened",
      intro: "The accountant reopened your request so you can change it and resubmit.",
      reason: "Reason",
      action: "Change the request if needed and resubmit it. This doesn't use one of your changes.",
      button: "Open the request",
    },
    reopenedCopy: {
      subject: (d: string, c: string, r: string) => `Copy: reopened ${about(d, c, r)}`,
      heading: "You reopened a budget request",
      intro: (department: string) =>
        `${department}'s representatives can now change and resubmit it.`,
    },
  },

  /** The Emails section of a request's history (AC-58). */
  history: {
    heading: "Emails",
    intro: "Emails about this request and what happened to them.",
    none: "No emails yet.",
    to: (name: string) => `To ${name}`,
    statuses: {
      pending: "Waiting to send",
      sending: "Sending",
      sent: "Sent",
      failed: "Couldn't be sent",
    },
    at: (time: string) => `at ${time}`,
    queuedAt: (time: string) => `queued ${time}`,
  },
};
