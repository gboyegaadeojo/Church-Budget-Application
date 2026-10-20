/**
 * Help and Privacy (FR-36, DRD 6.11c). Kept in step with docs/user-manual.md (checked
 * against the app 2026-10-18).
 */

export type HelpGuide = { id: string; title: string; who: string; steps: string[] };
export type HelpTopic = { id: string; question: string; answer: string[] };

export const helpCopy = {
  title: "Help",
  intro: "Short guides for each role, and answers to the usual questions.",
  yourGuides: "Guides for your roles",
  otherGuides: "Other roles",
  faqHeading: "Common questions",
  laterNote: "Spending tracking is coming later; its guide will appear here.",

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

  topics: [
    {
      id: "tax",
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
      question: "How do edits work after I submit?",
      answer: [
        "A submitted budget can be changed twice, and the 2 changes are shared by everyone who leads the department. The request page and every receipt say how many are left.",
        "You can make them while the budget is Submitted or In Review; they stop once the accountant decides. If the accountant returns it with a question, your answer doesn't use one of the changes.",
        "Every version is kept, so the accountant can see what changed.",
      ],
    },
    {
      id: "approvals",
      question: "How are budgets approved?",
      answer: [
        "The accountant reviews each department's budget and approves it as requested, approves a different total, adjusts individual items, returns it with a question, or declines it with a reason.",
        "The department sees the decision on its budget at once and is emailed. A decision can be reopened if the board reconsiders, and the earlier decision stays in the history.",
      ],
    },
    {
      id: "spending",
      question: "How is spending recorded?",
      answer: [
        "Approved expense claims and purchases are added to the spending ledger automatically, so departments see what's left on the budget strip and in My expenses.",
        "The accountant and the Church Administrator record other spending, refunds and corrections in Spending → Record spending. Department leaders see every entry in Spending → My department's spending.",
        "Each budget year can be spent until the accountant or the board closes it. The budget left unspent then goes back to the church. Annual budgets are submitted until the deadline, which is separate.",
      ],
    },
    {
      id: "notifications",
      question: "Where do I see my notifications?",
      answer: [
        "Select the bell in the top bar. Everything the app emails you also shows there, newest first, with a red number for the ones you haven't opened.",
        "Needs action shows only what's waiting for you, such as an approval or a question. Select a notification to open what it's about; it's then marked as read. On a phone, the bell opens the Notifications page.",
      ],
    },
    {
      id: "reminders",
      question: "Can I get reminders by text?",
      answer: [
        "Yes, if your Planning Center profile has a mobile number: the budget deadline, expenses waiting for your approval, approved expenses waiting to be paid and unclaimed purchases also come as a short text, between 9:00 a.m. and 8:00 p.m.",
        "Update your number in Planning Center to change it; the app picks it up overnight. Reply STOP to any text to stop them. Reminder emails always come.",
      ],
    },
    {
      id: "sign-in",
      question: "How do I sign in?",
      answer: [
        "Choose Continue with Planning Center. Department leaders need Planning Center to show them as a Group Leader.",
        "The Church Administrator and System Administrators can also choose Continue with email, and we email a 6-digit code that works once, for 10 minutes.",
        "If you see that your Planning Center profile isn't linked yet, ask the administrator to link it.",
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
        "The services that host the app, its database, its email and its backups (Netlify, Neon, Resend, Twilio, Cloudflare and Google Drive) store it for us under their own security and privacy terms. Some of them store data outside Canada, usually in the United States, where it may be subject to that country's laws.",
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
