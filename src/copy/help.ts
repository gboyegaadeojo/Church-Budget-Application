/**
 * Help and Privacy (FR-36, DRD 6.11c). Kept in step with docs/user-manual.md (checked
 * against the app 2026-10-18).
 */

export type HelpGuide = { id: string; title: string; who: string; steps: string[] };
export type HelpTopicGroup = "start" | "annual" | "expenses" | "budget" | "alerts" | "staff";
export type HelpTopic = { id: string; group: HelpTopicGroup; question: string; answer: string[] };

export const helpCopy = {
  title: "Help",
  intro: "Short guides for each role, and answers to the usual questions.",
  yourGuides: "Guides for your roles",
  otherGuides: "Other roles",
  faqHeading: "Common questions",
  faqIntro: "Tap a question to see the answer.",

  guides: [
    {
      id: "requester",
      title: "Department leaders: submit your annual budget",
      who: "requester",
      steps: [
        "Annual Budget → My department's budget → Submit annual budget, then choose your department. If it isn't listed, choose Other and type its name; the administrator adds it.",
        "Give the request a title and say why the ministry needs the money. If your department submitted last year, you can tick Start from last year's request to begin with last year's items.",
        "Add each item with its quantity and its unit price before tax. The app adds the line totals and the sales tax.",
        "Preview the request, then Confirm submission. You get a receipt by email with the reference number, like IFC-2027-0007.",
        "Your draft saves itself as you type, and everyone who leads the department can see and finish it.",
        "After submitting you can still make 2 changes, shared by the department, until the accountant decides. Answering a question from the accountant doesn't use one.",
        "Once submitted, use Messages on the budget to ask or answer anything else. Each message emails the other side and doesn't change the budget.",
        "If you're the department's Primary, name up to two Backups on Annual Budget, under your department's leaders. They can do everything you can, and are reminded too if a question from the accountant waits more than 3 days.",
      ],
    },
    {
      id: "requester-expenses",
      title: "Department leaders: spend your budget",
      who: "requester",
      steps: [
        "Once your annual budget is approved, Expenses → New expense. Choose Purchase request to ask before you buy, or Expense claim to be paid back for something you've bought. Then choose the department and the budget year.",
        "The budget strip shows what's Available, Committed, Spent and Remaining, and what's left after this expense.",
        "Purchase request: add items with prices before tax (the app adds the sales tax) and choose how it will be bought. You can attach a quote, invoice or photo.",
        "Expense claim: one line per receipt with the amount you paid including tax, who should be paid and how (cheque or e-transfer), and a photo or PDF of each receipt (Take photo works on a phone). If you bought something you asked for beforehand, link the purchase request.",
        "Going over budget? You'll see by how much. Explain why it's needed and you can still submit; the accountant and the Board Chair decide.",
        "Preview, then Confirm submission. You can change it until the accountant starts reviewing, or withdraw it. Every step is emailed to you and to every leader of the department, and My expenses shows where each one is.",
      ],
    },
    {
      id: "accountant",
      title: "Accountant and backup approver: review budgets",
      who: "accountant",
      steps: [
        "Annual Budget → Review dashboard shows every department, what's submitted and what's waiting. Budgets waiting for you are also in My tasks on Home.",
        "Open a budget with Review. You see the items, every earlier version and earlier decisions.",
        "Approve as requested; Approve a different amount (type the one approved total including tax, and the app works out the tax inside it); Adjust individual items (quantity 0 leaves an item out); Return for clarification with a question; or Decline with a reason.",
        "Check the summary and confirm. The department sees the decision straight away and is emailed. If an approval takes the year past the board-approved total, you're warned but can still approve.",
        "Reopen an approved or declined budget with a reason if the board reconsiders.",
        "Messages at the bottom of a review screen go to the department's representatives; the queue shows new replies. Use Return for clarification when the budget itself must change.",
        "To share every decision at once, use Decision release: choose a date and time and decide every department first. Departments see In Review until then; Release now sends everything held straight away.",
        "Download Excel from a budget, from the dashboard, or from Reports for the whole cycle.",
        "You can't decide a budget for a department you lead; another accountant or the backup approver does.",
        "Going away? Choose Away in the account menu: accountant emails go to the backup approvers until the day you're back.",
        "Expenses → Review queue: open a purchase request or claim to see its items or receipts, the receipt files and the budget now and after. Warnings show if it takes the department over budget, matches another claim or is late.",
        "Approve, approve a smaller amount (including tax), return it with a question, or decline it. The Board Chair is asked at the same time and either of you can approve first; the budget is charged once you both have, at the lower amount if they differ.",
      ],
    },
    {
      id: "board",
      title: "Board Chair and Vice-Chair",
      who: "board_chair",
      steps: [
        "When an expense is submitted, you and the accountant are both emailed and it's in My tasks. Either of you can approve first. Open it from the email or Expenses → Awaiting my approval; it works on a phone.",
        "You see the receipts, the department's budget, and the accountant's approved amount and note if they've approved. If it takes the department over budget, it says by how much, with the requester's explanation.",
        "Approve, approve a smaller amount (including tax), return it to the department with a question, or decline it with a reason. Once you both approve, the budget is charged, at the lower amount if yours differ.",
        "Going away? Choose Away in the account menu: approvals go to the Vice-Chair. The Vice-Chair also decides when the Chair leads the department or is being paid.",
      ],
    },
    {
      id: "church-admin",
      title: "Church Administrator",
      who: "church_admin",
      steps: [
        "Sign in with Planning Center, or choose Continue with email if you're not in the church's Planning Center: we email you a 6-digit code.",
        "Expenses → Ready to process lists everything with both approvals, oldest first. Start processing tells the requester it's being done.",
        "Pay or buy it outside the app, then Record payment: how it was paid, the date and the amount, with the cheque number and two signers, card digits, e-transfer reference or invoice number. The requester and payee are emailed.",
        "Spending → Ledger shows what's been spent, including every approved expense. Reports → Expenses and payments downloads the payments for bank reconciliation.",
      ],
    },
    {
      id: "admin",
      title: "System Administrator: set up the app",
      who: "system_admin",
      steps: [
        "Admin → Users & Roles: add staff by email address and give them roles. Open a person's page to link their Planning Center profile so they can sign in with Planning Center.",
        "Admin → Departments: keep the list current, set each department's Primary and Backup leaders, and handle proposed departments.",
        "Admin → Departments → a department → Add a leader: search Planning Center and add someone as Primary, Backup or Representative, even before they've signed in.",
        "Admin → Budget cycles: open the year's cycle, change its deadline with a reason, or give one department an extension.",
        "Admin → Settings: sales tax rate (applies to new submissions only), Planning Center field, sign-in options, the Primary accountant and the monthly limit on reminder texts.",
        "Admin → Settings → Branding: the logo, church and application names, and the accent colour. A colour that's too light to read is refused, with a passing shade suggested.",
        "Admin → Notifications & Audit: see every email, send failed ones again, and send a test email to check that email works.",
        "Keep at least two System Administrators, so the church never loses access.",
      ],
    },
  ] satisfies HelpGuide[],

  faqGroups: [
    { id: "start", title: "Getting started" },
    { id: "annual", title: "Your annual budget" },
    { id: "expenses", title: "Purchases and expense claims" },
    { id: "budget", title: "What's left in your budget" },
    { id: "alerts", title: "Emails, notifications and the app" },
    { id: "staff", title: "For church staff" },
  ] as const,

  topics: [
    // ---------------------------------------------------------------- Getting started
    {
      id: "what-for",
      group: "start",
      question: "What is Church Budget for?",
      answer: [
        "It's where ministries ask for their yearly budget, ask before buying something, claim back what they've paid, and see what's left, all in one place.",
        "The accountant, the Board Chair and the Church Administrator use the same app to approve, pay and keep the records, so everyone sees the same numbers.",
      ],
    },
    {
      id: "sign-in",
      group: "start",
      question: "How do I sign in?",
      answer: [
        "Choose Continue with Planning Center and sign in with your usual church account. Ministry leaders and church staff need the Ministry Leader field in Planning Center set to Yes.",
        "If you're not in the church's Planning Center (for example the Church Administrator), choose Continue with email: we email a 6-digit code that works once, for 10 minutes.",
      ],
    },
    {
      id: "cant-sign-in",
      group: "start",
      question: "It says I can't get in. What do I do?",
      answer: [
        "If it says your leader status couldn't be confirmed, ask your ministry's Planning Center administrator to set Ministry Leader to Yes on your profile, then sign in again.",
        "If it says your profile isn't linked yet, there's already an account with your email: ask a System Administrator to link it. For your security, accounts are never linked by email alone.",
        "The screen shows who to contact if you're stuck.",
      ],
    },
    {
      id: "waiting",
      group: "start",
      question: "I signed in, but it says I'm verified and waiting.",
      answer: [
        "Your Planning Center check passed. A System Administrator now adds you to your department, or gives church staff their role. You get an email when it's done.",
      ],
    },
    {
      id: "department-missing",
      group: "start",
      question: "My department isn't listed.",
      answer: [
        "When you submit your annual budget, choose Other and type the department's name. The administrator adds it, and your budget carries on.",
      ],
    },
    {
      id: "several-departments",
      group: "start",
      question: "I lead more than one department.",
      answer: [
        "You see every department you lead. Each form asks which department it's for, and My department's budget shows each one, with a card for any that has no approved budget yet.",
      ],
    },
    {
      id: "who-sees",
      group: "start",
      question: "Who can see my department's budget and expenses?",
      answer: [
        "The department's leaders, the accountant, the Board Chair and Vice-Chair, the Church Administrator and the System Administrators. Leaders of other departments can't.",
      ],
    },

    // ---------------------------------------------------------------- Annual budget
    {
      id: "deadline",
      group: "annual",
      question: "When is the deadline, and what if I miss it?",
      answer: [
        "The deadline is on Annual Budget → My department's budget, and you're reminded 7 days and 1 day before.",
        "After the deadline the form closes. If you need more time, ask the accountant: the department can be given an extension.",
      ],
    },
    {
      id: "last-year",
      group: "annual",
      question: "Can I start from last year's budget?",
      answer: [
        "Yes. If your department submitted last year, tick Start from last year's request on the first step, then change what you need.",
      ],
    },
    {
      id: "who-edits",
      group: "annual",
      question: "Who in my department can work on the budget?",
      answer: [
        "Every leader of the department: the Primary and up to two Backups. The draft saves itself as you type, so any of you can pick it up and finish it. There's one budget per department per year.",
      ],
    },
    {
      id: "tax",
      group: "annual",
      question: "How is sales tax calculated?",
      answer: [
        "You enter every price before tax. Each line total is quantity × unit price, and the subtotal is the sum of the lines.",
        "Sales tax is worked out once, on the subtotal, at the rate in force when you submit (12% unless the administrator changes it), rounded to the nearest cent. For example $1,025.00 + $123.00 tax = $1,148.00.",
        "The total includes tax. The rate is fixed on your request when you submit, so a later change of rate doesn't change it.",
        "When the accountant approves a different total, that total already includes tax: $30,000.00 approved is $26,785.71 plus $3,214.29 tax.",
      ],
    },
    {
      id: "edits",
      group: "annual",
      question: "How do edits work after I submit?",
      answer: [
        "A submitted budget can be changed twice, and the 2 changes are shared by everyone who leads the department. The request page and every receipt say how many are left.",
        "You can make them while the budget is Submitted or In Review; they stop once the accountant decides. If the accountant returns it with a question, your answer doesn't use one of the changes.",
        "Every version is kept, so the accountant can see what changed.",
      ],
    },
    {
      id: "approvals",
      group: "annual",
      question: "How are budgets approved?",
      answer: [
        "The accountant reviews each department's budget and approves it as requested, approves a different total, adjusts individual items, returns it with a question, or declines it with a reason.",
        "A decision can be reopened if the board reconsiders, and the earlier decision stays in the history.",
      ],
    },
    {
      id: "approved-yet",
      group: "annual",
      question: "How do I know my budget was approved?",
      answer: [
        "You're emailed the moment the decision is shared, it appears in your notifications, and Annual Budget → My department's budget shows it with the approved amount.",
        "Some years every department's decision is shared on the same day. Until then your budget shows In Review, even if it's already been decided.",
      ],
    },
    {
      id: "approved-less",
      group: "annual",
      question: "The accountant approved less than we asked for.",
      answer: [
        "The approved amount is one total including tax, often the figure the board agreed. The decision shows the accountant's note. Use Messages on the budget to ask about it.",
      ],
    },

    // ---------------------------------------------------------------- Expenses
    {
      id: "request-or-claim",
      group: "expenses",
      question: "Purchase request or expense claim: which do I use?",
      answer: [
        'Purchase request: ask before you buy ("May we buy 2 microphones?"). Once approved, the money is set aside for it, and the Church Administrator buys it or you buy it and then claim.',
        "Expense claim: you've already paid and want to be paid back. Add one line per receipt with a photo of each.",
      ],
    },
    {
      id: "claim-deadline",
      group: "expenses",
      question: "How long do I have to claim?",
      answer: [
        "Submit a claim within 90 days of buying. A later claim can still be sent, but it asks you to explain why it's late.",
      ],
    },
    {
      id: "receipts",
      group: "expenses",
      question: "What receipts do I need?",
      answer: [
        "A photo or PDF of every receipt, one per line of the claim. On a phone, Take photo opens the camera. Type the amount you paid, including tax.",
        "Never type bank account numbers anywhere in the app.",
      ],
    },
    {
      id: "who-approves",
      group: "expenses",
      question: "Who approves an expense?",
      answer: [
        "Both the accountant and the Board Chair, at the same time and in either order. If they approve different amounts, the lower one stands. The Vice-Chair steps in when the Chair is away or involved.",
        "Nobody approves an expense for their own department or one that pays them.",
      ],
    },
    {
      id: "where-is-it",
      group: "expenses",
      question: "Where is my expense up to?",
      answer: [
        'Expenses → My expenses lists each one with its status and What\'s needed, such as "Waiting for the Board Chair" or "The Church Administrator will process it". Every step is also emailed to you and to the department\'s other leaders.',
      ],
    },
    {
      id: "change-expense",
      group: "expenses",
      question: "Can I change or withdraw an expense?",
      answer: [
        "Yes, until the accountant starts reviewing it. If an approver returns it with a question, you can answer and change it then.",
      ],
    },
    {
      id: "over-budget",
      group: "expenses",
      question: "What if an expense takes us over budget?",
      answer: [
        "The form shows by how much. You can still submit it with an explanation; the accountant and the Board Chair decide.",
      ],
    },
    {
      id: "when-paid",
      group: "expenses",
      question: "When do I get paid back?",
      answer: [
        "Once both approvals are in, the Church Administrator pays it, usually by cheque or e-transfer, and records it. You're emailed when it's paid. If it waits more than 14 days, they're reminded.",
      ],
    },

    // ---------------------------------------------------------------- What's left
    {
      id: "budget-words",
      group: "budget",
      question: "What do Available, Committed, Pending, Spent and Remaining mean?",
      answer: [
        "Available: the approved budget, plus any change the accountant made during the year.",
        "Committed: set aside for approved purchase requests not yet bought. Pending: expenses submitted but not yet approved.",
        "Spent: paid out, including approved claims. Remaining: what the department can still spend.",
      ],
    },
    {
      id: "see-remaining",
      group: "budget",
      question: "Where can I see what's left?",
      answer: [
        "On Home, your department's card shows what's remaining: green when you're on track, amber when you're nearing the limit, red when you're over.",
        "Spending → My department's spending shows every entry, and the form for a new expense shows what's left before and after it.",
      ],
    },
    {
      id: "spending",
      group: "budget",
      question: "How is spending recorded?",
      answer: [
        "Approved expense claims and purchases are added to the spending ledger automatically, so departments see what's left on the budget strip and in My expenses.",
        "The accountant and the Church Administrator record other spending, refunds and corrections in Spending → Record spending. Department leaders see every entry in Spending → My department's spending.",
        "Each budget year can be spent until the accountant or the board closes it. The budget left unspent then goes back to the church. Annual budgets are submitted until the deadline, which is separate.",
      ],
    },
    {
      id: "year-end",
      group: "budget",
      question: "What happens at the end of the year?",
      answer: [
        "The accountant or the board closes the budget year. Spending stops, every leader is emailed, and what wasn't spent goes back to the church.",
        "An approved purchase that hasn't been bought yet can be carried into next year's budget, with a reason.",
      ],
    },

    // ---------------------------------------------------------------- Emails and alerts
    {
      id: "notifications",
      group: "alerts",
      question: "Where do I see my notifications?",
      answer: [
        "Select the bell in the top bar. Everything the app emails you also shows there, newest first, with a red number for the ones you haven't opened.",
        "Needs action shows only what's waiting for you, such as an approval or a question. Select a notification to open what it's about; it's then marked as read. On a phone, the bell opens the Notifications page.",
      ],
    },
    {
      id: "get-app",
      group: "alerts",
      question: "Can I put the app on my phone and get alerts?",
      answer: [
        "Yes. Open Get the app, at the bottom of every page or in your account menu. On an iPhone, open the app in Safari, tap Share, then Add to Home Screen. On Android, tap Install the app or choose Install app from Chrome's menu.",
        "When you open the installed app, it asks you to allow alerts; tap Allow. The same news as the bell pops up on your phone, and the app's icon shows how many you haven't read. Emails still come. On an iPhone, alerts work only in the app opened from your home screen.",
        "Alerts stay on: only a System Administrator can turn them off, for you or for the whole church. Lost a phone? Ask them to remove it.",
      ],
    },
    {
      id: "no-email",
      group: "alerts",
      question: "I'm not getting the emails.",
      answer: [
        "Check your spam or junk folder. If an email is there, mark it Not spam and add the sender to your contacts, so the rest reach your inbox.",
        "My tasks on Home always shows what needs you, emails or not. A System Administrator can check whether an email was sent.",
      ],
    },
    {
      id: "stop-emails",
      group: "alerts",
      question: "Can I turn the emails off?",
      answer: [
        "No. Every step is emailed so nobody misses a decision or an approval. The bell and phone alerts are extra copies of the same news.",
      ],
    },
    {
      id: "reminders",
      group: "alerts",
      question: "Can I get reminders by text?",
      answer: [
        "Yes, if your Planning Center profile has a mobile number: the budget deadline, expenses waiting for your approval, approved expenses waiting to be paid and unclaimed purchases also come as a short text, between 9:00 a.m. and 8:00 p.m.",
        "Update your number in Planning Center to change it; the app picks it up overnight. Reply STOP to any text to stop them. Reminder emails always come.",
      ],
    },

    // ---------------------------------------------------------------- Church staff
    {
      id: "staff-sign-in",
      group: "staff",
      question: "How do new staff get access?",
      answer: [
        "Staff in Planning Center sign in with it, like leaders; a System Administrator then gives them their role in Users & Roles. A System Administrator can also add them first, from Planning Center, so they can start straight away.",
        "Someone not in Planning Center is added by email and signs in with an emailed code.",
      ],
    },
    {
      id: "away",
      group: "staff",
      question: "I'll be away. Who approves while I'm gone?",
      answer: [
        "Choose Away in your account menu. Accountant emails and approvals go to the backup approvers, and the Board Chair's go to the Vice-Chair, until the day you're back.",
      ],
    },
    {
      id: "admin-approve",
      group: "staff",
      question: "Can the System Administrator approve or pay?",
      answer: [
        "No. The System Administrator can see everything and set the app up, but approving and paying need the matching role, such as Accountant or Church Administrator. Screens they can't act on say View only.",
      ],
    },
    {
      id: "record-payment",
      group: "staff",
      question: "How does the Church Administrator record a payment?",
      answer: [
        "Expenses → Ready to process, then Start processing. Pay or buy it outside the app, then Record payment: how it was paid, the date and the amount. A cheque needs its number and two signers from the signing authorities in Settings.",
        "The expense becomes Paid or Purchased, the requester is emailed, and the spending ledger updates by itself.",
      ],
    },
    {
      id: "mistakes",
      group: "staff",
      question: "Can a mistake be deleted?",
      answer: [
        "Nothing with financial history is deleted. A spending entry is corrected or voided with a reason, a decision can be reopened, and every change is kept in the activity log with who made it and why.",
      ],
    },
    {
      id: "exports",
      group: "staff",
      question: "Can I get the numbers in Excel?",
      answer: [
        "Yes. Reports has downloads for annual budgets, expenses and payments, and spending. A single budget can be downloaded from its page too.",
      ],
    },
  ] satisfies HelpTopic[],

  panel: {
    taxLink: "How is tax calculated?",
    close: "Close help",
    more: "More help",
  },

  myInfo: {
    heading: "Your personal information",
    intro:
      "You can ask to see the personal information the app holds about you, or to correct it. The administrator handles your request and replies by email.",
    kind: "What would you like?",
    kinds: { see: "See my information", correct: "Correct my information" },
    details: "Details",
    detailsHint:
      "For a correction, say what's wrong and what it should be. Financial records, such as budgets and decisions, are kept for the retention period and aren't deleted on request.",
    send: "Send request",
    sent: "Your request was sent to the administrator. They'll reply by email.",
    alreadySent:
      "You've already sent a request today. The administrator will reply by email; you can send another tomorrow.",
    errors: {
      kind: "Choose what you'd like.",
      detailsRequired: "Say what should be corrected.",
      detailsLong: "Keep the details under 2,000 characters.",
    },
  },
} as const;

export const privacyCopy = {
  title: "Privacy notice",
  updated: "Last updated October 18, 2026",
  backToApp: "Back to the app",
  backToSignIn: "Back to sign in",
  intro: (church: string, app: string) =>
    `${church} uses ${app} to plan and approve its ministry budgets. This notice explains what personal information the app holds, why, who can see it, how long it is kept and how to reach us. We handle it in line with Canada's privacy law (PIPEDA) and the privacy principles it sets out.`,
  sections: [
    {
      heading: "What we hold",
      items: [
        "Your name and email address, your roles in the app and the departments you lead.",
        "If you sign in with Planning Center: your Planning Center person number, whether Planning Center shows you as a Group Leader, the value of that field and when it was last checked. We also copy your mobile number from Planning Center, if it has one, to text you reminders. We don't copy anything else from Planning Center.",
        "What you do in the app: budget requests, their items and versions, decisions, and the emails the app sends you.",
        "An activity log of sign-ins and changes, with a scrambled (hashed) form of your internet address. We never store the address itself, and we never store passwords.",
        "If you sign in with an emailed code, only a scrambled form of the code, which stops working after 10 minutes.",
      ],
    },
    {
      heading: "Why we hold it",
      items: [
        "To let you sign in, to check that department leaders are Group Leaders, and to send you the emails about your budgets and reminder texts. Reply STOP to any text to stop them; reminder emails still come.",
        "To keep a complete and accurate record of the church's budgets and decisions, as a registered charity must.",
        "We don't sell your information, use it for advertising, or use it for anything unrelated to the church's budgets.",
      ],
    },
    {
      heading: "Who can see it",
      items: [
        "Department leaders see their own department's budgets.",
        "The accountant and backup approver see the budgets they review. The Board Chair and Vice-Chair can follow them.",
        "System Administrators can see everything, to run and support the app.",
        "The services that host the app, its database, its email and its backups (Netlify, Neon, Resend, Twilio, Cloudflare and Google Drive) store it for us under their own security and privacy terms. Some of them store data outside Canada, usually in the United States, where it may be subject to that country's laws. If you turn on phone alerts, your phone's push service (Apple, Google, Mozilla or Microsoft) carries each alert to your device, encrypted; the app keeps only that device's push address, until you turn alerts off.",
      ],
    },
    {
      heading: "How long we keep it",
      items: [
        "Budget records, decisions and the activity log are kept for at least six years, in line with the Canada Revenue Agency's recordkeeping rules for charities. They aren't deleted on request, because the church must keep them.",
        "If you stop serving, your account is turned off; your name stays on the records you were part of.",
        "Encrypted backups are kept in the church's private storage.",
      ],
    },
    {
      heading: "Your choices",
      items: [
        "You can ask to see the information we hold about you, or to correct it, from the Help page or by emailing us. We reply within 30 days.",
        "If you're not satisfied with our answer, you can contact the Office of the Privacy Commissioner of Canada at priv.gc.ca.",
      ],
    },
  ],
  contactHeading: "Contact",
  contact: (email: string) => `Questions about your information? Email ${email}.`,
  contactFallback: "Questions about your information? Contact the church office.",
  askOnHelp: "Signed in? Use the form on the Help page.",
} as const;
