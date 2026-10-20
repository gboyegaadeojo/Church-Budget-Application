/** Home's dashboards for the accountant, the board and the Church Administrator (2026-10-20). */

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const things = (n: number, one: string, many: string) => `${n} ${plural(n, one, many)}`;

export const homeCopy = {
  greeting: (part: "morning" | "afternoon" | "evening", name: string) => `Good ${part}, ${name}`,
  summary: (tasks: number, oldestDays: number | null) =>
    tasks === 0
      ? "Nothing needs you right now."
      : `${tasks === 1 ? "1 thing needs" : `${tasks} things need`} you today.` +
        (oldestDays && oldestDays > 0
          ? ` The oldest has waited ${things(oldestDays, "day", "days")}.`
          : ""),
  availability: {
    primary: "Primary accountant",
    backup: "Backup approver",
    board_chair: "Board Chair",
    vice_chair: "Vice-Chair",
    available: "Available",
    away: "Away",
    awayUntil: (when: string) => `Away until ${when}`,
  },
  actions: {
    reviewQueue: "Open review queue",
    recordSpending: "Record spending",
    approvals: "Review approvals",
    pay: "Open Ready to process",
  },
  today: {
    heading: "Needs you today",
    expenses: "Expenses to approve",
    expensesDetail: (cents: string, over: number) =>
      `${cents} waiting` + (over > 0 ? ` · ${over} over budget` : ""),
    oldest: (days: number) => (days < 1 ? "New today" : `Oldest ${things(days, "day", "days")}`),
    annual: "Annual budgets to review",
    annualDetail: (updated: number) =>
      updated === 0 ? "Submitted and waiting" : `${updated} updated since submitted`,
    messages: "Messages from departments",
    messagesDetail: (n: number) => (n === 0 ? "Nothing unread" : "Unread, on budgets you review"),
    release: "Decisions to release",
    releaseDetail: (when: string | null) => (when ? `Held · release set for ${when}` : "Held"),
    releaseNone: "Nothing held",
  },
  season: {
    heading: (cycle: string) => `${cycle} budget season`,
    deadline: (when: string) => `Deadline ${when}`,
    daysLeft: (days: number) =>
      days < 0
        ? "Deadline passed"
        : days === 0
          ? "Due today"
          : `${things(days, "day", "days")} left`,
    buckets: {
      approved: "Approved",
      review: "In review",
      submitted: "Submitted",
      returned: "Returned",
      drafting: "Drafting",
      not_started: "Not started",
      declined: "Declined",
    },
    barLabel: (parts: string) => `Departments: ${parts}`,
    requested: (requested: string, board: string | null) =>
      board
        ? `Requested so far ${requested} of the board's ${board}`
        : `Requested so far ${requested}`,
    seeAll: "See every department",
  },
  pipeline: {
    heading: (cycle: string) => `Expenses in ${cycle}`,
    all: "All expenses",
    approving: "With the approvers",
    returned: "Back with the department",
    toPay: "Approved, to be paid",
    paid: "Paid",
    turnaround: (accountant: string, board: string) =>
      `Average time to the accountant's decision: ${accountant} · the Board Chair's: ${board}`,
    days: (n: number | null) => (n === null ? "not enough yet" : things(n, "day", "days")),
  },
  spending: {
    heading: (cycle: string) => `${cycle} spending`,
    boardHeading: (cycle: string) => `${cycle} against the board's approval`,
    link: "Budget vs actual",
    usedWord: "used",
    elapsed: (percent: string) => `${percent} of the year gone`,
    barLabel: (used: string, elapsed: string) =>
      `${used} of the budget used, ${elapsed} of the year gone`,
    onTrack: "On track: spending is behind the calendar.",
    ahead: "Spending is ahead of the calendar. Worth a look.",
    noBudget: "No approved budgets yet.",
    boardApproved: "Board approved",
    available: "Approved budgets",
    spent: "Spent",
    committed: "Committed",
    remaining: "Remaining",
  },
  watch: {
    heading: "Departments to watch",
    overBy: (amount: string) => `Over by ${amount}`,
    used: (percent: string) => `${percent} used`,
    empty: "Every department is within its budget.",
  },
  tasks: { seeAll: "See all", oldestFirst: "Oldest first" },
  approvals: {
    heading: "Waiting for your approval",
    together:
      "The accountant is asked at the same time. If your amounts differ, the lower one is approved.",
    count: "Expenses",
    total: "Total asked",
    oldest: "Oldest",
    days: (n: number | null) => (n === null ? "None" : n < 1 ? "Today" : things(n, "day", "days")),
    open: "Open",
    overBy: (amount: string) => `over budget by ${amount}`,
    withinBudget: "within budget",
    empty: "Nothing is waiting for your approval.",
    withChair: (chair: string | null) =>
      chair
        ? `These are with ${chair}. You can decide them while ${chair} is Away.`
        : "These are with the Board Chair. You can decide them while the Board Chair is Away.",
    covering: (chair: string | null, until: string | null) =>
      `Covering for ${chair ?? "the Board Chair"}` +
      (until ? ` until ${until}.` : " while they're Away."),
    more: (n: number) => `See all ${n}`,
  },
  years: {
    heading: "Budget years",
    link: "Budget cycles",
    submitUntil: (when: string) => `Submissions until ${when}`,
    spendUntil: (when: string) => `Spending until ${when}, then close the year`,
    empty: "No budget year is open.",
    status: { draft: "Draft", open: "Open" } as Record<string, string>,
  },
  decisions: { heading: "Your recent decisions", empty: "No decisions yet.", seeAll: "See all" },
  payments: {
    heading: "Ready to pay",
    intro: "Approved expenses waiting to be paid or bought, oldest first.",
    count: "Expenses",
    total: "Total",
    oldest: "Waiting longest",
    empty: "Nothing is waiting to be paid.",
    paidRecently: (n: number, amount: string) =>
      `Paid in the last 30 days: ${things(n, "expense", "expenses")}, ${amount}`,
    more: (n: number) => `See all ${n}`,
  },
} as const;
