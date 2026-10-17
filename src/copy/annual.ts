/**
 * Annual budget requests (FR-03 to FR-12, FR-32; DRD 6.2 to 6.5). English (Canada) only,
 * like the rest of src/copy.
 */
export const annualCopy = {
  errors: {
    noOpenCycle: "There's no budget cycle open for submissions right now.",
    cycleNotOpen: "This budget cycle isn't open for submissions.",
    deadlinePassed: (when: string) =>
      `The deadline for this department was ${when}. Ask the accountant for an extension.`,
    chooseDepartment: "Choose your department.",
    otherNameRequired: "Type your department's name.",
    otherNameTooLong: "Keep department names to 80 characters or fewer.",
    departmentInactive: "This department isn't taking budget requests. Choose another one.",
    notLeader:
      "Only verified Group Leaders can represent a department. Ask the administrator to check your Planning Center record.",
    notFound: "This budget request doesn't exist, or you don't have access to it.",
    notDraft: "This request has already been submitted.",
    notEditable: "This request can't be changed any more.",
    noEditsLeft:
      "This request has used both of its edits. Ask the accountant if another change is needed.",
    titleRequired: "Give the request a title.",
    titleTooLong: "Keep the title to 120 characters or fewer.",
    justificationRequired: "Explain what the budget is for.",
    justificationTooLong: "Keep the justification to 2,000 characters or fewer.",
    linesRequired: "Add at least one item.",
    tooManyLines: "Add up to 200 items.",
    itemNameRequired: "Name the item.",
    itemNameTooLong: "Keep item names to 200 characters or fewer.",
    quantityInvalid: "Enter a whole number from 1 to 10,000.",
    unitPriceInvalid: "Enter a price before tax, like 1,025.00 (up to $1,000,000.00).",
    linkInvalid: "Enter a web address starting with http:// or https://.",
    notesTooLong: "Keep notes to 1,000 characters or fewer.",
    zeroPriceNeedsNote: "Explain a $0.00 item in its notes.",
    idempotencyKey: "Something went wrong. Reload the page and try again.",
    hasHistory: "This request has been submitted before, so it can't be deleted.",
    nothingChanged: "Nothing has changed, so no edit was used.",
    notInMinistryDepartment:
      "Your Ministry Department in Planning Center doesn't include this department. Ask the administrator to add it.",
    // Accountant review (FR-15 to FR-18a)
    notDecidable: "This request isn't waiting for a decision.",
    proposedDepartment:
      "This department is still proposed. Ask the administrator to add it to the list or merge it into an existing department, then approve. You can still return or decline it.",
    notReopenable: "Only approved or declined requests can be reopened.",
    // Second approval (FR-34)
    notAwaitingSecond: "This request isn't waiting for a second approval.",
    sameApprover:
      "You gave the first approval, so another accountant or backup approver gives the second.",
    refuseReasonRequired: "Say why you're refusing, so the first approver can look again.",
    // Messages (FR-31)
    messageEmpty: "Write a message first.",
    messageTooLong: "Keep the message under 2,000 characters.",
    messageDraft: "Messages start once the request is submitted.",
    messageLimit:
      "You've sent a lot of messages today. Please try again tomorrow, or phone the accountant.",
    // Scheduled release (FR-19a)
    releaseAtRequired: "Choose the date and time the decisions go out.",
    releaseAtInvalid: "Enter a date and time, like 2026-12-01 09:00.",
    releaseAtFuture: "Choose a time in the future, or use Release now.",
    releaseMessageTooLong: "Keep the message under 1,000 characters.",
    notHolding: "Decisions for this cycle aren't being held.",
    releaseCycleNotOpen: "Decisions can only be held for an open cycle.",
    staleVersion:
      "The department changed this request since you opened it. Review the latest version, then decide.",
    approvedTotalInvalid: "Enter the approved total including tax, like 30,000.00.",
    approvedTotalTooLarge: "Enter an approved total of $100,000,000.00 or less.",
    approvedTotalZero: "An approved total must be more than $0.00. To approve nothing, decline.",
    noteRequired: "Add a note explaining the decision.",
    returnNoteRequired: "Write what the department needs to clarify.",
    declineReasonRequired: "Give a reason for declining.",
    reopenReasonRequired: "Give a reason for reopening.",
    reopenHasExpenses: (committed: string, spent: string, pending: string) =>
      `Expenses rely on this budget (committed ${committed}, spent ${spent}, waiting for approval ${pending}). Confirm the warning to reopen it.`,
    noteTooLong: "Keep the note to 2,000 characters or fewer.",
    boardReferenceTooLong: "Keep the board reference to 200 characters or fewer.",
    adjustmentReasonTooLong: "Keep the reason to 500 characters or fewer.",
    approvedQuantityInvalid: "Enter a whole number from 0 to 10,000.",
    approvedPriceInvalid: "Enter a price before tax, like 1,025.00 (up to $1,000,000.00).",
    linesMismatch: "The items changed since you opened this request. Reload it and try again.",
    noLineChanges:
      "No item was changed. Use Approve as requested, or change an approved quantity or price.",
  },
  /** Messages between the department and the accountant (FR-31, DRD 6.11a). */
  thread: {
    heading: "Messages",
    intro:
      "Questions and answers about this request. A message doesn't change the request or use an edit.",
    empty: "No messages yet.",
    label: "Your message",
    send: "Send",
    sent: "Message sent.",
    toAccountant: "Sends an email to the accountant.",
    toDepartment: "Sends an email to the department's representatives.",
    readOnly: "You can read the messages; only the department and the accountant write here.",
    department: "Department",
    accountant: "Accountant",
    you: "You",
    unread: (n: number) => (n === 1 ? "1 new message" : `${n} new messages`),
    count: (n: number) => `${n} of 2,000 characters`,
    linkTo: (domain: string) => `(${domain})`,
  },
  /** Second approval for large budgets (FR-34, DRD 6.7). */
  second: {
    heading: "Second approval",
    needsSecond: (amount: string) =>
      `Approvals of ${amount} or more (including tax) need a second sign-off from another accountant or backup approver.`,
    approveLabel: "Approve (needs second sign-off)",
    firstBy: (name: string, when: string) => `First approval by ${name} on ${when}.`,
    waiting: "Waiting for another accountant or backup approver to give the second approval.",
    approve: "Give second approval",
    approveTitle: "Give the second approval?",
    approveBody:
      "The budget becomes Approved for the amount above and the department is told (unless decisions are held for release).",
    refuse: "Refuse",
    refuseTitle: "Refuse the second approval?",
    refuseBody: "The budget goes back to In Review for the accountant to look at again.",
    reason: "Why you're refusing",
    ownDepartment:
      "You lead this department, so another accountant or backup approver gives the second approval.",
  },
  /** Scheduled release of decisions (FR-19a, DRD 6.7b). */
  release: {
    sharedOn: (date: string) => `Decisions will be shared on ${date}.`,
    title: "Decision release",
    intro:
      "Choose whether departments hear about approvals and declines as you decide, or all together at a set time.",
    cycle: "Budget cycle",
    noCycle: "There's no budget cycle yet.",
    show: "Show",
    cardHeading: "Decision emails",
    modeLabel: "How departments hear",
    modes: {
      immediate: "Send immediately",
      scheduled: "Hold and release on a date",
    },
    modeHints: {
      immediate: "Each approval or decline is emailed when you confirm it.",
      scheduled:
        "Decide every department first; all the decisions go out together at the time you choose. Questions (Return for clarification) are never held.",
    },
    current: {
      immediate: "Decisions are sent as soon as you confirm them.",
      holding: (when: string) =>
        `Decisions are held until ${when}. Departments won't see them before then.`,
      released: (when: string) =>
        `Decisions were released on ${when}. Decisions made now are sent straight away.`,
    },
    releaseAt: "Release date and time",
    releaseAtHint: (zone: string) => `Church time (${zone}). Emails go within 15 minutes of it.`,
    message: "Message for every release email",
    messageHint:
      "Optional, for example: Thank you for your work this year. The board approved the 2027 budget on Nov 12.",
    save: "Save",
    saved: "Saved.",
    switchedBack: (sent: number) =>
      sent === 0
        ? "Decisions are sent immediately again."
        : `Decisions are sent immediately again. ${sent === 1 ? "1 held decision was" : `${sent} held decisions were`} sent now.`,
    released: (sent: number) =>
      sent === 1 ? "1 decision email was sent." : `${sent} decision emails were sent.`,
    progress: {
      heading: "Where the cycle stands",
      approved: "Approved",
      declined: "Declined",
      undecided: "Undecided",
      notSubmitted: "Not submitted",
    },
    preview: {
      heading: "Who gets which email at release",
      none: "No decisions are waiting to be released.",
      department: "Department",
      email: "Email",
      approved: "Budget approved",
      declined: "Budget declined",
      to: "Sent to",
      leaders: "The department's leaders",
    },
    outstanding: {
      undecided: "Not decided yet",
      notSubmitted: "Not submitted yet",
      note: "Budgets decided after the release time are sent as soon as you decide them.",
    },
    releaseNow: "Release now",
    releaseNowTitle: (n: number) =>
      n === 1 ? "Send 1 decision email now?" : `Send ${n} decision emails now?`,
    releaseNowBody:
      "Every held decision goes to its department now, with your message. Decisions made after this are sent straight away. This can't be undone.",
    cancel: "Cancel schedule",
    cancelTitle: "Go back to sending immediately?",
    cancelBody: (n: number) =>
      n === 0
        ? "Nothing is held yet. Decisions will be emailed as you confirm them."
        : `The ${n === 1 ? "held decision is" : `${n} held decisions are`} sent to the departments now, and later decisions are emailed as you confirm them.`,
    readOnly: "You can see the release plan; the accountant or backup approver changes it.",
    banner: (when: string) =>
      `Decisions are held until ${when}. Departments won't see them before then.`,
    manage: "Decision release",
    heldDone: (when: string) => `The department will see it on ${when}.`,
  },
  tasks: {
    backupReminded: "Backup reminded",
    secondApproval: "Give the second approval",
    continueDraft: "Finish and submit your budget",
    respond: "Respond to the accountant's question",
    open: "Open",
    review: "Review budget request",
    reviewUpdated: "Review the changed budget request",
    reviewButton: "Review",
  },

  /** Plain-language status (DRD 7.1). */
  status: {
    draft: { label: "Draft", explain: "Not submitted yet. Your department's leaders can see it." },
    submitted: {
      label: "Submitted",
      explain: (left: number) =>
        `Sent to the accountant. You can still make changes (${left} left).`,
    },
    updated: {
      label: "Updated",
      explain: "You changed it after submitting. The accountant will see the new version.",
    },
    in_review: { label: "In Review", explain: "The accountant is reviewing it." },
    returned: {
      label: "Returned for Clarification",
      explain: "The accountant has a question. Please respond.",
    },
    awaiting_second_approval: {
      label: "Awaiting Second Approval",
      explain: "Approved by the accountant; waiting for final sign-off.",
    },
    approved: { label: "Approved", explain: "Approved. See the approved amount." },
    declined: { label: "Declined", explain: "Not approved. See the reason." },
    closed: { label: "Closed", explain: "The budget year has ended; read-only." },
  },

  /** Shown on the requester's screens to someone without the requester role. */
  deniedBody:
    "Department budgets are submitted by department leaders. If you lead a department, ask the administrator to add you.",

  dashboard: {
    title: "My department budget",
    greeting: (first: string) => `Welcome, ${first}.`,
    cycleHeading: "Budget cycle",
    cycleOpen: (name: string) => `${name} is open for submissions.`,
    deadline: (when: string) => `Deadline: ${when}`,
    daysLeft: (days: number) =>
      days <= 0 ? "Due today" : days === 1 ? "1 day left" : `${days} days left`,
    closedTitle: "Submissions are closed",
    closedBody: (contact: string) =>
      `No budget cycle is taking submissions right now. Questions? Email ${contact}.`,
    start: "Submit annual budget",
    draftSaved: "Draft saved. Continue it any time from here.",
    startAnother: "Submit a budget for another department",
    openBudget: {
      draft: "Continue draft",
      respond: "Respond",
      edit: "Edit budget",
      view: "View budget",
    },
    myRequests: "My budget requests",
    empty: "You haven't started a budget request yet.",
    needsAction: "Needs your response",
    columns: {
      request: "Request",
      department: "Department",
      status: "Status",
      total: "Total (incl. tax)",
      edits: "Edits",
    },
    untitled: "Untitled draft",
    editsLeft: (left: number) => `${left} of 2 edits left`,
    notSubmitted: "Not submitted",
    open: "Open",
  },

  start: {
    title: "Start a budget request",
    intro: "Choose the department this budget is for. You can save and come back any time.",
    year: "Budget year",
    department: "Department",
    search: "Search departments",
    searchHint: "Type to narrow the list.",
    yours: "Yours",
    fromPlanningCenter: "From Planning Center",
    restrictedEmpty:
      "Your Ministry Department in Planning Center doesn't name a department here yet. Ask the administrator to add one.",
    noMatches: "No departments match. Choose Other to type yours.",
    noMatchesRestricted: "No departments match.",
    noDepartments:
      "No departments have been set up yet. Choose Other and type your department's name.",
    other: "Other (type your department)",
    otherName: "Department name",
    otherHint: "An administrator will add this department. You can still finish and submit.",
    didYouMean: "Did you mean",
    useSuggestion: (name: string) => `Use ${name}`,
    existing: (department: string, by: string) =>
      `${department} already has a budget started by ${by}. A department submits one budget a year; you can open it and edit it.`,
    hasBudget: "Has a budget",
    lastYear: (cycle: string, reference: string | null) =>
      reference
        ? `Start from last year's request (${cycle}, ${reference})`
        : `Start from last year's request (${cycle})`,
    lastYearHint:
      "Copies the title, reasons and items into a new draft at today's tax rate. Check every item before you submit.",
    copiedNote:
      "This draft starts from last year's request, at today's tax rate. Check every item, quantity and price before you submit.",
    openIt: "Open it",
    continue: "Continue",
    noCycleTitle: "No budget cycle is open",
    noCycleBody: "There's nothing to submit right now. You'll be able to start once a cycle opens.",
    waitingNote:
      "You don't represent a department yet. Pick yours below and you'll become its representative.",
  },

  form: {
    steps: ["Request information", "Budget items", "Preview and submit"] as const,
    stepOf: (n: number, label: string) => `Step ${n} of 3: ${label}`,
    progress: "Progress",
    titleEdit: "Budget request",
    alsoEditing: (names: string) => `Also editing: ${names}`,
    department: "Department",
    proposedLabel: "New department, waiting for administrator",
    cycle: "Budget year",
    title: "Request title",
    titleHint: 'For example, "Media Team 2027 budget".',
    justification: "Why are you requesting this budget?",
    justificationHint: "Describe what the money is for and why it matters to the ministry.",
    characters: (used: number, max: number) =>
      `${used.toLocaleString("en-CA")} of ${max.toLocaleString("en-CA")} characters`,
    items: "Budget items",
    itemsIntro: (percent: string) =>
      `Enter prices before tax. ${percent}% sales tax is added to the total.`,
    item: (n: number) => `Item ${n}`,
    itemName: "Item name",
    quantity: "Quantity",
    unitPrice: "Unit price (before tax)",
    link: "Product link",
    notes: "Notes",
    notesHint: "Required for a $0.00 item.",
    lineTotal: "Line total",
    addItem: "Add item",
    itemActions: (n: number) => `Item ${n} actions`,
    linkAndNotes: "Link and notes",
    forItem: (n: number) => `for item ${n}`,
    moveUp: (n: number) => `Move item ${n} up`,
    moveDown: (n: number) => `Move item ${n} down`,
    remove: (n: number) => `Remove item ${n}`,
    removeTitle: (name: string) => `Remove ${name}?`,
    removeBody: "This item has details filled in. Removing it clears them from the request.",
    removeConfirm: "Remove item",
    unnamedItem: "this item",
    noItems: "No items yet. Add the first one.",
    next: "Next",
    back: "Back",
    toPreview: "Preview",
    saveDraft: "Save draft",
    deleteDraft: "Delete draft",
    deleteTitle: "Delete this draft?",
    deleteBody: "The draft and its items are removed. This can't be undone.",
    deleteConfirm: "Delete draft",
    saved: "Saved just now",
    savedAt: (time: string) => `Saved at ${time}`,
    saving: "Saving…",
    notSaved: "Not saved.",
    retry: "Retry",
    restored: "We restored changes from this device that hadn't been saved yet.",
    discardRestored: "Discard them",
    fixErrors: "Check the highlighted fields.",
    revisingBanner: (left: number) =>
      `Editing submitted request. This uses 1 of your ${left} remaining ${left === 1 ? "edit" : "edits"} when you confirm. Cancelling uses nothing.`,
    respondingBanner:
      "The accountant has a question. Responding to a clarification does not use one of your edits.",
    cancelEdit: "Discard changes",
    cancelEditHint: "Nothing changes on the submitted request until you confirm.",
    saveAndExit: "Save and exit",
    summary: "Financial summary",
    showBreakdown: "Show breakdown",
    hideBreakdown: "Hide breakdown",
  },

  preview: {
    heading: "Preview",
    intro: "Check everything before you submit. Use Edit to change a section.",
    requester: "Requester",
    edit: (section: string) => `Edit ${section.toLowerCase()}`,
    columns: { item: "Item", qty: "Qty", price: "Unit price", total: "Line total" },
    submit: "Confirm submission",
    submitTitle: (total: string) => `Submit ${total}?`,
    submitBody: (left: number) =>
      `The request goes to the accountant. You can still make ${left} ${left === 1 ? "change" : "changes"} before it's reviewed.`,
    submitConfirm: "Submit request",
    revise: "Save changes",
    reviseTitle: "Save these changes?",
    reviseBody: (after: number) =>
      `This uses 1 edit. ${after === 0 ? "No edits will be left" : after === 1 ? "1 edit will be left" : `${after} edits will be left`} after this one.`,
    reviseConfirm: "Use 1 edit and save",
    respond: "Send response",
    respondTitle: "Send your response?",
    respondBody: "The accountant sees your changes. This doesn't use an edit.",
    respondConfirm: "Send response",
    submitting: "Submitting…",
  },

  view: {
    reference: "Reference",
    submittedOn: "Submitted",
    version: (n: number) => `Version ${n}`,
    versionLabel: "Version",
    edit: "Edit request",
    continueDraft: "Continue draft",
    respond: "Respond",
    editsLeft: (left: number) => `${left} of 2 edits left for this request`,
    noEditsLeft: "No edits left. Ask the accountant if another change is needed.",
    readOnly: "You're viewing this request; you can't change it.",
    lines: "Items",
    noLines: "No items yet.",
    decisionHeading: {
      returned: "The accountant asked",
      declined: "Reason for declining",
      approved: "Approved budget",
    },
    accountantNote: "Accountant's note",
  },

  confirmation: {
    submitted: "Request submitted",
    revised: "Changes saved",
    responded: "Response sent",
    receipt:
      "Your request is saved. A receipt is being emailed to your department's leaders; it shows under Emails below once it's sent.",
    editsRemaining: (left: number) =>
      left === 0
        ? "No changes are left before it's reviewed."
        : `You can make ${left} ${left === 1 ? "change" : "changes"} before it's reviewed.`,
    backToDashboard: "Back to my department budget",
  },

  /** Accountant dashboard and review (FR-13 to FR-18a, DRD 6.6 and 6.7). */
  review: {
    board: {
      heading: "Board-approved church total",
      allocated: (allocated: string, total: string) =>
        `Allocated ${allocated} of ${total} board total`,
      left: (left: string) => `${left} left to allocate`,
      over: (over: string) => `${over} over the board total`,
      reference: (ref: string) => `Board reference: ${ref}`,
      warning: (after: string, over: string, total: string) =>
        `Approving this brings the year's approved budgets to ${after}, ${over} over the board total of ${total}. You can still approve it.`,
    },
    title: "Review dashboard",
    intro: "Every department's budget for the cycle, and what's waiting for you.",
    allTitle: "All budgets",
    allIntro: "Every department's budget for the cycle. You can look but not decide.",
    viewOnly: "View only",
    noCycles: "No budget cycle has been set up yet.",
    cycle: "Budget cycle",
    cycleStatus: { draft: "Not open yet", open: "Open", closed: "Closed" } as Record<
      string,
      string
    >,
    cards: {
      expected: "Departments expected",
      submitted: "Submitted",
      outstanding: "Outstanding",
      awaiting: "Awaiting review",
      returned: "Returned",
      approved: "Approved",
      declined: "Declined",
      totalRequested: "Total requested (incl. tax)",
      totalApproved: "Total approved (incl. tax)",
      decided: "Decided",
    },
    departmentsHeading: "Department completion",
    departmentsCaption: "Each expected department and where its budget is",
    columns: {
      department: "Department",
      representative: "Representative",
      status: "Status",
      submitted: "Submitted",
      requested: "Requested",
      approved: "Approved",
      action: "Next step",
      download: "Excel",
      reference: "Reference",
      requester: "Requester",
    },
    noRepresentative: "None yet",
    progress: {
      not_submitted: "Not submitted",
      draft_exists: "Draft exists",
    },
    nextStep: {
      not_submitted: "Waiting for the department",
      draft_exists: "Department is working on it",
      awaiting: "Review",
      returned: "Waiting for their answer",
      decided: "None",
    },
    queueHeading: "Review queue",
    queueCaption: "Submitted budget requests",
    filters: "Filters",
    search: "Search",
    searchHint: "Reference, department, requester or title",
    status: "Status",
    department: "Department",
    allDepartments: "All departments",
    queueFilters: {
      all: "All submitted",
      awaiting: "Awaiting review",
      returned: "Returned",
      approved: "Approved",
      declined: "Declined",
    },
    apply: "Apply",
    clear: "Clear filters",
    queueEmpty: "Nothing matches these filters.",
    queueNone: "No department has submitted yet.",
    updatedMarker: "Updated",
    open: "Open",
    review: "Review",

    // One request
    back: "Review dashboard",
    detailsHeading: "Request details",
    editsLabel: "Department edits",
    linesHeading: "Items",
    linesCaption: "Requested and approved items",
    columnsLines: {
      item: "Item",
      requested: "Requested",
      approved: "Approved",
      qty: "Qty",
      price: "Unit price",
      total: "Line total",
    },
    excluded: "Excluded",
    requested: "Requested",
    approved: "Approved",
    difference: "Difference",
    differenceLess: (amount: string) => `${amount} less than requested`,
    differenceMore: (amount: string) => `${amount} more than requested`,
    differenceNone: "Same as requested",
    adjustment: "Overall adjustment (before tax)",
    approvalHeading: "Approval",
    approvedBy: (name: string, when: string) => `Approved by ${name} on ${when}`,
    boardReference: "Board approval reference",
    note: "Note",
    conflict: "You represent this department, so another approver must decide this request.",
    readOnly: "View only: you can see this request but not decide it.",
    notDecidable: "No decision is needed now.",

    decisionHeading: "Decision",
    decisionLegend: "Choose a decision",
    kinds: {
      approve_as_requested: "Approve as requested",
      approve_different_amount: "Approve a different amount",
      approve_line_changes: "Adjust individual items",
      return: "Return for clarification",
      decline: "Decline",
    },
    kindHints: {
      approve_as_requested: "The approved total is the requested total.",
      approve_different_amount:
        "Enter the total the board approved, including tax. Items don't need to change.",
      approve_line_changes:
        "Change approved quantities or prices before tax; the app adds tax. Quantity 0 leaves an item out.",
      return: "Ask the department a question. They answer without using an edit.",
      decline: "The request becomes read-only. It can be reopened later.",
    },
    approvedTotal: "Approved total (incl. tax)",
    approvedTotalHint: "For example 30,000.00",
    includesTax: (tax: string, rate: string, subtotal: string) =>
      `Includes ${tax} sales tax (${rate}) on ${subtotal}`,
    noteRequired: "Note (required)",
    noteOptional: "Note (optional)",
    boardReferenceOptional: "Board approval reference (optional)",
    boardReferenceHint: "For example: Board minutes, Nov 12, 2026",
    returnNote: "What does the department need to clarify?",
    declineReason: "Reason for declining",
    approvedQty: (item: string) => `Approved quantity for ${item}`,
    approvedPrice: (item: string) => `Approved unit price for ${item}`,
    lineReason: (item: string) => `Reason for ${item} (optional)`,
    reviewDecision: "Review decision",
    confirm: {
      approve: "Approve this budget?",
      return: "Return for clarification?",
      decline: "Decline this budget?",
      approveBody:
        "The approved total becomes the department's budget for the year. The request is locked.",
      returnBody: "The department is asked to answer. The request stays on your dashboard.",
      declineBody:
        "The request becomes read-only. You can reopen it later if the board reconsiders.",
      approveButton: "Approve",
      returnButton: "Return request",
      declineButton: "Decline request",
    },
    done: {
      approved: "Budget approved",
      awaiting_second: "Approved; waiting for a second approval",
      second_approved: "Second approval given: budget approved",
      second_refused: "Second approval refused: back to In Review",
      returned: "Returned for clarification",
      declined: "Budget declined",
      reopened: "Budget reopened",
    } as Record<string, string>,
    emailLater: "The department has been emailed.",
    reopen: "Reopen",
    reopenTitle: "Reopen this budget?",
    reopenBody:
      "It goes back to the department as Returned for Clarification, so they can change and resubmit it. No edit is used. The current decision stays in the history.",
    reopenReason: "Reason for reopening",
    reopenExpensesWarning: (committed: string, spent: string, pending: string) =>
      `Expenses already rely on this budget: ${committed} committed, ${spent} spent and ${pending} waiting for approval. While it's reopened the department has no approved budget, so new expenses can't be started, and the new decision will change what the department has available.`,
    reopenExpensesConfirm: "I understand the new decision will change the department's available budget.",
    historyHeading: "Revision history",
    decisionsHeading: "Decisions",
    noDecisions: "No decisions yet.",
    revisionKinds: {
      submission: "Submitted",
      revision: "Edited",
      clarification_response: "Answered a question",
    },
    revisionBy: (n: number, kind: string, who: string, when: string) =>
      `Version ${n}: ${kind} by ${who}, ${when}`,
    decisionLabels: {
      approved: "Approved",
      returned: "Returned for clarification",
      declined: "Declined",
      reopened: "Reopened",
      second_approved: "Second approval",
      second_refused: "Second approval refused",
    } as Record<string, string>,
    decisionBy: (label: string, who: string, when: string, version: number) =>
      `${label} by ${who}, ${when} (version ${version})`,
    changes: {
      title: "Title changed",
      justification: "Justification changed",
      added: (item: string) => `Added ${item}`,
      removed: (item: string) => `Removed ${item}`,
      changed: (item: string, from: string, to: string) => `${item}: ${from} → ${to}`,
      total: (from: string, to: string) => `Total ${from} → ${to}`,
      none: "No changes",
    },
  },

  messages: {
    started: "Budget started.",
    saved: "Draft saved.",
    deleted: "Draft deleted.",
    submitted: "Request submitted.",
    revised: "Changes saved.",
    responded: "Response sent.",
  },
} as const;
