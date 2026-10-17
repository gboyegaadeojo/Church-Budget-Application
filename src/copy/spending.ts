/**
 * Spending tracking text (FR-24 to FR-29, DRD 6.8): recording, the ledger, the dashboard,
 * amendments, alerts, the requester's panel and the year-end lock.
 */
export const spendingCopy = {
  types: { expense: "Expense", refund: "Refund" },
  methods: {
    cheque: "Cheque",
    church_card: "Church card",
    e_transfer: "E-transfer",
    cash: "Cash",
    staff_reimbursement: "Staff reimbursement",
    other: "Other",
    supplier_invoice: "Supplier invoice (EFT)",
  } as Record<string, string>,
  ledgerStatus: { recorded: "Recorded", voided: "Voided", unbudgeted: "Unbudgeted" },
  record: {
    title: "Record spending",
    intro:
      "Record money spent against a department's budget, or a refund. Approved expenses are added automatically; record only what didn't go through an expense.",
    choose: "Choose the budget year and department",
    cycle: "Budget year",
    department: "Department",
    chooseDepartment: "Choose a department",
    next: "Continue",
    change: "Change",
    locked: "Locked",
    lockedNote: (cycle: string) =>
      `Spending for ${cycle} is locked. The accountant can reopen it with a reason.`,
    type: "Type",
    spentOn: "Date paid",
    spentOnHint: (from: string, to: string) => `Between ${from} and ${to}.`,
    payee: "Payee or vendor",
    description: "What it was for",
    amount: "Amount paid (incl. tax)",
    amountHint: "As shown on the receipt. No tax is added.",
    method: "How it was paid",
    reference: "Receipt, invoice or cheque number",
    line: "Approved line",
    general: "General (no line)",
    notes: "Notes",
    overspendNote: "Overspend note",
    confirmDuplicate: "It's not a duplicate: save it anyway.",
    confirmUnbudgeted: "Record it as Unbudgeted.",
    allowOutsideYear: "Allow a date outside the spending period (accountant).",
    save: "Record",
    saved: "Recorded. Spent and Remaining are updated.",
    noBudget:
      "This department has no approved budget for this year. Entries are flagged Unbudgeted.",
  },
  edit: {
    title: "Spending entry",
    correctHeading: "Correct this entry",
    reason: "Reason for the change",
    save: "Save correction",
    saved: "Corrected. The previous values are kept in the activity log.",
    voidHeading: "Void this entry",
    voidIntro:
      "A voided entry stays in the ledger, labelled Voided, and no longer counts as spent.",
    voidReason: "Reason for voiding",
    void: "Void entry",
    voidTitle: "Void this entry?",
    voidBody: "It stays visible as Voided and is taken out of Spent. This can't be undone.",
    voided: "Voided.",
    voidedNote: (reason: string) => `Voided: ${reason}`,
    fromExpense:
      "This entry was made from an approved expense, so it's changed through the expense.",
    openExpense: "Open the expense",
    lockedNote: "The spending period is locked, so this entry can't be changed.",
    back: "Ledger",
  },
  errors: {
    typeRequired: "Choose Expense or Refund.",
    dateRequired: "Enter the date paid, like 2027-03-15.",
    payeeRequired: "Enter who was paid.",
    descriptionRequired: "Say what it was for.",
    amountInvalid: "Enter the amount paid including tax, like 112.00.",
    methodRequired: "Choose how it was paid.",
    lineInvalid: "Choose one of the department's approved lines.",
    reasonRequired: "Give a reason.",
    tooLong: (max: number) => `Keep it to ${max.toLocaleString("en-CA")} characters.`,
    notFound: "That entry doesn't exist.",
    departmentNotFound: "Choose an active department.",
    cycleNotFound: "Choose a budget cycle.",
    locked: (cycle: string) =>
      `Spending for ${cycle} is locked. The accountant can reopen it with a reason.`,
    outsideYear: (from: string, to: string) =>
      `The date must be between ${from} and ${to}, the cycle's spending period. The accountant can allow another date.`,
    duplicate:
      "An entry with the same department, amount, date and reference already exists. Tick the box to save it anyway.",
    unbudgeted:
      "This department has no approved budget for the cycle. Tick the box to record it as Unbudgeted.",
    overspendRequired: (department: string, amount: string) =>
      `This takes ${department} over budget by ${amount}. Explain why in the overspend note.`,
    fromExpense:
      "This entry was made from an approved expense. Change it through the expense, not here.",
    alreadyVoided: "This entry is already voided.",
    nothingChanged: "Nothing changed.",
  },
} as const;
