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
      message: "New message",
      awaitingSecond: "Awaiting final sign-off",
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
    clarifyReminder: {
      subject: (d: string, c: string, r: string) =>
        `Reminder: a question is waiting: ${about(d, c, r)}`,
      heading: "The accountant is waiting for your answer",
      intro: (days: number) =>
        `The accountant asked a question about your budget ${days === 1 ? "a day" : `${days} days`} ago.`,
      backupIntro: (days: number) =>
        `The accountant asked a question about your department's budget ${days} days ago and it hasn't been answered yet. As a Backup, you can answer it too.`,
      action: "Answer the question and resubmit. This doesn't use one of your changes.",
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
      heldIntro: (department: string, release: string) =>
        `Decisions are held: ${department}'s representatives will be sent the approval on ${release}.`,
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
      heldIntro: (department: string, release: string) =>
        `Decisions are held: ${department}'s representatives will be sent the reason on ${release}.`,
    },
    /** Second approval for large budgets (FR-34). */
    awaitingSecond: {
      subject: (d: string, c: string, r: string) => `Awaiting final sign-off: ${about(d, c, r)}`,
      heading: "Approved by the accountant, awaiting final sign-off",
      intro:
        "The accountant has approved your budget. Because of its size, a second accountant signs it off before it's final. You'll be emailed the approved amount then.",
    },
    secondNeeded: {
      subject: (d: string, c: string, r: string) => `Second approval needed: ${about(d, c, r)}`,
      heading: "A budget needs your second approval",
      intro: (person: string, department: string) =>
        `${person} approved ${department}'s budget. It's at or above the second-approval amount, so it needs a second sign-off from someone else.`,
      action:
        "Open it, check the approved amount, and give the second approval or refuse it with a reason.",
      button: "Review the approval",
    },
    secondRefused: {
      subject: (d: string, c: string, r: string) => `Second approval refused: ${about(d, c, r)}`,
      heading: "The second approval was refused",
      intro: (person: string) =>
        `${person} refused the second approval. The budget is back In Review.`,
      reason: "Reason",
      action: "Look at the budget again and decide.",
    },
    /** A message on a request (FR-31, AC-59). */
    message: {
      subjectToDepartment: (d: string, c: string, r: string) =>
        `New message from the accountant: ${about(d, c, r)}`,
      subjectToAccountant: (d: string, c: string, r: string) =>
        `New message from ${d}: ${about(d, c, r)}`,
      heading: "You have a new message",
      intro: (person: string) => `${person} wrote:`,
      label: "Message",
      action:
        "Reply on the request's page if you need to. A message doesn't change the request or use an edit.",
      button: "Open the messages",
    },
    /** The shared message the accountant adds to every release email (FR-19a). */
    releaseMessage: "A message from the accountant",
    /** Scheduled release (FR-19a): warnings and the summary for the accountant. */
    releaseWarning: {
      subject: (cycle: string, release: string) =>
        `${cycle} decisions go out ${release}: some departments aren't decided`,
      heading: "Some departments aren't decided yet",
      intro: (cycle: string, release: string) =>
        `${cycle} decisions are scheduled to go out on ${release}.`,
      undecided: "Submitted, not decided yet",
      notSubmitted: "Not submitted",
      action:
        "Decide the rest before then, or change the schedule. Decided budgets go out at the scheduled time; budgets decided later are sent straight away.",
      button: "Open Decision release",
    },
    released: {
      subject: (cycle: string, count: number) =>
        `${cycle} decisions released: ${count} ${plural(count, "email", "emails")} sent`,
      heading: "Budget decisions were released",
      intro: (cycle: string, time: string) =>
        `${cycle} decisions were released to the departments on ${time}.`,
      released: "Released",
      undecided: "Still to decide (sent as soon as you decide)",
      notSubmitted: "Not submitted",
      action: noAction,
      button: "Open Decision release",
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

  /** Shared labels for notices. */
  facts: {
    department: "Department",
    person: "Person",
    email: "Email",
    cycle: "Budget year",
    deadline: "Deadline",
    previousDeadline: "Previous deadline",
    newDeadline: "New deadline",
    roles: "Roles",
    previousRoles: "Previous roles",
    slot: "Role in the department",
    reason: "Reason",
  },
  statuses: {
    actionNeeded: "Action needed",
    forYourRecords: "For your records",
    open: "Open for submissions",
    closed: "Closed",
    reopened: "Reopened",
    deadlineChanged: "Deadline changed",
    reminder: "Reminder",
    deadlinePassed: "Deadline passed",
  },
  buttons: {
    openDepartment: "Open the department",
    openDepartments: "Open Departments",
    openSettings: "Open Settings",
    openUsers: "Open Users",
    openPerson: "Open the person",
    startBudget: "Start your budget",
    openBudget: "Open your budget",
    openApp: "Open the app",
    openDashboard: "Open the review dashboard",
    signIn: "Sign in",
  },

  /** FR-03, FR-38: departments and their leaders. */
  departments: {
    leaderJoined: {
      subject: (person: string, department: string) => `${person} joined ${department}`,
      heading: "A leader joined a department",
      intro: (person: string, department: string, slot: string) =>
        `${person} picked ${department} on the budget form and is now its ${slot}.`,
      action:
        "Nothing, unless they shouldn't represent it. You can remove them on the department page.",
    },
    leaderSuggested: {
      subject: (person: string, department: string) => `Confirm ${person} for ${department}`,
      heading: "Planning Center suggests a leader",
      intro: (person: string, department: string, source: string) =>
        `${person} leads ${source} in Planning Center, which is linked to ${department}. They can't act for the department until you add them.`,
      action: "Open the department and choose Add or Ignore.",
    },
    proposed: {
      subject: (name: string) => `New department proposed: ${name}`,
      heading: "A leader proposed a new department",
      intro: (person: string, name: string) =>
        `${person} typed "${name}", which isn't on the department list. Budgets for it can't be approved until you decide.`,
      action:
        "Add it to the list, merge it into an existing department, or reject it with a reason.",
    },
    accepted: {
      subject: (name: string) => `${name} was added to the department list`,
      heading: "Your department was added",
      intro: (name: string) =>
        `The administrator added ${name} to the department list, so its budget can now be reviewed.`,
    },
    merged: {
      subject: (from: string, into: string) => `${from} is now part of ${into}`,
      heading: "Your department was merged",
      intro: (from: string, into: string) =>
        `The administrator merged ${from} into ${into}. Your budget and your place as a leader moved to ${into}.`,
    },
    rejected: {
      subject: (name: string) => `${name} wasn't added to the department list`,
      heading: "Your proposed department wasn't added",
      intro: (name: string) =>
        `The administrator didn't add ${name}. Any budget for it is back in Draft so you can pick a listed department.`,
      action: "Open your budget and choose a department from the list.",
    },
    assigned: {
      subject: (department: string) => `You now represent ${department}`,
      heading: "Your department role changed",
      intro: (department: string, slot: string) => `You are now ${slot} for ${department}.`,
    },
    removed: {
      subject: (department: string) => `You no longer represent ${department}`,
      heading: "You were removed from a department",
      intro: (department: string) =>
        `The administrator removed you from ${department}. Its budgets stay with the department.`,
    },
    backupNominated: {
      subject: (person: string, department: string) =>
        `${person} was made a Backup for ${department}`,
      heading: "A Primary named a Backup",
      intro: (primary: string, person: string, department: string, slot: string) =>
        `${primary}, the Primary for ${department}, made ${person} its ${slot}.`,
      action: "Nothing, unless it's a mistake: then change it on the department's page.",
    },
    backupPromoted: {
      subject: (person: string, department: string) => `${person} is now Primary for ${department}`,
      heading: "A Backup became Primary",
      intro: (person: string, department: string, why: string) =>
        `${why}, so ${person}, the Backup, is now Primary for ${department}.`,
      action: "Check the department still has the Backups it needs.",
    },
  },

  /** FR-21 "Cycle and reminders", 4.3. */
  cycles: {
    opened: {
      subject: (cycle: string) => `${cycle} budgets are open`,
      heading: (cycle: string) => `${cycle} budget requests are open`,
      intro: (deadline: string) => `Please submit your department's budget by ${deadline}.`,
      action: "Start your department's budget before the deadline.",
    },
    reopened: {
      subject: (cycle: string) => `${cycle} budgets are open again`,
      heading: (cycle: string) => `${cycle} budget requests reopened`,
      intro: (deadline: string) =>
        `The administrator reopened submissions. The new deadline is ${deadline}.`,
      action: "Submit or change your department's budget before the new deadline.",
    },
    closed: {
      subject: (cycle: string) => `${cycle} budgets are closed`,
      heading: (cycle: string) => `${cycle} budget requests are closed`,
      intro: "Submissions are closed. Budgets already submitted continue through review.",
    },
    deadlineChanged: {
      subject: (cycle: string, deadline: string) => `${cycle} deadline changed to ${deadline}`,
      heading: "The budget deadline changed",
      intro: (deadline: string) => `Your department's budget is now due by ${deadline}.`,
      action: "Submit your department's budget before the new deadline.",
    },
    extended: {
      subject: (department: string, deadline: string) =>
        `${department} has until ${deadline} for its budget`,
      heading: "Your department has more time",
      intro: (department: string, deadline: string) =>
        `${department}'s budget is now due by ${deadline}.`,
      action: "Submit your department's budget before the new deadline.",
    },
    reminder: {
      subject: (cycle: string, days: number) =>
        days === 1 ? `${cycle} budget due tomorrow` : `${cycle} budget due in ${days} days`,
      heading: (days: number) =>
        days === 1 ? "Your budget is due tomorrow" : `Your budget is due in ${days} days`,
      intro: (department: string, deadline: string) =>
        `${department} hasn't submitted its budget yet. It's due by ${deadline}.`,
      action: "Finish and submit your department's budget.",
    },
    deadlinePassed: {
      subject: (cycle: string, count: number) =>
        `${cycle} deadline passed: ${count} ${plural(count, "department", "departments")} outstanding`,
      heading: "The budget deadline has passed",
      intro: (deadline: string) =>
        `The deadline was ${deadline}. Some departments haven't submitted a budget.`,
      listHeading: "Not submitted",
      action: "Follow up with these departments, or give one more time on the cycle page.",
    },
  },

  /** FR-01a, FR-21 "System", DRD 7.5 "role change". */
  access: {
    staffAdded: {
      subject: (app: string) => `You have access to ${app}`,
      heading: "You have access",
      intro: (app: string, church: string) =>
        `An administrator gave you access to ${app} for ${church}. Sign in with Planning Center.`,
      emailCodeToo:
        "You can also choose Continue with email on the sign-in page, and we'll send a 6-digit code to this address.",
    },
    signInCode: {
      subject: (app: string) => `Your ${app} sign-in code`,
      heading: "Your sign-in code",
      intro: (app: string) => `Use this code to sign in to ${app}:`,
      codeLabel: "Code",
      expiresLabel: "Works until",
      action:
        "Enter the code on the sign-in page. It works once, for 10 minutes. If you didn't ask for it, ignore this email: nobody can sign in without the code.",
    },
    rolesChanged: {
      subject: "Your roles changed",
      heading: "Your roles changed",
      intro: "An administrator changed what you can do in the app.",
      noRoles: "None",
    },
    newLeaderWaiting: {
      subject: (person: string) => `${person} is waiting for a department`,
      heading: "A new leader needs a department",
      intro: (person: string) =>
        `${person} signed in for the first time as a verified Group Leader, but Planning Center doesn't say which department they lead.`,
      action: "Assign them to their department.",
    },
    leaderSuspended: {
      subject: (person: string) => `${person}'s requester access is suspended`,
      heading: "A requester is no longer a Group Leader",
      intro: (person: string) =>
        `Planning Center no longer lists ${person} as a Group Leader, so they can't use requester features. Their drafts and history are kept, and other roles are unaffected.`,
      action: "Nothing, unless this is a mistake: then fix their Planning Center record.",
    },
    pcoUnavailable: {
      subject: "Planning Center couldn't be reached",
      heading: "The nightly Planning Center check didn't run",
      intro:
        "The app couldn't reach Planning Center, so nobody's Group Leader status changed. Leaders keep access for up to 72 hours while it's down.",
      action:
        "If this happens again tomorrow, check the Planning Center settings and access token.",
    },
    privacyRequest: {
      subject: (person: string) => `Privacy request from ${person}`,
      heading: "Someone asked about their personal information",
      intro: {
        see: (person: string) =>
          `${person} asked to see the personal information the app holds about them.`,
        correct: (person: string) => `${person} asked to correct their personal information.`,
      },
      kind: "Request",
      kinds: { see: "See my information", correct: "Correct my information" },
      details: "Their details",
      action:
        "Reply to them by email within 30 days. Correct what's wrong in Users & Roles; financial records are kept and aren't deleted on request.",
    },
    accessRequest: {
      subject: (who: string) => `Access request: ${who}`,
      heading: "Someone tried to sign in without access",
      intro: (method: string) => `They signed in with ${method} but have no access.`,
      action: "If they should have access, add them in Users. Otherwise, nothing.",
    },
    primaryAccountantCleared: {
      subject: "Choose a new Primary accountant",
      heading: "The Primary accountant was cleared",
      intro: (person: string) =>
        `${person} is no longer the Primary accountant, so new-submission emails go to every accountant until you choose one.`,
      action: "Choose a Primary accountant in Settings.",
    },
  },

  /** FR-21 "Email delivery failed after retries". */
  failureDigest: {
    subject: (count: number) => `${count} ${plural(count, "email", "emails")} couldn't be sent`,
    heading: "Some emails couldn't be sent",
    intro: "These emails failed after every retry. The changes they describe are saved.",
    listHeading: "Not sent",
    item: (subject: string, to: string, error: string) => `${subject} (to ${to}): ${error}`,
    action: "Check the addresses and the Resend settings.",
  },

  /** Admin → Notifications & Audit: the email log (FR-21). */
  admin: {
    title: "Notifications & Audit",
    intro:
      "Every email the app has sent or tried to send. Emails that can't go are retried for about three days, then shown here as Couldn't be sent.",
    countsLabel: "Emails by status",
    filtersLabel: "Filter emails",
    statusFilter: "Status",
    allStatuses: "All",
    search: "Search subject or recipient",
    apply: "Show",
    clear: "Clear",
    logHeading: "Email log",
    empty: "No emails match.",
    none: "No emails yet.",
    truncated: "Showing the newest 100. Narrow the search to see older ones.",
    columns: {
      email: "Email",
      to: "To",
      status: "Status",
      tries: "Tries",
      when: "When",
    },
    queued: (time: string) => `Queued ${time}`,
    sent: (time: string) => `Sent ${time}`,
    nextTry: (time: string) => `Next try ${time}`,
    retry: "Send again",
    retryLabel: (subject: string, to: string) => `Send "${subject}" to ${to} again`,
    retryAll: "Send all failed again",
    retryAllHint:
      "Use this after fixing the Resend settings. Each email gets a fresh set of retries.",
    retried: (n: number) => `${n} ${plural(n, "email", "emails")} will be sent again.`,
    nothingToRetry: "There are no failed emails to send again.",
    openRequest: "Open request",
    activityNote: "Every change in the app, not only emails, is in the activity log.",
    activityLink: "Open the activity log",
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
