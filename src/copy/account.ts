/** Account settings: email preferences and Away (FR-21, FR-33, FR-38, DRD 6.11b). */
export const accountCopy = {
  title: "Account settings",
  intro: "Your own settings. The theme is in the account menu.",
  email: {
    heading: "Email preferences",
    intro: "Choose which optional emails you get. Nothing you change here affects anyone else.",
    reminders: "Reminders",
    remindersHint:
      "Deadline reminders, reminders to answer the accountant's question, and the accountant's list of departments still to submit.",
    copies: "Copies of my own decisions",
    copiesHint:
      "A copy for your records when you approve, decline, return or reopen a request. The department is always emailed.",
    digest: "New submissions and revisions",
    digestHint:
      "One daily email arrives early each morning with everything since the last one. The review dashboard always shows them straight away.",
    instant: "Each one as it arrives",
    daily: "One email a day",
    waiting: (count: number) =>
      count === 1
        ? "1 update is waiting for your next daily email."
        : `${count} updates are waiting for your next daily email.`,
    alwaysHeading: "Always sent",
    always: [
      "Receipts when your department submits or changes a budget",
      "Decisions: approved, declined, returned for clarification, reopened",
      "Messages on a request",
      "Changes to your roles, departments and sign-in",
    ],
    save: "Save email preferences",
    saved: "Email preferences saved.",
  },
  away: {
    heading: "Away",
    intro:
      "While you're away, accountant emails go to the backup approvers instead, and the dashboards say who is covering. You can still sign in and work as usual.",
    from: "Away from",
    fromHint: "Leave as today to start now.",
    until: "Back on",
    untilHint: "Optional. Emails come back to you from this day.",
    save: "Set Away",
    update: "Save dates",
    off: "Turn off Away",
    offTitle: "Turn off Away?",
    offBody: "Accountant emails come back to you straight away.",
    saved: "Away is set.",
    cleared: "Away is off. Emails come back to you.",
    now: (until: string | null) =>
      until ? `You're away until ${until}.` : "You're away until you turn it off.",
    planned: (from: string, until: string | null) =>
      until ? `You'll be away from ${from} until ${until}.` : `You'll be away from ${from}.`,
    notAway: "You're not away.",
    covering: (names: string) => `While you're away, accountant emails go to ${names}.`,
    noCover:
      "Nobody else has the Accountant or Backup approver role, so emails keep coming to you. Ask the administrator to add a backup approver.",
    notForYou: "Away is for the accountant and backup approvers.",
  },
  department: {
    heading: "Away",
    intro:
      "When you're away, reminders go to your Backups straight away, and the department shows who is covering.",
    save: "Set Away",
    off: "Turn off Away",
    covered: (names: string, until: string | null) =>
      until ? `Covered by ${names} until ${until}.` : `Covered by ${names}.`,
    noBackup: "Name a Backup first, so someone can cover while you're away.",
    saved: "Away is set. Your Backups are covering.",
    cleared: "Away is off.",
  },
  coverage: {
    accountant: (who: string, until: string | null, covering: string) =>
      until
        ? `${who} is away until ${until}. Accountant emails go to ${covering}.`
        : `${who} is away. Accountant emails go to ${covering}.`,
  },
  errors: {
    fromInvalid: "Enter the first day you're away.",
    untilInvalid: "Enter the day you're back.",
    untilAfterFrom: "The day you're back must be after the first day away.",
    untilPast: "The day you're back must be in the future.",
    notPrimary: "Only the department's Primary can be marked Away.",
  },
} as const;
