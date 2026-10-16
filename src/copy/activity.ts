/**
 * The activity log (FR-22, FR-52 Activity tab, DRD 6.13): plain-language names for every
 * audit event, the groups the filters use, and the page's text.
 */

export const ACTIVITY_GROUPS = [
  "requests",
  "decisions",
  "money",
  "access",
  "settings",
  "emails",
  "exports",
] as const;
export type ActivityGroup = (typeof ACTIVITY_GROUPS)[number];

type Entry = { label: string; group: ActivityGroup };

/** Every event the app writes. An unknown type still shows, worded from its name. */
export const ACTIVITY_EVENTS: Record<string, Entry> = {
  // Annual budgets
  "annual.draft_started": { label: "Started a draft budget", group: "requests" },
  "annual.draft_saved": { label: "Saved the draft", group: "requests" },
  "annual.draft_deleted": { label: "Deleted a draft", group: "requests" },
  "annual.submitted": { label: "Submitted the budget", group: "requests" },
  "annual.revised": { label: "Changed the submitted budget", group: "requests" },
  "annual.clarification_answered": {
    label: "Answered the accountant's question",
    group: "requests",
  },
  "annual.returned_to_draft": { label: "Budget went back to draft", group: "requests" },
  "annual.review_started": { label: "Started the review", group: "decisions" },
  "annual.approved": { label: "Approved the budget", group: "decisions" },
  "annual.returned": { label: "Returned the budget with a question", group: "decisions" },
  "annual.declined": { label: "Declined the budget", group: "decisions" },
  "annual.reopened": { label: "Reopened the decision", group: "decisions" },
  "annual.decision_released": {
    label: "Released the decision to the department",
    group: "decisions",
  },
  "annual.release_scheduled": { label: "Scheduled the release of decisions", group: "decisions" },
  "annual.release_cancelled": { label: "Cancelled the scheduled release", group: "decisions" },
  "annual.released_now": { label: "Released the held decisions now", group: "decisions" },
  "annual.exported": { label: "Exported annual budgets to Excel", group: "exports" },
  // Sign-in and access
  "access.sign_in_succeeded": { label: "Signed in", group: "access" },
  "access.sign_in_failed": { label: "Sign-in refused", group: "access" },
  "access.signed_out": { label: "Signed out", group: "access" },
  "access.sign_in_code_requested": { label: "Asked for a sign-in code", group: "access" },
  "access.sign_in_code_wrong": { label: "Typed a wrong sign-in code", group: "access" },
  "access.sign_in_code_locked": {
    label: "Sign-in codes locked after wrong tries",
    group: "access",
  },
  "access.sign_in_code_limited": { label: "Too many sign-in codes asked for", group: "access" },
  "access.denied": { label: "Tried a page or action their roles don't allow", group: "access" },
  "access.identity_linked": { label: "Linked a Planning Center profile", group: "access" },
  "access.identity_unlinked": { label: "Unlinked a Planning Center profile", group: "access" },
  "access.leader_granted": { label: "Confirmed as a Group Leader", group: "access" },
  "access.leader_suspended": {
    label: "Group Leader status not confirmed: suspended",
    group: "access",
  },
  "access.leader_restored": { label: "Group Leader status restored", group: "access" },
  "access.pco_unavailable": { label: "Planning Center couldn't be reached", group: "access" },
  "access.pco_verification_run": { label: "Nightly Planning Center check ran", group: "access" },
  "access.privacy_requested": { label: "Asked about their personal information", group: "access" },
  // Administration
  "admin.user_added": { label: "Added a staff member", group: "settings" },
  "admin.roles_changed": { label: "Changed someone's roles", group: "settings" },
  "admin.user_deactivated": { label: "Deactivated an account", group: "settings" },
  "admin.user_reactivated": { label: "Reactivated an account", group: "settings" },
  "admin.department_added": { label: "Added a department", group: "settings" },
  "admin.department_proposed": { label: "Proposed a new department", group: "settings" },
  "admin.department_accepted": { label: "Accepted a proposed department", group: "settings" },
  "admin.department_merged": { label: "Merged a proposed department", group: "settings" },
  "admin.department_merge_moved": {
    label: "Moved a request to the merged department",
    group: "settings",
  },
  "admin.department_rejected": { label: "Rejected a proposed department", group: "settings" },
  "admin.department_deactivated": { label: "Deactivated a department", group: "settings" },
  "admin.department_reactivated": { label: "Reactivated a department", group: "settings" },
  "admin.department_renamed": { label: "Renamed a department", group: "settings" },
  "admin.department_leader_joined": { label: "Joined a department as a leader", group: "settings" },
  "admin.department_leader_changed": { label: "Changed a department's leaders", group: "settings" },
  "admin.department_leader_removed": { label: "Removed a department leader", group: "settings" },
  "admin.department_backup_promoted": { label: "Backup became Primary", group: "settings" },
  "admin.department_pco_value_changed": {
    label: "Changed a department's Planning Center value",
    group: "settings",
  },
  "admin.pco_department_no_longer_listed": {
    label: "Planning Center no longer lists a department",
    group: "settings",
  },
  "admin.pco_department_listed_again": {
    label: "Planning Center lists a department again",
    group: "settings",
  },
  "admin.pco_person_tested": { label: "Tested a person in Planning Center", group: "settings" },
  "admin.pco_person_searched": {
    label: "Searched Planning Center for a person",
    group: "settings",
  },
  "admin.cycle_created": { label: "Created a budget cycle", group: "settings" },
  "admin.cycle_opened": { label: "Opened a budget cycle", group: "settings" },
  "admin.cycle_closed": { label: "Closed a budget cycle", group: "settings" },
  "admin.cycle_reopened": { label: "Reopened a budget cycle", group: "settings" },
  "admin.cycle_deadline_changed": { label: "Changed the submission deadline", group: "settings" },
  "admin.deadline_extended": { label: "Gave a department an extension", group: "settings" },
  "admin.tax_rate_changed": { label: "Changed the sales tax rate", group: "money" },
  "admin.settings_changed": { label: "Changed settings", group: "settings" },
  "admin.signin_settings_changed": {
    label: "Changed sign-in and Planning Center settings",
    group: "settings",
  },
  "admin.primary_accountant_changed": { label: "Chose the Primary accountant", group: "settings" },
  "admin.primary_accountant_cleared": { label: "Primary accountant cleared", group: "settings" },
  "admin.signer_added": { label: "Added a cheque signer", group: "settings" },
  "admin.signer_edited": { label: "Changed a cheque signer", group: "settings" },
  "admin.signer_removed": { label: "Removed a cheque signer", group: "settings" },
  "admin.emails_retried": { label: "Sent failed emails again", group: "emails" },
  "admin.activity_exported": { label: "Exported the activity log to Excel", group: "exports" },
  // Email
  "notifications.email_sent": { label: "Email sent", group: "emails" },
  "notifications.email_failed": { label: "Email couldn't be sent", group: "emails" },
};

/** "admin.department_backup_promoted" → "Department backup promoted", for a type not listed. */
export function activityLabel(eventType: string): string {
  const known = ACTIVITY_EVENTS[eventType]?.label;
  if (known) return known;
  const words = eventType.split(".").slice(1).join(" ").replace(/_/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : eventType;
}

export function activityGroup(eventType: string): ActivityGroup | null {
  return ACTIVITY_EVENTS[eventType]?.group ?? null;
}

/** The event types in a group (for the filter's SQL). */
export function eventTypesIn(group: ActivityGroup): string[] {
  return Object.entries(ACTIVITY_EVENTS)
    .filter(([, e]) => e.group === group)
    .map(([type]) => type);
}

/** Money changes also count approvals, which carry amounts. */
export const MONEY_EVENT_TYPES = ["annual.approved", "annual.reopened", "admin.tax_rate_changed"];

export const activityCopy = {
  title: "Analytics & Audit",
  intro: "Everything that happens in the app: who did what, when and why.",
  denied:
    "Analytics & Audit is for church staff. Your budget's own history is under Activity on this budget, on the budget.",
  tabs: { activity: "Activity", overview: "Overview", access: "Access" },
  groups: {
    requests: "Budget requests",
    decisions: "Decisions",
    money: "Money changes",
    access: "Access and sign-in",
    settings: "Settings and roles",
    emails: "Emails",
    exports: "Exports",
  } satisfies Record<ActivityGroup, string>,
  areas: {
    annual: "Annual Budget",
    expenses: "Expenses",
    spending: "Spending",
    admin: "Admin",
    access: "Access",
  },
  quick: {
    label: "Quick views",
    today: "Today",
    decisionsWeek: "Decisions this week",
    money: "Money changes",
    access: "Failed sign-ins and access denied",
    settings: "Settings and role changes",
    emails: "Emails that failed",
  },
  filters: {
    heading: "Filters",
    q: "Search",
    qHint: "Reference, person or department",
    person: "Person",
    anyone: "Anyone",
    role: "Acting as",
    anyRole: "Any role",
    area: "Area",
    anyArea: "Any area",
    group: "Kind of event",
    anyGroup: "Any kind",
    department: "Department",
    anyDepartment: "Any department",
    cycle: "Budget cycle",
    anyCycle: "Any cycle",
    from: "From",
    to: "To",
    apply: "Apply filters",
    more: "More filters",
    reset: "Reset filters",
  },
  columns: {
    when: "When",
    who: "Who",
    what: "What",
    item: "Item",
    department: "Department",
    reason: "Reason",
  },
  chips: {
    label: "Filters applied",
    search: (q: string) => `“${q}”`,
    from: (date: string) => `From ${date}`,
    to: (date: string) => `To ${date}`,
    remove: (filter: string) => `Remove filter: ${filter}`,
  },
  caption: "Activity, newest first",
  system: "The app",
  job: "Scheduled job",
  showDetails: "Show the details",
  hideDetails: "Hide the details",
  before: "Before",
  after: "After",
  changed: "changed",
  field: "Field",
  details: "Details",
  empty: "No activity for these filters.",
  page: (n: number, of: number) => `Page ${n} of ${of}`,
  previous: "Previous",
  next: "Next",
  pagination: "Pages of activity",
  count: (n: number) => (n === 1 ? "1 event" : `${n.toLocaleString("en-CA")} events`),
  export: "Export to Excel",
  history: "Activity on this budget",
  historyIntro: "Everything recorded about this budget, newest first.",
  historyEmpty: "Nothing recorded yet.",
  recent: "Recent activity",
  recentEmpty: "Nothing yet. What happens on your budgets and tasks will show here.",
  recentAll: "See all activity",
  workbook: {
    sheet: "Activity",
    title: "Activity log",
    columns: {
      when: "Date and time",
      person: "Person",
      role: "Acting as",
      area: "Area",
      what: "What happened",
      type: "Event type",
      item: "Item",
      department: "Department",
      cycle: "Budget cycle",
      reason: "Reason",
      details: "Details",
    },
  },
} as const;
