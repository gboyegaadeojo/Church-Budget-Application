/**
 * All interface text (CLAUDE.md constraint 9, DRD 3.7a). English (Canada) only.
 * Keep wording here so it stays consistent and easy to edit.
 */
export const copy = {
  app: {
    churchName: "Immanuel Fellowship Church",
    appName: "Church Budget",
    skipToContent: "Skip to main content",
    metaDescription:
      "Annual budgets, expenses and spending for Immanuel Fellowship Church departments.",
    footerNote: "Amounts are in Canadian dollars (CAD).",
    loading: "Loading…",
  },
  roles: {
    requester: "Requester",
    accountant: "Accountant",
    backup_approver: "Backup approver",
    board_chair: "Board Chair",
    vice_chair: "Vice-Chair",
    church_admin: "Church Administrator",
    system_admin: "System Administrator",
  },
  areas: {
    home: "Home",
    annual: "Annual Budget",
    expenses: "Expenses",
    spending: "Spending",
    reports: "Reports",
    admin: "Admin",
  },
  nav: {
    myTasks: "My tasks",
    myDepartmentBudget: "My department's budget",
    reviewDashboard: "Review dashboard",
    departments: "Departments",
    decisionRelease: "Decision release",
    allBudgets: "All budgets",
    newExpense: "New expense",
    myExpenses: "My expenses",
    reviewQueue: "Review queue",
    awaitingMyApproval: "Awaiting my approval",
    readyToProcess: "Ready to process",
    allExpenses: "All expenses",
    spendingDashboard: "Spending dashboard",
    recordSpending: "Record spending",
    ledger: "Ledger",
    budgetVsActual: "Budget vs actual",
    exports: "Exports",
    analyticsAndAudit: "Analytics & Audit",
    usersAndRoles: "Users & Roles",
    budgetCycles: "Budget Cycles",
    settings: "Settings",
    notificationsAndAudit: "Notifications & Audit",
    help: "Help",
    privacy: "Privacy",
    more: "More",
    mainNavigation: "Main navigation",
    collapseSidebar: "Collapse sidebar",
    expandSidebar: "Expand sidebar",
    viewOnly: "View only",
    mobileNavigation: "Quick navigation",
    footerNavigation: "Footer",
    areaPages: (area: string) => `${area} pages`,
    allPages: "All pages",
    allPagesHint: "Everything you can open, grouped by area.",
    closeMenu: "Close",
  },
  account: {
    openMenu: "Open account menu",
    yourRoles: "Your roles",
    theme: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    emailPreferences: "Email preferences",
    away: "Away",
    signOut: "Sign out",
    comingSoon: "Coming soon",
    roleChip: (role: string, department?: string) => (department ? `${role}: ${department}` : role),
    moreDepartments: (count: number) =>
      count === 1 ? "+1 more department" : `+${count} more departments`,
  },
  home: {
    title: "Home",
    greeting: (firstName: string) => `Welcome, ${firstName}`,
    myTasks: "My tasks",
    taskCount: (count: number) => (count === 1 ? "1 task" : `${count} tasks`),
    allCaughtUp: "You're all caught up.",
    allCaughtUpDetail: "Anything that needs your action will appear here.",
    atAGlance: "At a glance",
    atAGlanceEmpty:
      "Your budget and approval summaries will appear here once a budget year is set up.",
    recentActivity: "Recent activity",
    recentActivityEmpty: "No activity yet.",
    taskBadgeLabel: (count: number) =>
      count === 1 ? "1 task waiting for you" : `${count} tasks waiting for you`,
    waiting: (days: number) =>
      days < 1 ? "Waiting since today" : days === 1 ? "Waiting 1 day" : `Waiting ${days} days`,
  },
  comingSoon: {
    title: "Coming soon",
    body: "This part of the app is being built. It will appear here in a later stage.",
    backHome: "Back to Home",
  },
  notFound: {
    title: "Page not found",
    body: "The page you were looking for does not exist or has moved.",
  },
  signIn: {
    title: "Sign in",
    heading: "Sign in to Church Budget",
    description:
      "Plan your department's annual budget, submit expenses and follow spending, all in one place.",
    continueWithPlanningCenter: "Continue with Planning Center",
    email: {
      prompt: "Not in Planning Center?",
      open: "Continue with email",
      formLabel: "Sign in with an emailed code",
      emailLabel: "Email address",
      emailHint:
        "For the Church Administrator and System Administrators. We'll email a 6-digit code to the address the church has for you.",
      sendCode: "Email me a code",
      // The same words whether or not the address has an account (AC-133).
      sent: (email: string) =>
        `If ${email} can sign in here, we've emailed it a 6-digit code. It works once, for 10 minutes. Check your junk folder if it doesn't arrive in a minute.`,
      codeLabel: "6-digit code",
      signIn: "Sign in",
      sendNewCode: "Send a new code",
      differentEmail: "Use a different email",
      invalidEmail: "Enter an email address, like name@example.com.",
      codeFormat: "Enter the 6 digits from the email.",
      wrong: (triesLeft: number) =>
        `That code isn't right. ${triesLeft === 1 ? "1 try" : `${triesLeft} tries`} left.`,
      expired: "That code has run out or was already used. Send a new code.",
      locked: (minutes: number) =>
        `Too many wrong codes. Try again in ${minutes === 1 ? "1 minute" : `${minutes} minutes`}.`,
      tooMany: (minutes: number) =>
        `Too many codes asked for. Try again in ${minutes === 1 ? "1 minute" : `${minutes} minutes`}.`,
      disabled: "Email sign-in is turned off. Use Planning Center instead.",
      unavailable: "Email sign-in isn't available right now. Please try again shortly.",
    },
    leaderNote:
      "Department leaders: your Group Leader status in Planning Center is checked when you sign in.",
    accessHeading: "Need access?",
    accessLeaders:
      "Department leaders get access once Planning Center shows them as a Group Leader. Ask your Planning Center administrator if you're not marked yet.",
    accessStaff:
      "Church staff: ask the administrator to add you and link your Planning Center profile. The Church Administrator and System Administrators can also sign in with an emailed code.",
    contact: (email: string) => `Questions? Email ${email}.`,
    privacyNote:
      "We store your name, email address and your budget activity, only to run the church's budgets.",
    error: "Sign-in didn't finish. Please try again.",
    notConfigured:
      "Sign-in isn't set up yet. The administrator needs to add the Planning Center or email settings.",
    fakeHeading: "Test sign-in",
    fakeNote: "Local development only. These people come from tests/fixtures.",
    fakeAs: (label: string) => `Sign in as ${label}`,
  },
  accessDenied: {
    pickDepartment:
      "A budget cycle is open. If you lead a department, you can choose it now and start its budget.",
    pickDepartmentAction: "Choose your department",
    title: "Can't sign you in",
    signedInWith: (email: string) => `You signed in with ${email}.`,
    useDifferentAccount: "Use a different account",
    contact: (email: string) => `If you think this is a mistake, email ${email}.`,
    contactFallback: "If you think this is a mistake, contact the church office.",
    reasons: {
      "not-found": {
        heading: "We couldn't find you in the church's Planning Center",
        body: "We couldn't read your profile in the church's Planning Center. Ask the church office to check your Planning Center profile, then sign in again.",
      },
      "not-leader": {
        heading: "Submitting budgets is for Group Leaders",
        body: "Your Planning Center profile isn't marked as a Group Leader. Ask your Planning Center administrator to update it, then sign in again.",
      },
      suspended: {
        heading: "Your Group Leader status couldn't be confirmed",
        body: "Your Group Leader status in Planning Center could not be confirmed. Your drafts are saved and will be here when your status is restored.",
      },
      waiting: {
        heading: "You're verified",
        body: "An administrator will assign your department shortly. You'll get an email when it's done.",
      },
      unavailable: {
        heading: "We can't reach Planning Center",
        body: "We can't reach Planning Center right now. Please try again shortly.",
      },
      "not-allowed": {
        heading: "This account doesn't have access",
        body: "This account isn't set up for Church Budget, or it has been turned off. Church staff: ask the administrator to add or reactivate your email address.",
      },
      "link-required": {
        heading: "Your Planning Center profile isn't linked yet",
        body: "Your Church Budget account is set up, but it isn't linked to this Planning Center profile yet. Ask the administrator to link it, then sign in again.",
      },
    },
  },
  /** The financial summary (DRD 6.4), shared by every screen and email with amounts. */
  money: {
    subtotal: "Subtotal (before tax)",
    salesTax: (rate: string) => `Sales tax (${rate})`,
    total: "Total (incl. tax)",
  },
} as const;
