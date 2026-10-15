# Church Media Budget Submission Application
## Product Design and Software Requirements Specification

**Document type:** Product Requirements Document (PRD) and Software Requirements Specification (SRS)
**Organization:** Immanuel Fellowship Church (IFC)
**Product:** Church Media Budget Submission and Approval System
**Version:** 3.3
**Status:** Final requirements for build
**Companion documents:** [Design Requirements (DRD)](church-media-budget-design.md) · [User manual](user-manual.md) · [Go-live checklist](go-live-checklist.md) · [README](../README.md) · [Build guide for Claude Code](../CLAUDE.md)
**Currency:** Canadian dollars (CAD)
**Sales tax:** 12% on every total, one combined line, no exempt items (FR-07a)
**Language:** English (Canada) only
**Hosting constraint:** free tiers only; the church pays for nothing (20.3)
**Users:** one application for requesters (verified Group Leaders), accountant, Board Chair, Vice-Chair, church administrator (admin assistant), and system administrator

### Version history

| Version | Date | Summary |
|---|---|---|
| 1.0 | — | Initial baseline from the church. |
| 1.1–2.5 | 2026-10-15 | 12% sales tax; spending tracking; branding; complete email notifications; shared department requests and backup approver; Part A (annual budget, approved amount incl. tax) vs Part B (expense submissions); Planning Center sign-in and Group Leader check; scheduled decision release and "Other" department; free-tier stack; two-level expense approval with Board Chair and Church Administrator payment processing. |
| 3.3 | 2026-10-15 | Starting department list (FR-03); sign-in with any email address for staff (FR-01b); cheque signing authorities list (FR-53); flexible submission deadline with per-department extensions (4.3); first cycle is FY2027; branding editable by the administrator (FR-30); AC-131 to AC-138. Also: primary and backup requester per department (FR-38); Planning Center team mapping for departments (FR-39); Activity, audit and analytics dashboard with a complete activity log (FR-52, FR-22 extended); AC-116 to AC-130; go-live checklist (Section 21) and user manual (Section 22). |
| 3.2 | 2026-10-15 | Completeness check: added reopen workflow (FR-18a), board-approved church total per cycle (4.2), "how will this be bought" on purchase requests (FR-40), privacy requests (FR-36), two-step verification for staff (10.1); refreshed page list (Section 8) and requester navigation (7.2) to match the one-app design. |
| 3.1 | 2026-10-15 | One application for all roles with a single sign-in and a combined "My tasks" home (FR-37); Vice-Chair named as the backup board approver; System Administrator can see everything, read-only. |
| 3.0 | 2026-10-15 | Consolidated for build: roles reordered, authorization matrix includes all roles, FR index added, acceptance criteria renumbered AC-1 onward in one section, delivery plan rewritten as stages, decisions log merged. No requirement changes. |

### How this document is organized

| Area | Where |
|---|---|
| Roles and permissions | Section 3 |
| **Part A: Annual Budget** (yearly submission and approval) | Sections 4–5, FR-01 to FR-23, FR-30 to FR-36 |
| **Spending tracking** (budget vs actual, used by Part A and B) | 5.7–5.8, FR-24 to FR-29 |
| **Part B: Expense Submissions** (during the year) | Section 6B, FR-40 to FR-51 |
| UI summary (full design in the DRD) | Section 7 |
| Data model | Section 9 (Part A and spending) and 6B.10 (Part B) |
| Security, rules, statuses, non-functional | Sections 10–13 |
| Acceptance criteria (AC-1 onward) | Section 14 |
| Delivery stages | Section 15 |
| Decisions, open items, tech stack, handover | Section 20 |
| Go-live checklist (every tool, account and integration) | Section 21 and [go-live-checklist.md](go-live-checklist.md) |
| User manual (how to use the app, by role) | Section 22 and [user-manual.md](user-manual.md) |

### Two parts of the application

| Part | Purpose | When | Example |
|---|---|---|---|
| **A. Annual Budget** | Each department submits how much it needs for the year; the accountant approves that amount or a different amount based on the board's decision. | Once a year, before the budget year | Media asks for $40,000; the board approves $30,000 (incl. tax). |
| **B. Expense Submissions** | During the year, departments submit purchase requests (before buying) and expense claims (after buying) that are paid from their approved annual budget. | Any time during the budget year | Media asks to buy 2 microphones for $1,008 (incl. tax) out of its $30,000. |

In Part A, "request", "budget request", and "annual budget submission" mean the same thing: the department's one yearly budget. Part B uses "expense submission". In the interface, Part A is labelled **Annual Budget** and Part B **Expenses**.

### Terms used in this document

| Term | Meaning |
|---|---|
| Subtotal | Sum of all line totals, before tax. |
| Sales tax | Subtotal × tax rate, rounded half-up to the cent. |
| Total (incl. tax) | Subtotal + Sales tax. This is the "final total cost" of a request. |
| Requested total | The requester's Total (incl. tax). |
| Approved total | The amount the accountant approved, including tax. When entered as one figure (FR-16) the tax is worked out inside it; when line items are edited it is approved subtotal + tax. |
| Committed | Approved purchase requests that have not yet been claimed or paid (Part B). Money set aside but not yet spent. |
| Spent | Sum of recorded spending entries for a department and cycle, net of refunds and excluding voided entries. Amounts are what was actually paid, including tax. |
| Available budget | Approved total + approved budget amendments. |
| Remaining | Available budget − Committed − Spent. |

---

# 1. Executive Summary

## 1.1 Purpose

The Church Media Budget Submission Application will provide a centralized, secure, and auditable platform for church departments to prepare and submit annual media budgets and for the church accountant to review, adjust, approve, and export those budgets.

The application will replace informal submissions and manually maintained spreadsheets with a consistent workflow that automatically calculates costs (including 12% sales tax), tracks submission progress, manages revisions, and records approval decisions.

Users will authenticate through Google Sign-In. Department representatives will select their department and create requests containing item names, quantities, unit prices, optional product links, and a justification explaining why the budget is needed.

The application calculates each line total (quantity × unit price), the request subtotal, 12% sales tax on the subtotal, and the final total including tax. Before submitting, the requester must review a complete preview. After submission, the requester receives an email receipt and may make up to two post-submission revisions before approval. The accountant can return requests for clarification, decline them, approve the requested amounts, or change the approved amount and then approve. Tax is recalculated on the approved amount.

After approval, the church's admin assistant (Church Administrator role) records what each department actually spends, and the application shows each department's approved budget, amount spent, and amount remaining.

The application will also provide annual budget tracking, department completion reports, downloadable Excel workbooks, email notifications, role-based access, and an audit trail.

**File attachments are explicitly prohibited.** Product and supplier links may be provided as URLs.

## 1.2 Product Vision

Create a professional, easy-to-use church budgeting system that makes every request transparent, every calculation accurate (including tax), every approval traceable, and every department's submission status visible.

## 1.3 Core Objectives

1. Standardize annual budget submissions across departments.
2. Eliminate manual calculation of quantities, unit prices, sales tax, and totals.
3. Give requesters an opportunity to review their submissions before confirming.
4. Provide two controlled post-submission edits.
5. Give the accountant a consolidated view of departmental submissions.
6. Support approval or adjustment of individual items and overall budget amounts.
7. Notify requesters and the accountant when relevant events occur.
8. Export accurate, Excel-compatible budget records.
9. Preserve historical versions, approval decisions, and audit events.
10. Protect church financial information through secure authentication and authorization.

## 1.4 Success Criteria

The product is successful when:

- Every submitted request has an identified requester, department, annual budget cycle, justification, and itemized costs.
- Every request shows Subtotal, Sales tax (12%), and Total including tax, and these amounts match exactly across the interface, database, emails, approval workflow, and exports.
- The accountant can identify submitted and outstanding departments without manually checking emails.
- Every approved amount can be traced to an accountant and a timestamp.
- Requesters receive submission, revision, clarification, decline, and approval notifications as applicable.
- The accountant can download individual requests and consolidated annual reports.
- No file attachment can be submitted through the interface or API.
- Users can complete their workflows on mobile, tablet, and desktop.

---

# 2. Scope

## 2.1 In Scope

- Google Sign-In.
- Role-based authorization.
- Administrator-managed department list and department selector on the request form.
- Annual budget cycles.
- Requester dashboards.
- Save, resume, edit, and submit drafts.
- Budget request forms.
- Itemized budget line items.
- Automatic line totals, subtotal, 12% sales tax, and total including tax.
- Administrator-configurable sales tax rate (default 12%).
- Optional product and supplier links.
- Required budget justification.
- Pre-submission preview and confirmation.
- Submission email receipts.
- Two post-submission edits.
- Revision history.
- Accountant notifications.
- Accountant dashboard and departmental completion tracking.
- Individual line-item approval and adjustment.
- Overall approved budget total, with tax recalculated on the approved amount.
- Return-for-clarification workflow.
- Decline workflow.
- Approval notifications.
- Individual and consolidated Excel exports.
- Expense submissions during the year (Part B, Section 6B): purchase requests and expense claims against the approved annual budget, with approval and payment tracking.
- Spending tracking by the Church Administrator: recording what each department spends against its approved budget.
- Budget-vs-actual view: approved, spent, and remaining per department.
- Budget amendments (mid-year increases or reductions approved by the accountant).
- Overspend and near-limit alerts.
- Audit logging.
- Responsive, accessible UI.
- Administrative settings and configuration.

## 2.2 Out of Scope for the Initial Release

- File uploads and attachments.
- Purchase order creation.
- Direct purchasing or payment processing.
- Accounting software integration.
- Supplier payment management. (Spending tracking records payments made elsewhere; the app does not make payments.)
- Uploading receipts or invoices. Spending entries record a receipt or invoice reference number as text only.
- Automatic product price retrieval.
- Multi-currency accounting.
- Separate GST/PST tax lines and per-item tax-exempt flags (future enhancement; confirmed not needed now, 20.1).
- Tax-rebate or input-tax-credit calculations.
- Complex multi-level approval chains.
- Automatic budget forecasting.
- Mobile native applications.
- Automatic generation of invoices or receipts from suppliers.

These may be considered in future versions without compromising the initial system's architecture.

---

# 3. User Roles and Permissions

**One application.** Every role uses the same app, at the same web address, with the same sign-in. There is one account per person, and what they see depends on their roles. A person can hold several roles; for example, the accountant may also be a requester for their own department. They see one combined navigation and one **My tasks** list (FR-37), and never switch accounts.

| Role | Who | Main job |
|---|---|---|
| Requester | Department leaders (verified Group Leaders) | Submit the annual budget and expense submissions |
| Accountant (+ backup approver) | Church accountant | Decide annual budgets; first approval on expenses |
| Board Chair | Chairman of the Board of Directors | Final approval on expenses |
| Vice-Chair | Vice-Chairman of the Board | Backup board approver: final approval when the Chair is away or conflicted |
| Church Administrator | Admin assistant | Process and record payments; record spending |
| System Administrator | Runs the app | Manages users, departments, and settings; **sees everything**, read-only |

## 3.1 Department Representative

A department representative is an authorized church user responsible for preparing and submitting a budget on behalf of an assigned department.

### Permissions

- Sign in using an authorized Google account.
- View their own department's budget requests, including those started by another representative of the same department (FR-32).
- Send and receive messages with the accountant on a request (FR-31).
- Start a new request from last year's request (FR-35).
- Create a new annual budget request.
- Save and resume drafts.
- Select an authorized department from the department selector.
- Add, edit, reorder, and remove line items before submission.
- Enter item names, quantities, unit prices, optional links, and notes.
- Enter a required budget justification.
- View automatically calculated line totals, subtotal, sales tax, and total including tax.
- Preview the entire request before submitting.
- Submit a request.
- View submission status and approval details.
- Make up to two successful post-submission revisions before approval.
- View their revision history.
- Receive email notifications and access the request through a secure application link.

### Restrictions

- Cannot approve their own requests.
- Cannot change approved amounts.
- Cannot change or remove the sales tax.
- Cannot access another department's private request unless explicitly authorized.
- Cannot change the department list, roles, tax rate, or budget cycle configuration.
- Cannot edit an approved request.
- Cannot upload files.
- Cannot bypass the revision limit.

A user assigned to multiple departments may submit for each assigned department.

Each department has one **Primary requester** and can have up to two **Backup requesters**, ranked Backup 1 and Backup 2 (FR-38), for example when a department runs at two locations. All of them have every permission above for that department; the Primary is the person accountable for the department's budget, and the Backups cover when the Primary is Away or does not respond.

## 3.2 Accountant

The accountant is responsible for reviewing and deciding on departmental budget requests.

### Permissions

- View all departments and their annual submission statuses.
- View all requests for a budget cycle.
- Search, sort, and filter requests.
- View request details, justifications, item links, and revision history.
- Approve the requested amounts as submitted.
- Change the approved amount (per line item, or overall with a recorded reason) and then approve.
- Return a request for clarification with comments.
- Decline a request with a recorded reason.
- Approve a request after clarification and any permitted revisions.
- Download individual requests and consolidated Excel reports.
- View requested and approved subtotals, tax, and totals.
- View audit history.
- Receive notifications about new submissions and revisions.

### Restrictions

- Cannot alter a requester's submitted version without a recorded accounting adjustment.
- Cannot approve, decline, or adjust a request for a department they represent (FR-33).
- Cannot manually override the calculated sales tax on a request.
- Cannot erase historical request versions or audit events through the normal interface.
- Cannot change department assignments or the tax rate unless also granted the administrator role.
- Must explicitly confirm an approval, decline, or return action.

## 3.3 Board Chair (expense second approver)

The Chairman of the Board of Directors gives the second, final approval on expense submissions (Part B), after the accountant.

### Permissions

- See expense submissions that the accountant has approved and that are waiting for the Board Chair.
- Approve, approve a smaller amount (including tax), return to the accountant with a question, or decline with a reason.
- See the department's annual budget, committed, spent, and remaining, and the accountant's notes.
- Exchange messages on the submission (FR-31).
- Set Away; while away, the **Vice-Chair** (role: backup board approver, assigned by the administrator) receives the Board Chair's queue.

The **Vice-Chair** has exactly the Board Chair's permissions and restrictions, and acts when the Chair is Away, or when the Chair represents the department or is the payee. Every decision records whether the Chair or Vice-Chair made it.

### Restrictions

- Cannot approve annual budget submissions (Part A is decided by the accountant based on board approval), record payments, or change settings.
- Cannot approve a submission for a department they represent, or one where they are the payee; it goes to the backup board approver.
- Does not need the Planning Center Group Leader field (FR-01a staff exemption).

Terminology: **Church Administrator** is the church staff member (admin assistant) who processes payments and records spending; previously called Finance Assistant. **Administrator** on its own means the system administrator who manages the app's settings and users (3.5).
## 3.4 Church Administrator (admin assistant)

The Church Administrator (the church's administrative assistant) records actual spending so the church can see how much of each department's approved budget has been used and how much remains.

### Permissions

- View every department's approved budget, amendments, spending, and remaining balance for any cycle.
- View approved requests (read-only), including approved line items, so spending can be matched to what was approved.
- Record spending entries and refunds for any department.
- Work the expense payment queue: mark approved expense claims as paid (Part B, 6B.5).
- Correct a spending entry they recorded, with a required reason (audited).
- Void a spending entry with a required reason (audited); voided entries stay visible but are excluded from totals.
- Download spending and budget-vs-actual Excel reports.
- Receive overspend and near-limit alerts, if configured.

### Restrictions

- Cannot submit, approve, adjust, return, or decline budget requests.
- Cannot change approved amounts or create budget amendments (accountant only).
- Cannot permanently delete spending entries.
- Cannot record spending in a cycle whose spending period is locked, unless the accountant reopens it.
- Cannot upload receipts or invoices.
## 3.5 System Administrator

The system administrator ("Administrator" in this document) maintains application configuration and access, and **can see everything** in the application.

### Permissions

- Manage the department list.
- Add, deactivate, or rename departments.
- Assign users to departments, and mark each department's Primary and Backup requester (FR-38).
- Map departments to Planning Center teams, groups, or a custom field value, and review the suggested representatives (FR-39).
- Use the Activity, audit and analytics dashboard (FR-52).
- Assign requester, accountant, backup approver, Board Chair, Vice-Chair, church administrator, and administrator roles.
- Activate or deactivate users.
- Configure annual budget cycles and submission deadlines.
- Open and close budget cycles.
- Reopen a cycle when authorized.
- Configure the sales tax rate (default 12%).
- Configure email notification settings, including the accountant's notification address.
- Change the church branding: logo, church name, application name, and accent color.
- Review system-level audit events and notification failures.
- Resolve account access issues.
- Manage application configuration.
- **See everything, read-only:** every annual budget submission (all departments, all years, drafts included), every expense submission and receipt, approvals at both levels, payments, spending, budget vs actual, messages, emails sent, and the full audit log.
- Export any report.

### Restrictions

- Seeing everything does not include acting on money: the administrator cannot submit, approve, decline, adjust, or record payments unless also given that role. This keeps approvals separate from system control.
- Administrator privileges do not automatically authorize budget approval.
- An administrator who needs to approve requests must also be explicitly assigned the accountant role.
- Department, user, and tax-rate changes must be audited.
- A tax-rate change applies only to requests not yet submitted; submitted requests keep their snapshotted rate.
- Historical budget records must remain available when a department is renamed or deactivated.

## 3.6 Authorization Matrix

| Capability | Requester | Accountant | Board Chair | Church Administrator | System Administrator |
|---|---|---|---|---|---|
| Create and save own draft | Yes | Optional | No | Only if also assigned requester role | Optional |
| Submit budget request | Yes | Only if also assigned requester role | No | Only if also assigned requester role | Only if also assigned requester role |
| View own requests | Yes | Yes | No | As authorized | All (read-only) |
| View all department requests | No | Yes | Approved annual budgets, read-only | Approved requests, read-only | Yes, including drafts (read-only) |
| Edit submitted request | Up to two revisions | No direct requester edits | No | No | No direct requester edits |
| Return for clarification | No | Yes | No | No | Only if also accountant |
| Decline request | No | Yes | No | No | Only if also accountant |
| Approve or adjust line items | No | Yes | No | No | Only if also accountant |
| Approve overall total | No | Yes | No | No | Only if also accountant |
| Export all departments | No | Yes | No | Spending and budget-vs-actual reports | Yes (all reports) |
| Manage departments and roles | No | No | No | No | Yes |
| Change sales tax rate | No | No | No | No | Yes |
| View system audit events | Own request history | Budget audit history | Own decisions | Spending audit history | All audit history |
| Record and correct spending | No | Yes | No | Yes | No |
| Void spending entries | No | Yes | No | Yes | No |
| Create budget amendments | No | Yes | No | No | No |
| View own department's budget, spent, remaining | Yes (read-only) | Yes | All departments, read-only | Yes | All departments (read-only) |
| Lock or reopen spending period | No | Yes | No | No | No |
| Expense first approval (Part B) | No | Yes (not own department) | No | No | No |
| Expense final approval (Part B) | No | No | Yes (Vice-Chair as backup) | No | No |
| Process and record expense payment (Part B) | No | Yes | No | Yes | No |
| View all expenses, receipts, and payments | Own department | Yes | Those sent to them, and their department budgets | Yes | Yes (read-only) |
| See the "My tasks" home (FR-37) | Yes | Yes | Yes | Yes | Yes |
| Set Primary and Backup requesters (FR-38) | Primary can nominate Backups | No | No | No | Yes |
| Map departments to Planning Center (FR-39) | No | No | No | No | Yes |
| Activity, audit and analytics dashboard (FR-52) | Own department's activity | Annual budget, expense and spending analytics; financial audit log | Analytics for expenses they decided; read-only | Spending and payment analytics; spending audit log | Everything, including sign-ins, settings and access changes |

The Vice-Chair column is identical to the Board Chair column. A person with several roles gets the union of their roles' permissions, still subject to the conflict-of-interest rules (FR-33, FR-47).

All permissions must be enforced on the server, not merely hidden in the interface.

---

# 4. Annual Budget Cycle Management

## 4.1 Annual Cycle Model

The application will support one annual budget cycle per fiscal or budget year, with historical cycles retained.

Examples:

- FY2027 Media Budget
- FY2028 Media Budget
- FY2029 Media Budget

The system administrator will create each cycle, set its submission deadline, and open or close it. **The first cycle is FY2027** (budget year 2027), set up from Settings, never hard-coded.

## 4.2 Cycle Attributes

Each cycle must contain:

- Unique cycle ID.
- Display name.
- Budget year.
- Start date.
- Submission deadline.
- Status: Draft, Open, or Closed.
- Currency, defaulting to CAD.
- Default sales tax rate for the cycle, defaulting to the application setting (12%).
- Decision email mode: Send immediately (default) or Hold and release on a schedule, with release date and time (FR-19a).
- Optional **Board-approved church total** for the cycle (incl. tax) and board reference. When set, the accountant dashboard shows Allocated (sum of approved department totals) vs Board total and the amount left to allocate, and warns before an approval would exceed the board total.
- Created by and creation timestamp.
- Updated by and update timestamp.

## 4.3 Cycle Rules

- New requests may be created only in an open cycle.
- The deadline and cycle status must be validated by the server.
- Closing a cycle prevents new submissions unless the administrator reopens it.
- Closing a cycle must not delete requests or prevent authorized review of existing submissions.
- Historical cycles must remain accessible to the accountant.
- Each department's submission status is evaluated independently for each cycle.
- Each department should have one primary annual request per cycle.
- Revisions update the existing request history rather than creating duplicate primary submissions.

### Changing the submission deadline

The deadline is flexible:

- The administrator can change the deadline of a Draft or Open cycle at any time: move it later, or earlier as long as the new date is still in the future. A reason is required.
- The administrator or accountant can give **one department an extension** (new date and reason) without changing everyone's deadline. The department's page and the accountant dashboard show "Extended to {date}".
- A Closed cycle can be reopened with a new deadline (4.3 above).
- Changing a deadline emails every department representative who has not yet submitted (or only that department, for an extension), recalculates the reminder emails (FR-21), and is audited with the old and new dates.
- The server checks the deadline that applies to the department (its extension, if any, otherwise the cycle's).

If a department needs a second independent request in the same year, that should be an explicitly supported exception rather than an accidental duplicate.

---

# 5. End-to-End User Workflows

## 5.1 Requester Workflow

1. Open the application.
2. Select **Continue with Google**.
3. Complete Google authentication.
4. The application checks the account's authorization and department assignments.
5. Open the requester dashboard.
6. Select the active annual budget cycle.
7. Start a new request or resume an existing draft.
8. Select the department from the department selector (pre-selected if the user has only one).
9. Enter a request title and justification (why the budget is needed).
10. Add one or more budget items.
11. Enter item name, quantity, and unit price, and optionally a product or supplier link.
12. Review the automatic line totals, Subtotal, Sales tax (12%), and Total including tax.
13. Save the draft or continue to the preview.
14. Review the complete, read-only request.
15. Return to edit if corrections are needed.
16. Select **Confirm submission**.
17. The server validates the request, recalculates all amounts including tax, and saves it.
18. The application displays a confirmation and reference number.
19. The requester receives a submission email.
20. The accountant receives a new-submission notification.
21. The requester can view the request status and remaining revision allowance.

## 5.2 Requester Revision Workflow

1. Open a submitted request.
2. Check the current status and number of remaining edits.
3. Select **Edit submitted request** if editing is permitted.
4. Modify the permitted request fields and line items.
5. Preview the complete revised request, including recalculated subtotal, tax, and total.
6. Confirm the revision.
7. The server validates the request and confirms that an edit remains available.
8. The new version is saved while the previous version is preserved.
9. The edit counter increases by one.
10. The requester receives an updated receipt.
11. The accountant receives a revision notification.
12. The accountant can inspect the revised request and change history.

Editing is closed once the request is approved or declined.

If the request is returned for clarification, the requester responds through the clarification workflow (Section 5.4). A clarification response does **not** consume one of the two edits. Outside of clarification, the two-edit limit remains in force unless the accountant explicitly authorizes a separate exception under a documented policy.

## 5.3 Accountant Review Workflow

1. Sign in using an authorized Google account.
2. Open the accountant dashboard.
3. Select the annual budget cycle.
4. Review departmental completion and submission totals.
5. Open a request awaiting review.
6. Review the justification, items, links, requested subtotal, tax, total, and revision history.
7. Either approve as requested, or change the approved amount (per line item, or overall with a reason).
8. Record comments explaining material adjustments.
9. Review the resulting approved subtotal, tax, and approved total.
10. Choose one of the available decisions:
    - Approve
    - Return for clarification
    - Decline
11. Review the decision summary.
12. Confirm the action.
13. The server records the decision and audit event.
14. The requester receives the relevant email notification.
15. The dashboard reflects the updated status and approved amount.

## 5.4 Return-for-Clarification Workflow

1. The accountant opens a submitted request.
2. The accountant selects **Return for clarification**.
3. The accountant enters a required explanation or question.
4. The accountant confirms the action.
5. The request status becomes Returned for Clarification.
6. The requester receives an email containing the reason and a secure link.
7. The requester reviews the feedback.
8. The requester updates the request and confirms the clarification response through the same preview-and-confirm step. This response does not consume one of the two post-submission edits.
9. The revised request returns to the accountant's review queue.
10. The accountant reviews the changes and makes a decision.

A request must not be treated as approved merely because it was returned, revised, or resubmitted.

## 5.5 Decline Workflow

1. The accountant selects **Decline**.
2. The application requires a decline reason.
3. The accountant reviews the decision summary.
4. The accountant confirms the decline.
5. The status becomes Declined.
6. The requester receives an email containing the decline reason.
7. The request becomes read-only.
8. The record remains available for historical reporting and audit purposes.

If the church permits reconsideration of a declined request, that should be implemented as an explicit reopen or new-request process. Declined requests must not silently return to the approval queue.

## 5.6 Approval Workflow

1. The accountant reviews the request.
2. The accountant approves as requested, or adjusts the approved amount.
3. The accountant reviews the resulting approved subtotal, tax, and total.
4. The accountant records an explanation for material differences.
5. The accountant confirms approval.
6. The server validates the decision and calculates the final approved subtotal, tax, and total.
7. The status becomes Approved.
8. The application records the accountant, approval timestamp, approved item values, approved subtotal, approved tax, and approved total.
9. Requester editing is disabled.
10. The requester receives an approval email.
11. The accountant dashboard and annual reports update.
12. The department's approved total becomes its available budget on the Spending dashboard.

## 5.7 Spending Recording Workflow (Church Administrator)

1. Sign in using an authorized Google account.
2. Open the Spending dashboard and select the budget cycle.
3. Review each department's available budget, spent, remaining, and percentage used.
4. Select **Record spending**.
5. Select the department. The app shows its available budget and remaining balance.
6. Optionally select the approved line item the purchase relates to.
7. Enter date, payee/vendor, description, amount paid (including tax), payment method, and receipt or invoice reference number.
8. Review the summary, which shows the remaining balance before and after this entry.
9. If the entry would take the department over budget, enter a required overspend note.
10. Confirm. The server saves the entry, recalculates spent and remaining, and records an audit event.
11. If the department crosses the near-limit or over-budget threshold, the accountant receives an alert email.

Refunds and returns follow the same steps with the entry type **Refund**, which reduces Spent.

## 5.8 Budget Amendment Workflow (Accountant)

1. The accountant opens a department's budget on the Spending dashboard or an approved request.
2. The accountant selects **Amend budget**.
3. The accountant enters an increase or reduction (including tax), a required reason, and an optional board reference.
4. The app shows the tax portion and the new available budget.
5. The accountant confirms.
6. The amendment is recorded and audited; the original approved total is unchanged.
7. The requester receives an email showing the amendment and new available budget.

---

# 6. Functional Requirements

### FR index

| FR | Title | Area | Stage (Section 15) |
|---|---|---|---|
| FR-01 | Google authentication | Access | 1 |
| FR-01a | Planning Center sign-in and Group Leader check | Access | 1 |
| FR-02 | User and role management | Access | 1 |
| FR-03 | Departments, selector, "Other" | Part A | 1 |
| FR-04 | Request information | Part A | 1 |
| FR-05 | Drafts | Part A | 1 |
| FR-06 | Line items | Part A | 1 |
| FR-07 / FR-07a | Calculation and 12% sales tax | Core | 1 |
| FR-08 | Product links | Part A | 1 |
| FR-09 | Justification | Part A | 1 |
| FR-10 | Preview and confirmation | Part A | 1 |
| FR-11 | Submission receipt | Part A | 1 |
| FR-12 | Two post-submission edits | Part A | 1 |
| FR-13 / FR-14 | Accountant dashboard, department completion | Part A | 1 |
| FR-15 / FR-16 | Line-item approval; approve a different amount (incl. tax) | Part A | 1 |
| FR-17 / FR-18 / FR-18a | Return for clarification; decline; reopen | Part A | 1 |
| FR-19 / FR-19a | Approval email; scheduled release | Part A | 1 / 2 |
| FR-20 | Excel export | Part A | 1 |
| FR-21 | Email notifications | Core | 1 (Part A events), 3 (Part B) |
| FR-22 | Audit trail | Core | 1 |
| FR-23 | No attachments | Core | 1 |
| FR-24 to FR-29 | Spending entries, budget vs actual, dashboard, amendments, alerts, lock | Spending | 4 |
| FR-30 | Branding and language | Core | 2 |
| FR-31 | Request messages | Core | 2 |
| FR-32 | Shared department requests | Part A | 1 |
| FR-33 | Backup approver | Core | 2 |
| FR-34 | Optional second approval for large annual budgets | Part A | 2 |
| FR-35 | Copy last year's request | Part A | 2 |
| FR-36 | Help and privacy | Core | 1 |
| FR-37 | One application, "My tasks" home | Core | 1 (tasks for Part B and spending added in Stages 3–4) |
| FR-38 | Primary and backup requester per department | Core | 1 |
| FR-39 | Planning Center team mapping for departments | Access | 2 |
| FR-01b | Sign-in with any email address (emailed code) | Access | 1 |
| FR-53 | Cheque signing authorities list | Part B | 3 |
| FR-40 to FR-51 | Expense submissions, two-level approval, payment | Part B | 3 |
| FR-52 | Activity, audit and analytics dashboard | Core | 1 (activity log), 2 (annual analytics), 4 (expense and spending analytics) |


## FR-01: Google Authentication (included)

- Use Google OAuth 2.0 / OpenID Connect through an established authentication implementation.
- Validate authentication on the server.
- Use the stable Google identity subject rather than the display name as the identity key.
- Restrict application access to approved users.
- Prefer an administrator-managed account allowlist or verified church-managed Google Workspace accounts.
- Do not assume that any Google account is authorized simply because it can sign in.
- Provide a clear access-denied message and instructions for requesting access.
- Use secure session management.
- Do not store user passwords.

## FR-01a: Planning Center Sign-In and Leader Verification

Purpose: confirm that the person submitting budgets or expenses is a recognized church leader in Planning Center, not just any volunteer or member.

### Sign-in options

- The sign-in screen offers **Continue with Google** and **Continue with Planning Center**.
- Planning Center sign-in uses Planning Center's OAuth 2.0 ("Log in with Planning Center"), registered as an OAuth application by the church's Planning Center administrator, requesting the minimum scope needed (People).
- After sign-in, the app identifies the person by their Planning Center person ID (stable key), not by name.
- One app user can have both a Google identity and a Planning Center identity. They are linked automatically when the verified Google email matches a Planning Center email on that person's profile, or manually by the administrator.

### Leader verification (custom field)

- The administrator configures in Settings → Planning Center:
  - The People **custom field** to check. Default: **"Ministry Leader"**, a Yes/No field.
  - The **accepted value(s)**. Default: **"Yes"**. For a Yes/No field the app matches by meaning, so "Yes" also matches a stored "true" or "1". Other field types match the text, ignoring case.
- The server checks the field using the church's own Planning Center API credentials (a Personal Access Token or the OAuth app's server credentials, stored as a secret), so the check works even for users who have no permission to see People data themselves.
- **Who must be verified:** the Requester role (annual budget submissions and expense submissions, including Expense submitters). Accountant, backup approver, Church Administrator, and administrator roles are assigned in the app and do not need the field, unless the administrator turns that on.
- **Google sign-ins are verified too:** when a requester signs in with Google, the app finds the Planning Center person with the same email and checks the field. If no Planning Center person matches, requester access is denied with an explanation.
- **When checked:** at every sign-in, and by a nightly sync for all requesters.
- **If the field is removed in Planning Center:** requester access is suspended at the next check; drafts and history are kept; the department's other representatives keep the request; the administrator and accountant get an email; the user sees "Your Group Leader status in Planning Center could not be confirmed."
- **New leaders:** a verified Group Leader who signs in for the first time without department assignments sees "Waiting for department assignment", and the administrator is emailed to assign departments. Departments are assigned in the app, or suggested automatically from Planning Center when the department is mapped to a team, group, or custom field value (FR-39).
- **If Planning Center is unavailable:** users verified in the last 72 hours can continue; others see a "Planning Center can't be reached, try again shortly" message. Outages are logged and the administrator is emailed.
- The app stores only the Planning Center person ID, name, email, the checked field value, and the last verification time. It does not import other Planning Center data.
- Every verification result change (granted, suspended, restored) is audited.

### Settings → Planning Center (administrator)

- Connect / disconnect the church's Planning Center account; show connection status and last sync.
- Pick the custom field from a list loaded from Planning Center, and enter accepted values.
- **Test a person:** search a name and see whether they pass, before saving.
- Toggles: "Require for requesters" (on), "Require for accountant and Church Administrator roles" (off), "Allow Google sign-in" (on), "Allow Planning Center sign-in" (on).
- A list of current requesters who fail verification, with the reason.

## FR-01b: Sign-In with Any Email Address (staff)

Staff (accountant, backup approver, Board Chair, Vice-Chair, Church Administrator, System Administrator) can use an email address that is not Gmail or a church address, such as their work or personal email.

- A staff account is identified by the email address the administrator enters when assigning the role. It can be any address.
- They can sign in with any of:
  - **Continue with Google** using a Google Account registered to that address. Anyone can create a free Google Account for an existing email address without getting Gmail (the help page links to Google's "Use my current email address instead" sign-up).
  - **Continue with Planning Center**, if that address is on their Planning Center profile.
  - **Continue with email** (new): the app emails a 6-digit code, valid 10 minutes, single use, to an address already on the allowlist. Unknown addresses get the same "check your email" message and no code, so the app does not reveal who has access. Codes go through the outbox (CLAUDE.md rule 7) but are sent straight after commit, not held for the 15-minute job.
- No two-step verification is required for any role (10.1). Google and Planning Center sign-ins use whatever protection that account has; email-code sign-in uses the emailed code only, with no authenticator-app step.
- Rate limits: 5 code requests per address per hour and 5 wrong codes per code; then a 15-minute wait. Attempts appear in the Access tab (FR-52).
- Requesters can use email-code sign-in too, but they still need to pass the Group Leader check (FR-01a), matched by that email in Planning Center.
- Administrator setting "Allow email sign-in" (on by default), next to the Google and Planning Center toggles.

## FR-02: User and Role Management

- Each user must have an active/inactive status.
- Users may have more than one role.
- Users may be assigned to one or more departments.
- Role and department assignments must be stored server-side.
- Revoking access must prevent future unauthorized requests.
- Changes to roles and assignments must be audited.
- The interface must display the user's role-appropriate navigation.

## FR-03: Department Management and Selection

### Department list (administrator)

- The administrator adds every church department (name, optional description, optional default representative) and can rename, deactivate, or reactivate them.
- Bulk add: paste a list of names, one per line.

### Starting department list (confirmed by G, 2026-10-15)

The administrator loads these 18 departments when the app is set up (Admin → Departments → paste a list). They are data, not code, and can be renamed, added to, or deactivated later.

| | | |
|---|---|---|
| Adult Sunday School | Choir Team | Children Sunday School |
| Drama Team | Decoration Team | Evangelism Team |
| Media Team | Men's Fellowship | Prime Adult/Young Adult Ministry |
| Prayer Warrior Team | Quality Control Team | Sanctuary Keepers Team |
| Social Media Team | Transportation Team | Ushering Team |
| Visitation Team | Women's Fellowship Team | Young Couples Ministry |

"Others" in the church's list is the **Other (type your department)** option below, not a department.

**Representatives are not pre-loaded.** Leaders change, so nobody is assigned in advance. A department's representatives come from: a verified Group Leader picking the department on the form (they become Primary if there is none, FR-38), Planning Center team mapping (FR-39), or the administrator. Only verified leaders can use the app as requesters (FR-01a), so sharing the app's link more widely gives nobody else access.

### Department selector (annual budget form)

- The form shows a searchable **Department** list of all active departments, alphabetically. Departments the user already represents are shown first.
- The last option is **Other (type your department)**, which opens a text box for the department name (required, max 80 characters).
- Department selection is required for every annual budget submission.
- Picking a department the user does not yet represent makes them a representative of it automatically (they are a verified Group Leader, FR-01a). This is audited and the administrator is emailed, and can remove them.
- If that department already has a draft or submission this year, the user is taken to it instead of starting a duplicate ("Media already has a budget started by Sam Lee. Open it?"), following FR-32.

### "Other" departments

- Typing a department name creates a **Proposed department** linked to the submission, with the user as its representative.
- Before saving, the app suggests close matches from the list ("Did you mean Media Ministry?") to avoid duplicates.
- The requester can save, preview, and submit as normal. The submission shows a "New department, waiting for administrator" label.
- The administrator is emailed and, from Departments → Proposed, chooses:
  - **Add to list:** the department becomes active and the submission continues normally.
  - **Merge into existing department:** the submission moves to the chosen department (shared-request rules apply if it already has one); the requester is emailed.
  - **Reject:** with a reason; the requester is emailed and asked to choose a department from the list. The submission returns to Draft.
- The accountant can read a submission with a proposed department but cannot approve or decline it until the administrator has added or merged the department.
- Proposed departments are not counted in "departments expected" until added.

### Other rules

- Expense submissions (Part B) list only departments with an approved annual budget for the year that the user represents; there is no "Other" option.
- Only active departments may receive new submissions.
- The accountant can see active departments and their submission statuses.
- Historical records must preserve the department identity and name applicable at submission.

## FR-04: Request Information

Each request must include:

- Unique request reference number.
- Annual budget cycle.
- Department.
- Authenticated requester identity.
- Request title.
- Required justification.
- Submission timestamp.
- Current status.
- Itemized budget lines.
- Requested subtotal, tax rate, sales tax, and requested total (including tax).
- Approved subtotal, approved sales tax, and approved total, when applicable.
- Creation and last-update timestamps.
- Revision count.
- Approval or decline information, when applicable.

## FR-05: Draft Management

- Requesters can save a draft without submitting it.
- Drafts can be reopened and edited by their authorized requester.
- Drafts do not count as submitted budgets.
- Drafts do not consume post-submission edit opportunities.
- Drafts do not trigger submission or approval notifications.
- Drafts display tax at the current application rate; the rate is fixed only when the request is submitted.
- Unsaved changes must be protected through autosave or an explicit save action and navigation warning.
- Drafts must be validated before submission.
- Drafts may be deleted by their owner before submission, subject to a clear confirmation step.
- The accountant's dashboard must distinguish drafts from submitted requests and must not count drafts as completed submissions.

## FR-06: Budget Line Items

Each item must include:

| Field | Requirement |
|---|---|
| Item name/description | Required |
| Quantity | Required; greater than zero |
| Unit price | Required; non-negative; entered before tax |
| Line total | Calculated automatically (quantity × unit price, before tax) |
| Product/supplier link | Optional |
| Notes | Optional |
| Display order | System-managed |

The requester must be able to add, remove, edit, and reorder items before submission.

The interface must label the unit price clearly as **Unit price (before tax)** so that the user does not confuse it with the line total or enter a tax-inclusive price.

Quantity should normally be a positive whole number for physical equipment. If fractional quantities are needed for services or licenses, they must be explicitly supported by the business rules.

## FR-07: Automatic Calculation

For each item:

**Line total = Quantity × Unit price**

For the request:

**Subtotal = Sum of all line totals**
**Sales tax = Subtotal × Tax rate** (see FR-07a)
**Requested total = Subtotal + Sales tax**

For the accountant's approved budget:

**Approved subtotal = Sum of all approved line totals (+ any recorded overall adjustment)**
**Approved sales tax = Approved subtotal × Tax rate**
**Approved total = Approved subtotal + Approved sales tax**

Worked example (10 items with a combined cost of $30,000.00):

| | Amount |
|---|---:|
| Subtotal | $30,000.00 |
| Sales tax (12%) | $3,600.00 |
| **Total (incl. tax)** | **$33,600.00** |

Requirements:

- When quantity is more than one, the line total is calculated automatically.
- Calculated values (line totals, subtotal, tax, total) update immediately when inputs change.
- Users cannot manually edit any calculated value, including tax.
- The server independently recalculates all values before persisting a submission, revision, or approval.
- Decimal-safe monetary calculations must be used; never use binary floating point for money.
- Currency values are stored consistently in CAD as integer cents or an equivalent exact decimal representation.
- Display amounts with two decimal places.
- The calculation and rounding policy must be consistent throughout the application and implemented in one shared module used by the UI, server, emails, and exports.
- Totals must not rely exclusively on client-side JavaScript.
- Approval calculations must be performed using the approved quantities and approved unit prices or explicit approved line totals, according to the final data model.

## FR-07a: Sales Tax

- A sales tax is applied to every request total. The default rate is **12%**.
- Tax is calculated **once on the subtotal**, not per line item.
- Tax is rounded **half-up to the nearest cent** (e.g. $0.005 rounds to $0.01).
- All items are taxable in this release. There is no per-item exemption (confirmed, 20.1).
- The tax rate is an administrator setting stored as an exact decimal (e.g. `0.1200`), defaulting to 12%.
- When a request is first submitted, the current rate is **snapshotted** onto the request. Revisions and the approval of that request use the snapshotted rate, even if the administrator later changes the setting.
- The same rate and rounding are applied to the approved subtotal to produce the approved tax and approved total.
- Every screen, email, and export that shows a total must show three lines: **Subtotal**, **Sales tax (12%)** (showing the actual snapshotted rate), and **Total (incl. tax)**.
- The phrase "Requested total" and "Approved total" always mean the amount including tax.
- Changing the tax rate is audited with old value, new value, actor, and timestamp.

## FR-08: Optional Product Links

- Accept an optional product or supplier URL for each item.
- Validate that a link uses HTTP or HTTPS.
- Display links as clickable, clearly labelled links.
- Open external links safely (new tab, `rel="noopener noreferrer"`).
- Do not automatically fetch arbitrary URLs from the server.
- Do not embed remote websites inside the application.
- A missing link must not prevent submission.
- Links must remain associated with the correct item in exports.

## FR-09: Budget Justification

- A "Why are you requesting this budget?" justification is mandatory.
- Recommended maximum: 2,000 characters.
- Provide a character counter.
- Explain the expected use and benefit of the requested budget.
- Prompt users to include relevant timing, intended audience, and consequences if the request is not funded.
- Preserve formatting appropriately (plain text with line breaks) without allowing unsafe HTML.
- No file attachments are permitted.

## FR-10: Preview and Submission Confirmation

The preview must contain:

- Requester and department.
- Budget year.
- Request title.
- Justification.
- All items.
- Quantity.
- Unit price.
- Line total.
- Optional product links.
- Subtotal.
- Sales tax (with rate shown).
- Total including tax.
- Submission confirmation statement.

The page must provide:

- **Back to edit**
- **Save draft**, where applicable.
- **Confirm submission**

Submission requires explicit confirmation. Opening the preview must never submit a request automatically.

Prevent duplicate requests caused by repeated button clicks or network retries (idempotency key per submission).

## FR-11: Submission Receipt

After successful submission:

- Generate a unique request reference number (e.g. `IFC-2027-0007`).
- Save the request transactionally.
- Display a success page.
- Show the subtotal, sales tax, total including tax, and submission timestamp.
- Send the requester a receipt email.
- Send the accountant a notification email.
- Include a secure application link.
- Include a readable itemized summary with Subtotal, Sales tax, and Total including tax.
- Show the number of remaining edits.

Email delivery failures must be logged and retried where possible. A saved request must not be lost because an email service is temporarily unavailable.

The interface must not claim an email was delivered merely because the user clicked Submit.

## FR-12: Two Post-Submission Revisions

- Each request begins with two permitted post-submission edit opportunities.
- A successfully saved and confirmed revision consumes one opportunity.
- Opening or cancelling an edit does not consume an opportunity.
- Validation failures do not consume an opportunity.
- The application must enforce the limit on the server.
- Show the number of remaining edits.
- Require a final confirmation (with preview) before saving a revision.
- Preserve every previously submitted version, including its subtotal, tax, and total.
- Record the editor, timestamp, and changed fields.
- Email the requester a revised receipt.
- Email the accountant a revision notification.
- Display a revision indicator on the accountant dashboard.
- Prevent revisions after approval or decline.
- A response to a return for clarification does not consume an edit opportunity. It is saved as a new version, preserved in history, audited as a clarification response, and is allowed only while the request is in Returned for Clarification status (one response per return).
- Any exceptional edit allowance must be authorized, recorded, and auditable.

## FR-13: Accountant Dashboard

The accountant dashboard must display:

- Selected annual budget cycle.
- Number of active departments expected to submit.
- Number of departments submitted.
- Number of departments outstanding.
- Number of requests awaiting review.
- Number returned for clarification.
- Number approved.
- Number declined.
- Total requested amount (including tax).
- Total approved amount (including tax).
- Search and filtering controls.
- Department completion list.
- Request status list.
- Export controls (download any department's request as Excel, or all).

The dashboard must distinguish submitted budgets from drafts.

The accountant must be able to open a request directly from the dashboard.

## FR-14: Department Completion Tracking

For each active department in the selected cycle, show:

- Department name.
- Assigned representative, where applicable.
- Submission status.
- Submission date, if applicable.
- Requested total (including tax).
- Approved total (including tax), if applicable.
- Outstanding action.
- Download (Excel) action.

Recommended statuses:

- Not Submitted
- Draft Exists
- Submitted
- Updated
- In Review
- Returned for Clarification
- Approved
- Declined

A department must not be counted as having submitted simply because a draft exists.

## FR-15: Line-Item Approval

The accountant must be able to review and adjust individual line items.

For each line item, show:

- Original item description.
- Requested quantity.
- Requested unit price.
- Requested line total.
- Approved quantity.
- Approved unit price.
- Approved line total.
- Adjustment explanation, where needed.

The accountant may:

- Approve the requested line values.
- Reduce the approved quantity.
- Adjust the approved unit price.
- Approve a zero amount for an item where appropriate.
- Exclude an item by setting its approved amount to zero.
- Add an adjustment reason.

Below the lines, show requested and approved **Subtotal**, **Sales tax**, and **Total (incl. tax)** side by side, recalculated live as the accountant edits.

The interface must distinguish requested and approved values clearly.

The original requester values must remain unchanged in the historical record.

If the accountant adjusts a line item, the application must display the difference between the requested and approved line totals.

## FR-16: Annual Budget Approval and "Approve a Different Amount"

This is the main purpose of Part A: the department says what it needs for the year, and the accountant records what the board approved.

The accountant has three ways to approve:

1. **Approve as requested.** The approved total equals the requested total (incl. tax).
2. **Approve a different amount** (the main path when the board approves less or more). The accountant enters one **Approved total, including tax**, for example $30,000.00, plus a required note and an optional **Board approval reference** (e.g. "Board minutes, Nov 12, 2026"). Line items do not need to be edited.
3. **Approve with line changes** (optional). The accountant edits approved quantities, unit prices, or line amounts (FR-15), entered before tax as on the requester's form; the app adds tax.

### Tax when the accountant enters one total (tax-inclusive)

The board's figure is the final amount including tax. The app works out the tax inside it:

**Approved subtotal = Approved total ÷ (1 + tax rate)**, rounded half-up to the cent
**Approved tax = Approved total − Approved subtotal**

Example at 12%: Approved total $30,000.00 → Approved subtotal $26,785.71 + Approved tax $3,214.29 = $30,000.00. The approved total always stays exactly the figure the accountant entered.

Rules:

- When the accountant enters one approved total, the difference between it and the sum of approved line items is stored as an explicit **overall adjustment entry** with the note, so line items and total still reconcile.
- When the accountant edits line items only, the approved total is calculated forward (subtotal + tax), as for the requester.
- The approval screen shows requested and approved Subtotal, Sales tax, and Total, and the difference, before confirmation.
- The application calculates and stores the final approved subtotal, tax, and total on the server.
- The application must record the approving accountant, timestamp, note, and board reference.
- Approval locks the annual budget submission. The approved total becomes the department's available budget for Part B.

## FR-17: Return for Clarification

- The accountant can return a request with a required comment.
- The requester receives an email with the comment.
- The request remains visible in the accountant dashboard.
- The request status clearly indicates that the requester must respond.
- The requester can access the request through a secure link.
- The requester's clarification response does not count toward the two-edit limit, and the remaining edit count is unchanged.
- The accountant can review the updated version and its history.
- A returned request is not approved.

## FR-18: Decline

- Declining a request requires a reason.
- The accountant must confirm the action.
- The request status becomes Declined.
- The requester receives a decline notification.
- The original request and history remain available.
- The request becomes read-only after decline.
- Reconsideration uses the reopen workflow (FR-18a), not a new duplicate request.

## FR-18a: Reopen an Annual Budget

- The accountant can **reopen** a Declined or Approved annual budget submission with a required reason (e.g. the board reconsidered).
- Reopening returns it to **Returned for Clarification**, so the department can edit and resubmit. It does not use one of the two edits.
- Reopening an Approved budget is blocked while approved expenses or commitments exist against it, unless the accountant confirms a warning that the new decision will change the department's available budget.
- Previous decisions stay in history; the new decision replaces the current approved amount.
- The requester and accountant are emailed (FR-21 "Request reopened"). The action is audited.

## FR-19: Approval Email

The requester approval email must include:

- Request reference number.
- Department.
- Budget year.
- Request title.
- Requested subtotal, sales tax, and total.
- Approved subtotal, sales tax, and total.
- Difference between requested and approved totals.
- Approved line-item summary.
- Accountant's explanation or adjustment notes.
- Approval timestamp.
- Secure link to view the approved request.

The email must clearly state that the approved total (including tax) is the amount authorized, not necessarily the amount originally requested.

## FR-19a: Scheduled Release of Annual Budget Decisions

The accountant chooses, per budget cycle, how requesters hear about annual budget decisions:

- **Send immediately** (default): each approval or decline email goes out when the accountant confirms the decision.
- **Hold and release on a schedule:** the accountant reviews and decides all departments first, then all decision emails go out together at a chosen **date and time** (church time zone, America/Winnipeg by default, set in Settings).

Rules for Hold mode:

- Decisions are saved and locked when the accountant confirms them, but requesters keep seeing **In Review** with the line "Decisions will be shared on [date]" until release. The approved amount is not visible to requesters before release.
- Release dashboard (accountant): count of departments approved, declined, still undecided, and not submitted; the scheduled date and time; a preview list of who gets which email; **Change schedule**, **Release now**, and **Cancel schedule**.
- If some departments are still undecided at release time, the accountant is warned a day before and at release; the default is to release decided ones and send the rest immediately when decided. The accountant can instead postpone.
- At release, each decision's email is sent, statuses change to Approved or Declined for requesters, and the release time is recorded on each decision (audit).
- Scheduled jobs run every 15 minutes on the free stack, so held emails go out within 15 minutes after the scheduled time.
- Decisions made after the release time are sent immediately.
- Return for clarification is never held, because the requester needs to act.
- Holding affects only requester emails and visibility. The accountant, backup approver, and Church Administrator see decisions as soon as they are made. Expenses (Part B) cannot start for a department until its decision is released.
- Optional: the accountant can add one shared message to all release emails (e.g. "Thank you for your work this year. The board approved the 2027 budget on Nov 12.").
- The scheduled release can be edited until it runs; a confirmation shows the number of emails that will be sent.

## FR-20: Excel Export

The accountant can export:

1. A single request (one click from the dashboard or department row).
2. All requests for an annual budget cycle.
3. Requests filtered by department.
4. Requests filtered by status.
5. Requested and approved budget summaries.

The primary format is `.xlsx`.

### Summary worksheet

Recommended columns:

- Request reference.
- Budget year.
- Department.
- Requester.
- Requester email.
- Submission date.
- Status.
- Tax rate.
- Requested subtotal.
- Requested sales tax.
- Requested total (incl. tax).
- Approved subtotal.
- Approved sales tax.
- Approved total (incl. tax).
- Difference.
- Approver.
- Approval date.
- Justification.
- Revision count.

### Line Items worksheet

Recommended columns:

- Request reference.
- Budget year.
- Department.
- Item name.
- Requested quantity.
- Requested unit price.
- Requested line total.
- Approved quantity.
- Approved unit price.
- Approved line total.
- Product link.
- Notes.
- Adjustment reason.

For a single-request export, the line-item sheet ends with Subtotal, Sales tax, and Total rows for both requested and approved columns.

### Spending worksheets (Church Administrator and accountant)

- **Budget vs Actual:** department, approved total, amendments, available budget, spent, remaining, percentage used, status.
- **Spending Ledger:** date, department, entry type, payee, description, amount, payment method, reference, related line item, entered by, status (voided rows shown and labelled), notes.
- **Amendments:** department, date, amount before tax, tax, amount including tax, reason, accountant.

### Additional requirements

- Use real numeric cells for amounts and quantities.
- Write stored, server-calculated values for tax and totals (not spreadsheet formulas), so the workbook matches the application exactly.
- Format monetary values consistently in CAD.
- Preserve links where possible.
- Include export generation date and selected filters.
- Use a consistent worksheet and file naming convention (e.g. `FY2027_Media_Budget_Youth_IFC-2027-0007.xlsx`).
- Prevent spreadsheet formula injection in user-provided text.
- Export authoritative server-side values.
- Restrict exports to authorized accountant users.
- Log export activity.

## FR-21: Email Notifications

Every update to a request, decision, or budget sends an email. "Requester" means every representative assigned to the request's department (FR-32). "Accountant" means the primary accountant, or the backup approver while the primary is marked away (FR-33).

### Request lifecycle

| Event | Requester | Accountant | Others |
|---|---|---|---|
| Request submitted | Receipt with full summary | New submission | — |
| Request revised by requester | Updated receipt, edits remaining | Revision notice with what changed | — |
| Review started (status becomes In Review) | "Your request is being reviewed" | — | — |
| Returned for clarification | Accountant's question and link | Copy for their records | — |
| Clarification response submitted | Receipt | Response notice with what changed | — |
| Approved as requested | Approval with totals (at release time if held, FR-19a) | Confirmation copy | Church Administrator: new budget available |
| Approved with changes | Approval with requested vs approved and reasons | Confirmation copy | Church Administrator: new budget available |
| Awaiting second approval (FR-34) | "Approved by accountant, awaiting final sign-off" | — | Second approver: approval needed |
| Second approval given or refused | Final outcome | Outcome | — |
| Declined | Reason | Confirmation copy | — |
| Request reopened, or extra edit granted | What is now allowed | Confirmation copy | — |
| Request ownership or representative changed (FR-32) | Old and new representatives | Notice | — |
| New message on a request (FR-31) | When the accountant writes | When the requester writes | — |

### Budget and spending

| Event | Requester | Accountant | Church Administrator |
|---|---|---|---|
| Budget amendment | New available budget and reason | Confirmation copy | Notice |
| Department reaches near-limit threshold | Notice | Alert | Alert |
| Department goes over budget | Notice | Alert | Alert |
| Spending period locked or reopened | — | Confirmation copy | Notice |
| Monthly spending summary (optional) | — | Summary | Summary |

### Cycle and reminders

| Event | Recipients |
|---|---|
| Budget cycle opened | All active department representatives |
| Deadline reminder (7 days and 1 day before) | Representatives of departments that have not submitted |
| Deadline passed | Accountant: list of outstanding departments |
| Cycle closed | All active department representatives |

### System

| Event | Recipients |
|---|---|
| Email delivery failed after retries | Administrators (daily digest) |
| New user signed in without access (access request) | Administrators |
| Role or department assignment changed | The affected user |

### Email rules

- Every email that contains amounts shows Subtotal, Sales tax (rate), and Total including tax.
- Every email includes the request reference, department, budget year, plain-language status, what changed, what (if anything) the recipient needs to do, and a secure link that requires sign-in.
- Request and decision emails cannot be turned off. Reminders, copies to the accountant, and the monthly summary can be turned off per user in their account settings.
- The accountant can choose instant emails (default) or one daily digest for new submissions and revisions.
- Notifications must be generated from authoritative server-side events, after the database change commits.
- Use a reliable email provider or approved church email service (see Section 20). Log attempted notifications, provider outcomes, and failures. Provide safe retry behavior without duplicating the underlying budget action.
- Every sent email is listed on the request's history so users can see what was sent and when.

## FR-22: Audit Trail

Record at minimum:

- Draft creation and deletion.
- Submission.
- Request revisions.
- Changed fields and item values.
- Return-for-clarification decisions.
- Declines.
- Line-item approval adjustments and overall adjustment entries.
- Overall approval.
- Reopening and exceptional revision permissions.
- Department and role changes.
- Tax-rate changes.
- Budget cycle configuration changes.
- Spending entries recorded, corrected, voided, and refunded.
- Budget amendments.
- Spending period locks and reopenings.
- Export activity.
- Notification attempts and failures.
- Sign-ins (success and failure, with the method: Google or Planning Center), sign-outs, and session expiry.
- Access denied events (a person tried a page or action their roles do not allow).
- Planning Center verification results and team-mapping syncs (FR-01a, FR-39).
- Primary and Backup requester changes (FR-38).
- Settings and branding changes, Away on and off, and decision release scheduling.
- Expense submissions, both approval levels, payments recorded, and receipt uploads and views (6B).
- Messages sent (the event, not the message text, which stays on the request).

Each audit event should contain:

- Event ID.
- Actor or system identity.
- Event type.
- Related request, if applicable.
- Timestamp.
- Relevant before-and-after values or a safe change summary.
- Reason, where applicable.
- The area (Annual Budget, Expenses, Spending, Admin, Access), the department and cycle when there is one, and the role the actor acted in.

Audit records must not be editable or deletable through normal user interfaces. They are append-only in the database (no update or delete grants for the application user on the audit table). Ordinary page views are not recorded, except views of receipts and exports, so the log stays useful and does not track people's browsing. The Activity, audit and analytics dashboard (FR-52) is the way to search and report on this log.

## FR-23: No Attachments

- Do not include file upload controls.
- Do not support drag-and-drop file uploads.
- Do not accept attachment fields in request APIs.
- Reject unexpected file payloads (e.g. `multipart/form-data` on request endpoints).
- Permit plain text URLs only in link fields.
- Do not store uploaded files because the application must not accept them. Exceptions, both separate from the annual budget form: the administrator's logo (FR-30), and receipts on expense claims if the church allows them (6B.9).
- This also applies to spending entries: receipts and invoices are referenced by number, never uploaded.

## FR-24: Spending Entries

The Church Administrator and the accountant can record spending against a department's budget for a cycle.

Each spending entry must include:

| Field | Requirement |
|---|---|
| Budget cycle | Required |
| Department | Required |
| Entry type | Required: Expense or Refund |
| Date of purchase/payment | Required; within the cycle's budget year unless the accountant allows otherwise |
| Payee / vendor | Required |
| Description | Required |
| Amount (CAD, including tax) | Required; greater than zero; stored in cents |
| Payment method | Required: Cheque, Church card, E-transfer, Cash, Staff reimbursement, Other |
| Receipt / invoice / cheque reference | Recommended; text only |
| Related approved line item | Optional |
| Notes | Optional |
| Overspend note | Required when the entry takes the department over budget |
| Entered by, entered at | System-recorded |
| Status | Recorded or Voided |

Requirements:

- Amounts are the actual amount paid, including tax, as shown on the receipt. The app does not add tax to spending entries, because approved budgets already include tax.
- Refunds reduce Spent.
- Entries can be corrected with a required reason; the previous values are preserved in the audit trail.
- Entries are never deleted; they are voided with a required reason and excluded from totals.
- Duplicate warning: if an entry with the same department, amount, date, and reference already exists, the app warns before saving.
- Spending can be recorded for a department with no approved budget only after confirming a warning; such entries are flagged **Unbudgeted** on the dashboard.

## FR-25: Budget vs. Actual Calculation

For each department and cycle:

**Available budget = Approved total (incl. tax) + Sum of budget amendments (incl. tax)**
**Committed = Sum of approved purchase requests not yet claimed, paid, or cancelled (Part B)**
**Spent = Sum of Expense entries − Sum of Refund entries (excluding voided entries)**
**Remaining = Available budget − Committed − Spent**
**Percentage used = (Committed + Spent) ÷ Available budget**

Requirements:

- Calculated on the server using the shared money module, in integer cents.
- Remaining may be negative; a negative remaining is shown as **Over budget by $X**.
- Spending status per department:
  - **On track:** under the near-limit threshold.
  - **Nearing limit:** at or above the near-limit threshold (default 80%).
  - **Over budget:** Committed + Spent greater than Available budget.
  - **No approved budget:** spending recorded but no approved request.
- The near-limit threshold is an administrator setting.
- Spending by approved line item is shown where entries were linked to a line item; unlinked entries are shown as "General".

## FR-26: Spending Dashboard

The Church Administrator and accountant see, for the selected cycle:

- Totals across all departments: available budget, spent, remaining, percentage used.
- A department table: department, approved total, amendments, available budget, spent, remaining, percentage used (progress bar with text, not colour alone), status, last entry date.
- A spending ledger with search and filters: department, date range, payment method, entry type, payee, entered by, status.
- Drill-down from a department to its ledger and approved line items.
- **Record spending** and **Export** actions.

## FR-27: Budget Amendments

- Only the accountant can create an amendment.
- An amendment is an increase or reduction, entered **including tax** (like the approved total), with a required reason and optional board reference. The app works out the tax inside it using the same tax-inclusive calculation as FR-16.
- The original approved total and approval record are never changed; amendments are separate, audited records.
- The requester receives an email for each amendment showing the new available budget.
- A reduction cannot be confirmed without a warning if it would make Remaining negative.

## FR-28: Spending Alerts and Requester Budget View

- Email the accountant (and optionally the Church Administrator) when a department first reaches the near-limit threshold and when it first goes over budget in a cycle.
- Optional monthly summary email to the accountant: spent and remaining per department.
- Requesters see a read-only **My department budget** panel on their dashboard: approved total, amendments, spent, remaining, and the list of spending entries (date, payee, description, amount). Payment method and reference numbers are hidden from requesters.
- Alerts are logged in the NotificationLog.

## FR-29: Spending Period Lock

- Each cycle has a spending period end date (default: end of the budget year).
- The accountant can lock the spending period for a cycle at year-end. After locking, the Church Administrator cannot add, correct, or void entries.
- The accountant can reopen a locked period with a reason (audited).
- Locking does not affect viewing or exporting.

## FR-30: Branding and Language

- The administrator can upload or replace the church logo (PNG, JPG, or SVG, maximum 1 MB; SVGs sanitized) and set the church name, application name, and accent color.
- Branding appears in the app, sign-in screen, emails, Excel exports, and print layouts, and changes take effect without a code change or redeploy.
- The accent color is rejected if it fails the contrast rules in the Design Requirements Document (section 3.2); the app suggests the nearest passing shade. A reset restores the default.
- Logo upload is the only file upload in the application, is limited to administrators, and does not change the no-attachments rule for requests and spending (FR-23).
- Branding changes are audited.
- The church's own System Administrator (G at launch) makes these changes from Admin → Settings → Branding; no developer is needed.
- The interface is English (Canada) only, with `en-CA` date and currency formatting.

## FR-31: Request Messages

- Each request has a message thread between the department's representatives and the accountant.
- Either side can post a plain-text message (maximum 2,000 characters, no attachments, links allowed).
- Each message emails the other side (FR-21) and appears in the request history.
- Messages do not change the request's status or use an edit. A formal **Return for clarification** remains the way to ask for changes.
- Messages cannot be edited or deleted after sending.
- Messages remain available after approval or decline, so questions about purchases can continue.

## FR-32: Shared Department Requests and Handover

- A department may have several representatives. All of them can view, edit, preview, and submit the department's request, and receive its emails.
- The two post-submission edits belong to the request, not the person: any representative's confirmed edit uses one.
- Every version records which representative made it.
- If two representatives edit at once, optimistic concurrency prevents overwrites (9.17).
- When a representative is removed from a department or deactivated, the department's requests stay with the department; remaining representatives keep access. If none remain, the request shows "No representative" on the accountant dashboard until the administrator assigns one.

## FR-33: Backup Approver

- More than one user can hold the accountant role. The administrator marks one as **Primary accountant** in Admin → Settings → Accountants; everyone else with the Accountant or Backup approver role is a **Backup approver**. If the Primary accountant loses the Accountant role or is deactivated, the setting is cleared and the administrator chooses a new one.
- The primary accountant can set **Away** (with optional dates). While away, accountant emails go to the backup approver(s), and the dashboards show who is covering.
- Backup approvers have the same permissions as the accountant.
- Nobody can approve, decline, or adjust a request for a department they are assigned to as a representative. Such requests are routed to another accountant-role user, and the review screen explains why.
- Every decision records which accountant made it.

## FR-34: Second Approval for Large Amounts (optional)

- Administrator setting: **Second approval threshold** (approved total including tax). Off by default.
- When set, an approval at or above the threshold moves the request to **Awaiting Second Approval** instead of Approved.
- A different accountant-role user must give the second approval or refuse it with a reason (refusal returns the request to In Review).
- The requester is told the request is awaiting final sign-off, and gets the approval email only after the second approval.

## FR-35: Copy Last Year's Request

- When starting a new request, a representative can choose **Start from last year's request** for the same department.
- The app copies the title, justification, and line items (names, quantities, unit prices, links, notes) into a new draft using the current tax rate.
- Approved values, history, messages, and the reference number are not copied.
- The draft must still be reviewed, previewed, and submitted as normal.

## FR-36: Help and Privacy

- A Help page with short guides for each role: how to submit, how edits work, how tax is calculated, how to approve, how to record spending.
- Contextual help links ("How is tax calculated?") on the form and review screens.
- Users can ask (through the Help page) to see or correct their personal information; the administrator handles it. Financial records are kept for the retention period and are not deleted on request.
- A privacy notice linked from the sign-in screen and footer, stating what personal information is stored (name, email, budget activity), why, who can see it, how long it is kept, and who to contact, written to meet Canadian privacy law (PIPEDA and the applicable provincial act).

---

## FR-37: One Application and "My Tasks" Home

- All roles use one application, one web address, and one sign-in (FR-01, FR-01a). There are no separate apps or portals per role.
- After sign-in, everyone lands on **Home**, which shows:
  - **My tasks:** every item needing this person's action, across all their roles, oldest first, each with what's needed and a button. Examples: "Respond to clarification: Media annual budget" (requester), "Review: Youth expense $1,008.00" (accountant), "Final approval: Worship expense $2,240.00" (Board Chair or Vice-Chair), "Process payment: EXP-2027-0042" (Church Administrator), "Proposed department: Prayer Team" (administrator).
  - **At a glance** cards for each role the person holds (e.g. their department's budget; the accountant's submission counts; the Church Administrator's amount waiting to be paid).
  - Recent activity relevant to them.
- Navigation shows the union of the person's roles, grouped by area (Annual Budget, Expenses, Spending, Reports, Admin), not by role.
- The task list count appears as a badge on Home, and the same items drive reminder emails (FR-21, FR-49).
- Tasks disappear as soon as they are done or handled by someone else (e.g. the Vice-Chair approves while the Chair is away).

## FR-38: Primary and Backup Requester per Department

Purpose: every department has a named person accountable for its budget and a second person who can step in, so a budget or expense is never stuck because one leader is busy or away.

- Each active department has one **Primary requester** and, optionally, up to two **Backup requesters**, ranked **Backup 1** and **Backup 2** (for example, a department with two locations). All must be verified Group Leaders (FR-01a). A lone Backup is always Backup 1. Other representatives (FR-32) remain allowed and keep their access; they show as "Representative".
- Who sets them:
  - The administrator sets or changes the Primary and Backups on Admin → Departments. Giving a taken place to someone else makes its holder a Representative; moving a leader into another leader's place swaps them.
  - The Primary can nominate Backup 1 and Backup 2 from verified Group Leaders on their department page. The nomination takes effect at once, is audited, and the administrator is emailed and can undo it.
  - The first person to pick a department on the form (FR-03) becomes its Primary if it has none; anyone after that becomes a Representative until the administrator or Primary changes it.
- Both the Primary and the Backup can do everything a representative can: create, edit, preview and submit the annual budget, answer clarifications, send messages, and submit expenses for the department. Edits still belong to the request (FR-32): together they cannot exceed 2.
- Emails: every representative receives the department's request emails (FR-21). The Primary is shown as the contact on the accountant dashboard, Excel exports, and emails to approvers.
- My tasks (FR-37): department tasks (for example "Respond to clarification") appear for the Primary and both Backups. Reminder emails go to the Primary first; if the task is still open after the **escalation delay** (administrator setting, default 3 days), both Backups are reminded too and the task shows "Backup reminded".
- Away: the Primary can set Away with dates (as in FR-33). While Away, reminders and new-task emails go to both Backups, and the department page shows "Covered by {Backup 1} until {date}" (and Backup 2 when there is one).
- If the Primary is suspended (FR-01a), deactivated, or removed, Backup 1 becomes Primary automatically, Backup 2 (if any) moves up to Backup 1, and the administrator is emailed. If Backup 1 is removed, Backup 2 moves up. With no Backup left, the department shows "No backup" until one is set. If nobody remains, FR-32's "No representative" rule applies.
- The accountant dashboard and Admin → Departments show a "No backup" badge for departments with no Backup at all. The administrator can filter on it.
- Conflict of interest (FR-33, 3.3) applies to the Primary and the Backup in the same way as to any representative.
- Every change of Primary or Backup is audited with who made it and why (reason optional for administrator changes, automatic text for system promotions).

## FR-39: Planning Center Team Mapping for Departments

Purpose: the church already organizes its ministries in Planning Center (for example the Media team that runs ProPresenter is a team in Planning Center Services, with its team leaders). Mapping each department to that team keeps the app's department leaders in step with Planning Center instead of entering them twice.

Confirmed by G (2026-10-15): departments are tagged in Planning Center the same way ministry leaders are, and the app maps to that team, group, tag or field.

- On Admin → Departments → **Planning Center mapping**, the administrator links each department to **one** source:
  - a **Services team** (for example "Media / Production"): its **team leaders** are the department's leaders;
  - a **Groups group** (or every group with a chosen **group tag**): its group **leaders** are the department's leaders;
  - a **People custom field value** (for example field "Department" = "Media"): people with that value, who also pass the Group Leader check, are the department's leaders.
- The list of teams, groups, tags and field values is loaded from Planning Center, read-only, using the church's server credentials (the same Personal Access Token as FR-01a). The app never writes to Planning Center.
- **Sync:** at each sign-in for that person, and in the nightly `pco-verify` job for all mapped departments. The admin page shows the last sync time and a **Sync now** button.
- **Mode** per department (administrator setting):
  - **Suggest** (default): leaders found in Planning Center appear on the department as "Suggested by Planning Center"; the administrator clicks **Add** (as Primary, Backup or Representative) or **Ignore**. People who left the team are flagged "No longer a team leader in Planning Center" but keep access until the administrator removes them.
  - **Automatic:** leaders found are added as Representatives automatically (the Primary and Backup are still chosen by a person, FR-38), and people who are no longer leaders are removed at the next sync. The department's requests stay with the department (FR-32).
- A mapped leader still has to pass the Group Leader check (FR-01a) to act as a requester. The mapping decides **which** department; the custom field decides **whether** they are a leader. The administrator can turn on "Team leaders count as Group Leaders" per department, which skips the custom field check for that department's mapped leaders.
- A first-time Group Leader who is a mapped leader of exactly one department lands on that department instead of "Waiting for department assignment" (Automatic mode) or sees "Your administrator has been asked to confirm you for Media" (Suggest mode).
- The app stores only the mapping (source type, Planning Center ID, display name), and for each person the source they were matched through and the last sync time (9.3, 9.4). No other Planning Center data is imported.
- If Planning Center is unavailable, the last known mapping stays in force; the 72-hour rule of FR-01a applies to verification.
- Every mapping change, sync result (added, flagged, removed), and administrator decision on a suggestion is audited.
- Unmapped departments work exactly as before (assigned in the app).

## FR-53: Cheque Signing Authorities

- The administrator keeps the list of people who can sign church cheques on Admin → Settings → **Signing authorities**: name, optional email, and active from and to dates. Signers don't need an app account. The list is built in Stage 1 (Admin), so it's ready before Record payment uses it in Stage 3.
- **Add** a signer at any time. **Remove** marks them inactive from a date (with an optional reason); they disappear from the Record payment dialog but stay on every past payment they signed. Signers are never deleted (CLAUDE.md rule 6).
- A signer can be edited (for example a name spelling); past payments keep the name as it was when recorded.
- Record payment (6B.5) offers only active signers and requires two different people for a cheque.
- The page warns when fewer than two active signers remain, since cheques cannot be recorded.
- Every change is audited.

## FR-52: Activity, Audit and Analytics Dashboard

Purpose: one place to see everything that happens on the platform, answer "who did what, when and why", and see how the budget year is going, without exporting to Excel first.

Location: **Reports → Analytics & Audit** in the one app (FR-37). What each person sees follows the matrix in 3.6; the server filters every query by role and department.

### Overview tab (analytics)

- Filters at the top that apply to the whole page and are kept in the address so a view can be bookmarked or shared: budget cycle (default: current), department, area (Annual Budget, Expenses, Spending), date range.
- **Headline cards:** board total vs allocated; requested vs approved (with tax); committed, spent, remaining; expenses waiting at each approval level; payments waiting; average days from submission to decision and from approval to payment.
- **Charts:**
  - Annual budget status by department (stacked bar: Not started, Draft, Submitted, In review, Approved, Declined).
  - Budget vs actual by department (bar, with remaining and overspend highlighted).
  - Spending over time (monthly line, current vs last year when there is one).
  - Expense pipeline (counts and amounts at each status).
  - Turnaround times (accountant review, Board Chair approval, payment), with the slowest items listed.
- Every chart has a table view and an **Export** button (Excel, FR-20 rules). Clicking a bar or row drills down to the list of items behind it, then to the item itself.
- All amounts are computed on the server from the same `money.ts` totals as the rest of the app, so the dashboard, exports and emails agree to the cent.

### Activity tab (audit log)

- A searchable, filterable timeline of every audit event (FR-22): when, who (and the role they acted in), what, which item, and the reason. Each row expands to show before-and-after values.
- Filters: person, role, area, event type (with groups such as "Decisions", "Money changes", "Access and sign-in", "Settings"), department, cycle, date range, and a free-text search over reference numbers and names.
- Quick views: "Today", "Decisions this week", "Money changes", "Failed sign-ins and access denied", "Settings and role changes", "Emails that failed".
- Clicking a reference number opens the item with its full history. Each item's own History tab shows the same events for that item only.
- **Export** the filtered log to Excel. Exporting the audit log is itself audited.

### Access tab (administrator only)

- Sign-ins per day and by method, failed sign-ins, access denied attempts, suspended Planning Center verifications, departments without a Backup requester (FR-38), mapping sync problems (FR-39).
- Each row links to the user or department to fix it.

### Alerts

- The administrator can turn on a weekly summary email (off by default) with the headline cards and anything unusual: repeated failed sign-ins for one account, access denied spikes, settings changes, audit export.
- These go through the outbox (FR-21) and appear in My tasks for the administrator when there is something to act on.

### Rules

- Read-only: nothing on this dashboard changes data; actions happen on the item's own page.
- Requesters see only their own department's analytics and activity, without payment details (20.1).
- Charts follow DRD 6.13: accessible colours, table alternatives, keyboard navigation, and no information conveyed by colour alone.
- Performance: the Overview loads within the targets in 13.1 for a full year of data; heavy figures may be pre-computed by the nightly job and labelled "Updated at {time}".

# 6B. Part B: Expense Submissions

Part A sets each department's yearly budget. Part B is how the department uses that budget during the year: it asks permission before buying (purchase request), or claims money back after buying (expense claim). Every approved expense is taken from the department's approved annual budget, and the Budget vs Actual view (FR-25) always shows what is left.

## 6B.1 Submission types

| Type | When | Amounts entered | What approval does |
|---|---|---|---|
| **Purchase request** | Before buying | Items: name, quantity, unit price **before tax**; the app adds 12% tax (same calculation as Part A, FR-07/FR-07a). | Approved amount becomes **Committed** against the budget. |
| **Expense claim** | After buying (staff/volunteer paid personally, or church card used) | One line per receipt: date, vendor, description, **amount paid including tax** (from the receipt). The app does not add tax. | Approved amount becomes **Spent**; if someone is owed money, it joins the payment queue. |

A purchase request, once the item is bought, is closed by an expense claim (or a Church Administrator spending entry) linked to it. The commitment is released and the actual amount becomes Spent.

## 6B.2 Who can do what

| Capability | Requester (department rep) | Accountant / backup approver | Church Administrator | Administrator |

The Board Chair holds only the second-approval capability (3.3).

|---|---|---|---|---|
| Create, edit, submit expense submissions for own departments | Yes | Only if also a rep | Only if also a rep | Only if also a rep |
| Submit a claim on behalf of another person (e.g. a volunteer) | Yes, naming the payee | — | Yes | — |
| First approval: approve, approve a different amount, return, decline | No | Yes (not for own department) | No | No |
| Second approval (Board Chair or backup board approver) | No | No | No | No |
| Process payment or purchase, record how it was paid | No | Yes | Yes | No |
| Cancel an approved purchase request that won't go ahead | Yes (own department) | Yes | No | No |
| View all expense submissions | Own departments | All | All | No |
| Export expense reports | No | Yes | Yes | No |

The administrator can optionally give the **Expense submitter** permission to a person who is not a department representative (for example, a volunteer who buys for Media); they can submit only for the departments they are given.

## 6B.3 Requester workflow

1. Open **Expenses** and select **New expense submission**.
2. Choose type: **Purchase request** or **Expense claim**.
3. Select department. The app shows the department's Available budget, Committed, Spent, and Remaining. If the department has no approved annual budget for the current year, submission is blocked with an explanation.
4. Enter title and justification (why this is needed).
5. Purchase request: add items (name, quantity, unit price before tax, optional link, optional link to an approved annual-budget line item). Expense claim: add receipt lines (date, vendor, description, amount paid incl. tax, optional link to an approved purchase request).
6. Expense claim only: enter who should be paid (**Payee**: self or another named person, or "Church card, nothing owed") and their preferred payment method (cheque or e-transfer, with e-transfer email). No bank account numbers are collected.
7. Expense claim only: attach receipt images or PDFs (see 6B.9).
8. Review the totals: Subtotal, Sales tax (12%), Total (purchase request) or Total paid (claim); plus Remaining after this submission.
9. If the submission would take the department over budget, a warning appears and an **Over-budget explanation** is required.
10. Preview, then **Confirm submission**.
11. Receipt email to the requester (and payee if different); notice email to the accountant.

## 6B.4 Two-level approval workflow

Every expense submission (purchase request and expense claim, any amount) needs two approvals.

**Level 1: Accountant**

1. Open the Expenses review queue (filters: department, type, status, amount, date, over-budget).
2. Open a submission: details, items/receipts, receipt files, budget impact (Remaining before and after), linked purchase request, history, messages.
3. Choose: **Approve and send to Board Chair**, **Approve a different amount and send to Board Chair** (one total incl. tax with a reason; tax worked out inside it as in FR-16), **Return for clarification** (to the requester), or **Decline** (reason required, ends the process).
4. On approval, the status becomes **Awaiting Board Chair**; the Board Chair is emailed; the requester is emailed "Approved by the accountant, waiting for the Board Chair".

**Level 2: Board Chair**

5. The Board Chair opens their queue (email link or dashboard) and sees the submission, the accountant's approved amount and note, the budget impact, and receipts.
6. Choose: **Give final approval**, **Approve a smaller amount** (incl. tax, with reason), **Return to accountant** with a question (status back to In Review; the accountant can then ask the requester), or **Decline** (reason required).
7. On final approval, the status becomes **Approved**, and:
   - the requester (and payee, if different) receives **"Your expense has been approved"** with the final amount;
   - the **Church Administrator** receives **"Approved, ready for processing"** with what to pay or buy, the payee, payment preference, and a link;
   - the accountant receives a copy;
   - the budget updates (Committed for purchase requests, Spent for claims; FR-42).

The Board Chair cannot raise the amount above what the accountant approved.

## 6B.5 Processing and payment (Church Administrator)

After both approvals, the Church Administrator carries out the next step outside the app and records it:

1. Open the **Ready to process** queue: approved submissions, oldest first, with type, payee, amount, and the requester's preference.
2. Select **Start processing** (status **Processing**; the requester is emailed "Your expense is being processed").
3. Complete the payment or purchase outside the app, then select **Record payment**:

| Field | Requirement |
|---|---|
| How it was paid | Required: **Cheque**, **Church card (purchased on church account)**, **Cash / petty cash**, **E-transfer**, **Supplier invoice paid by church (EFT)**, **Other** (text) |
| Date paid | Required |
| Amount paid (incl. tax) | Required; defaults to the approved amount; a difference needs a note |
| Reference | Cheque number, card last 4 digits and transaction reference, e-transfer reference, or invoice number |
| Cheque signers | For cheques: the two signing authorities who signed (chosen from the active signers list the administrator maintains, FR-53) |
| Purchased by | For church-card or supplier purchases: who made the purchase |
| Cash received by | For cash: who received it (and a "receipt signed" checkbox) |
| Notes | Optional |

4. Confirm. The status becomes **Paid** (expense claim) or **Purchased** (purchase request bought on the church account); the requester and payee are emailed with how and when it was paid; a spending entry is created (FR-42).
5. If the requester buys the item themselves after a purchase request is approved, they submit an expense claim linked to it, which follows the same two approvals and payment steps.

Claims already paid on the church card by the requester are recorded by the Church Administrator with **How it was paid: Church card** and no money owed.

## FR-40: Expense Submission Fields

| Field | Purchase request | Expense claim |
|---|---|---|
| Reference number | System (e.g. `EXP-2027-0042`) | System |
| Budget cycle | Required (current open year) | Required (year of the purchase date) |
| Department | Required, from assigned departments | Required |
| Title | Required | Required |
| Justification | Required, max 2,000 chars | Required, max 2,000 chars |
| Items / receipt lines | ≥ 1 item: name, quantity > 0, unit price ≥ 0 (before tax), optional link, optional annual-budget line | ≥ 1 line: date, vendor, description, amount paid > 0 (incl. tax), optional receipt number |
| Totals | Subtotal, Sales tax (12%), Total (calculated) | Total paid (sum of lines) |
| How it will be bought | Required: **Church Administrator buys on church account**, **I'll buy and submit a claim**, or **Supplier will invoice the church** | — |
| Linked purchase request | — | Optional (approved, not yet closed, same department) |
| Payee and payment preference | — | Required: self / named person / church card; cheque or e-transfer email |
| Receipts | — | See 6B.9 |
| Over-budget explanation | Required if over budget | Required if over budget |
| Requester, timestamps, status, edit count | System | System |

## FR-41: Expense Calculations

- Purchase requests use the same shared calculation as Part A: line totals before tax, subtotal, 12% tax on the subtotal rounded half-up to the cent, total.
- Expense claims sum the receipt amounts as entered (already including tax); no tax is added.
- "Approve a different amount" is entered including tax for both types.
- Server recalculates everything; client values are ignored.
- The tax rate is snapshotted at submission (as in FR-07a).

## FR-42: Budget Impact

- Approved purchase request: its approved total is added to **Committed** for the department.
- Expense claim linked to a purchase request: on approval, the purchase request's commitment is released and the claim's approved total is added to **Spent**. If the claim is less than the purchase request, the difference returns to Remaining; if more, the claim shows the overage and the accountant sees it before approving.
- Unlinked expense claim: on approval, added to **Spent**.
- Cancelled purchase request: commitment released.
- Declined or returned submissions do not affect the budget. Submitted-but-not-yet-approved submissions are shown as **Pending** on the budget view for information, but are not deducted.
- Every approved expense claim creates a linked spending entry (FR-24) automatically, so the Spending ledger includes it without re-typing. The Church Administrator can still record spending entries directly for invoices paid by the church that never went through a claim.

## FR-43: Over-Budget Submissions

- Allowed, but the requester must give an over-budget explanation, and the accountant's review screen shows "This takes Media over budget by $X".
- The accountant may approve (the department becomes Over budget and alerts fire as in FR-28), approve a smaller amount, return, or decline, or first create a budget amendment (FR-27).

## FR-44: Editing and Withdrawing

- Requesters can edit a submitted expense submission freely until the accountant starts the review (status In Review). After that, changes are only possible through Return for clarification.
- A requester can withdraw a submission before it is approved (status Withdrawn).
- An approved purchase request can be cancelled by the department or accountant if the purchase will not happen, with a reason.
- Every version is preserved, as in Part A.

(The two-edit limit applies to the annual budget only; expense submissions are smaller and frequent, so editing is open until review begins.)

## FR-45: Expense Statuses

| Status | Meaning |
|---|---|
| Draft | Not submitted. |
| Submitted | Waiting for the accountant. Editable by the requester. |
| In Review | The accountant is reviewing. |
| Returned for Clarification | The accountant has a question. |
| Awaiting Board Chair | Approved by the accountant; waiting for the Board Chair's final approval. |
| Approved | Both approvals given. Ready for the Church Administrator to process. |
| Processing | The Church Administrator is preparing the cheque, payment, or purchase. |
| Paid | Expense claim: money paid to the payee (method recorded). |
| Purchased | Purchase request: bought on the church account (method recorded). |
| Closed | Purchase request: claimed or recorded as spent. Expense claim: paid by church card, or paid and finished. |
| Cancelled | Approved purchase request that will not go ahead; commitment released. |
| Withdrawn | Withdrawn by the requester before approval. |
| Declined | Not approved; reason given. |

Valid transitions: Draft → Submitted → In Review → (Returned for Clarification → Submitted) | Declined | Awaiting Board Chair; Awaiting Board Chair → Approved | Declined | In Review (returned to accountant); Approved → Processing → Paid | Purchased → Closed; Approved (purchase request) → Cancelled, or → Closed when a linked claim is paid; Submitted → Withdrawn. Enforced on the server. FR-34 (amount threshold) does not apply to expenses, because every expense already has two approvals.

## FR-46: Claim Deadlines and Year-End

- Expense claims should be submitted within a configurable number of days of the purchase (default 90). Older claims show a warning and require an explanation.
- Expense submissions are charged to the budget year of the purchase date (claims) or submission date (purchase requests).
- When the accountant locks the spending period (FR-29), new expense submissions for that year are blocked; approved purchase requests still open at year-end are listed for the accountant to cancel or carry over (carry-over creates a commitment in the next year's budget with a reason).

## FR-47: Duplicate and Fraud Checks

- Warn when a claim line matches an existing line (same department, vendor, date, and amount) or the same receipt number.
- Warn when the requester is also the payee and the approver would be the same person (blocked by FR-33).
- Approvers cannot approve their own expense claims or those where they are the payee.

## FR-48: Expense Dashboard and Lists

- **Requester:** My expense submissions with status, amount, and what's needed; the department budget panel shows Available, Committed, Pending, Spent, Remaining.
- **Accountant:** review queue, counts by status, total awaiting approval, over-budget flags, oldest waiting.
- **Church Administrator:** payment queue, recently paid, totals owed.
- Search and filters on all lists: department, type, status, payee, date range, amount.

## FR-49: Expense Emails

Same rules as FR-21 (every update emails the people involved).

| Event | Requester (+ payee if different) | Accountant | Board Chair | Church Administrator |
|---|---|---|---|---|
| Submitted | Receipt | New submission | — | — |
| Edited before review | Updated receipt | Update notice | — | — |
| Review started | Notice | — | — | — |
| Returned for clarification | Question and link | Copy | — | — |
| Approved by accountant | "Approved by the accountant, waiting for the Board Chair" | Copy | **Approval needed** | — |
| Returned to accountant by Board Chair | — | Board Chair's question | Copy | — |
| **Final approval by Board Chair** | **"Your expense has been approved"** with final amount | Copy | Copy | **"Approved, ready for processing"** |
| Declined (either level) | Reason and who declined | Copy | Copy (if they declined) | — |
| Withdrawn or cancelled | Confirmation | Notice | Notice (if it was waiting for them) | Notice (if approved) |
| Processing started | "Being processed" | — | — | — |
| Paid / Purchased | How and when it was paid, reference | Copy | — | Copy |
| Over budget after approval | Notice | Alert | — | Alert |
| Waiting for Board Chair over 7 days | — | Notice | Reminder | — |
| Approved but not processed after 14 days | — | Reminder | — | Reminder |
| Approved purchase request not purchased or claimed after 60 days | Reminder | — | — | Reminder |

## FR-50: Expense Exports

Excel workbooks (same rules as FR-20):

- **Expense submissions:** reference, type, department, requester, payee, submitted, status, requested total, approved total, approver, approved date, paid date, payment reference, linked purchase request.
- **Expense lines:** items or receipt lines for each submission.
- **Payments:** paid claims by date range, for bank reconciliation.
- **Budget vs Actual** (FR-20) gains Committed and Pending columns.

## FR-51: Expense Audit

Audit every create, edit, submit, withdraw, review start, decision, cancellation, payment, receipt file added or removed, and link between claim and purchase request (FR-22 applies).

## 6B.9 Receipts on expense claims

Confirmed by G (2026-10-15): **receipts are allowed on expense claims only**.

- Up to 5 files per claim, 10 MB each; JPG, PNG, HEIC (converted to JPG), or PDF. Phone camera capture supported.
- Files are virus-scanned, stored privately, viewable only by the claim's department representatives, approvers, and Church Administrator, through signed short-lived links.
- At least one receipt is required per claim unless the requester ticks "No receipt available" and explains why (accountant sees this).
- The no-attachments rule for Part A annual budget submissions and for purchase requests is unchanged.
- Receipt files are kept for the retention period (6 years) and are included as links, not files, in Excel exports.

If the church chooses **no attachments**, receipt lines keep a required receipt number, and the paper receipt is handed to the office; the Church Administrator ticks **Paper receipt received** before marking a claim Paid.

## 6B.10 Expense data model

**ExpenseSubmission**: `id`, `reference_number`, `type` (`purchase_request`, `expense_claim`), `budget_cycle_id`, `department_id`, `requester_user_id`, `title`, `justification`, `status`, `tax_rate`, `subtotal`, `tax`, `total`, `approved_total`, `approved_subtotal`, `approved_tax`, `approval_note`, `over_budget_explanation`, `linked_purchase_request_id`, `payee_name`, `payee_email`, `payee_user_id`, `payment_preference`, `no_receipt_reason`, `version`, timestamps.

**ExpenseItem** (purchase request): `id`, `expense_submission_id`, `item_name`, `quantity`, `unit_price`, `line_total`, `product_url`, `annual_line_item_id`, `sort_order`.

**ExpenseReceiptLine** (claim): `id`, `expense_submission_id`, `purchase_date`, `vendor`, `description`, `amount` (incl. tax), `receipt_number`, `sort_order`.

**ExpenseReceiptFile** (if receipts allowed): `id`, `expense_submission_id`, `storage_key`, `file_name`, `content_type`, `size_bytes`, `scan_status`, `uploaded_by_user_id`, `uploaded_at`.

**ExpenseRevision**: as RequestRevision in Part A.

**ExpenseDecision**: `id`, `expense_submission_id`, `level` (`accountant`, `board_chair`), `decision` (`approved`, `approved_different_amount`, `returned`, `declined`), `approved_total`, `reason`, `decided_by_user_id`, `created_at`.

**ExpensePayment**: `id`, `expense_submission_id`, `method` (`cheque`, `church_card`, `cash`, `e_transfer`, `supplier_eft`, `other`), `method_other`, `paid_on`, `amount`, `reference`, `cheque_signer_1`, `cheque_signer_2`, `purchased_by`, `cash_received_by`, `receipt_signed`, `notes`, `recorded_by_user_id`, `recorded_at`.

AppSetting gains `board_chair_user_id`, `backup_board_approver_user_ids`, and the list of `cheque_signing_authorities`.

SpendingEntry gains `expense_submission_id` (nullable). AppSetting gains `claim_deadline_days` (90), `unclaimed_purchase_reminder_days` (60), `payment_reminder_days` (14).

## 6B.11 Expense acceptance criteria

See Section 14, group **Expenses (Part B)**.

---

# 7. UI/UX Design Requirements

## 7.1 Design Principles

The product should look like a professional financial workflow application rather than a generic online survey.

The design must prioritize:

1. Clarity.
2. Trust.
3. Consistency.
4. Fast data entry.
5. Error prevention.
6. Traceability.
7. Accessibility.
8. Responsive behavior.

Decorative effects must never interfere with financial information or critical actions.

## 7.2 Navigation

One application for all roles (FR-37). Everyone lands on **Home** with **My tasks**; navigation is grouped by area (Annual Budget, Expenses, Spending, Reports, Admin) and shows what the person's roles allow. The full navigation map is in DRD 6.0.

The requester's view of Home shows: active budget year and deadline, their department's annual budget status and remaining edits, items returned for clarification, their expenses in progress, and their department's budget, committed, spent, and remaining.

## 7.3 Request Form Layout

Use a guided multi-step form:

**Step 1 — Request details**
- Annual budget cycle.
- Department (selector).
- Request title.
- Justification ("Why are you requesting this budget?").

**Step 2 — Budget items**
- Item description.
- Quantity.
- Unit price (before tax).
- Calculated line total.
- Optional product link.
- Optional notes.
- Add/remove/reorder item actions.
- Running Subtotal, Sales tax (12%), and Total (incl. tax).

**Step 3 — Preview**
- Complete read-only request.
- Itemized amounts.
- Subtotal, sales tax, and total including tax.
- Edit navigation.

**Step 4 — Confirmation**
- Explicit submit action.
- Confirmation state.
- Request reference number.

A progress indicator should show the current step and remaining steps.

## 7.4 Automatic Total Presentation

Display each line total beside the corresponding item.

The totals block (Subtotal, Sales tax, Total) should remain visible while the user enters data (sticky footer on mobile, sticky side panel on desktop) when practical.

Example:

| Item | Quantity | Unit price | Line total |
|---|---:|---:|---:|
| Wireless microphone | 2 | $450.00 | $900.00 |
| Audio cable | 5 | $25.00 | $125.00 |
| **Subtotal** | | | **$1,025.00** |
| Sales tax (12%) | | | $123.00 |
| **Total (incl. tax)** | | | **$1,148.00** |

All amounts in the interface must be formatted as CAD.

The totals should update immediately and never be manually editable.

## 7.5 Preview Design

The preview should resemble a formal budget submission.

It must present the request in a readable, well-spaced layout with clear headings for:

- Request information.
- Justification.
- Itemized budget.
- Subtotal, sales tax, and total including tax.
- Submission confirmation.

The user must be able to navigate back to editing without losing entered data.

The confirmation action must be visually distinct and require deliberate user interaction.

## 7.6 Accountant Dashboard

Recommended layout:

### Summary area

- Departments expected.
- Departments submitted.
- Outstanding departments.
- Awaiting review.
- Total requested (incl. tax).
- Total approved (incl. tax).

### Department completion table

Show each department, submission status, requested amount, approved amount, outstanding action, and a download button.

### Review queue

Show request reference, department, requester, submitted date, requested total, status, and available actions.

### Filters

- Budget year.
- Department.
- Status.
- Requester.
- Submission date.

### Review screen

Provide separate sections for:

1. Request information.
2. Justification.
3. Requested line items.
4. Approved line items (editable amounts).
5. Requested versus approved comparison: Subtotal, Sales tax, Total, Difference.
6. Revision history.
7. Accountant comments.
8. Decision controls: **Approve as requested**, **Approve with changes**, **Return for clarification**, **Decline**.

Approval, return, and decline actions must be visually distinct and require confirmation.

## 7.7 Motion and Interaction

Use restrained, purposeful animation for:

- Adding and removing item rows.
- Expanding request details.
- Showing validation messages.
- Transitioning between form steps.
- Displaying save and submission confirmations.
- Updating dashboard statuses.

Use consistent icons where they improve comprehension.

Avoid excessive animation, decorative emoji, flashing totals, or effects that distract from financial decisions.

Respect reduced-motion preferences and provide immediate feedback for important actions.

## 7.8 Responsive Design

The application must work on:

- Desktop.
- Laptop.
- Tablet.
- Mobile phone.

On small screens, item tables may become stacked item cards while preserving every required field.

Do not require horizontal scrolling for essential form fields on a typical mobile viewport.

Critical actions must remain accessible without covering form inputs or totals.

## 7.9 Accessibility

Target WCAG 2.2 AA.

Requirements:

- Keyboard-accessible controls.
- Visible focus states.
- Proper form labels.
- Accessible validation messages.
- Sufficient contrast.
- Screen-reader-friendly totals and status updates (announce updated total politely, not on every keystroke).
- Semantic headings and tables.
- No reliance on color alone.
- Touch targets suitable for mobile.
- Reduced-motion support.

---

# 8. Information Architecture

One application; pages appear according to the person's roles (FR-37). Full screen designs: DRD 14.3.

**Everyone:** Sign in (Google or Planning Center) · Access denied variants · Home with My tasks · Account settings (theme, email preferences, Away) · Help · Privacy notice.

**Annual Budget (Part A):** Submit annual budget (Details → Items → Preview → Confirmation) · Drafts · Start from last year · Budget details and history · Edit submitted budget · Clarification response · Messages panel · Accountant dashboard and department completion · Accountant review (approve as requested, approve a different amount, line changes, return, decline, reopen) · Decision release · Board total vs allocated.

**Expenses (Part B):** New expense (type chooser) · Purchase request form · Expense claim form with receipts · Preview and confirmation · My expenses · Expense details with approval tracker · Accountant review queue and review · Board Chair / Vice-Chair queue and review · Ready to process queue · Record payment.

**Spending:** My department budget (requester) · Spending dashboard · Record spending / correct / void · Department ledger · Budget amendment · Spending period lock.

**Reports:** Excel exports (annual budgets, line items, budget vs actual, spending ledger, amendments, expenses, expense lines, payments) · Analytics & Audit dashboard: Overview, Activity, Access (FR-52).

**Admin:** Users and roles · Departments, Primary and Backup requesters, Planning Center mapping, and Proposed departments · Budget cycles · Settings (tax rate, thresholds, Planning Center, branding, email, signing authorities, time zone) · Notifications and audit · Read-only views of everything.

Navigation must be role-aware and must not expose actions to unauthorized users.

---

# 9. Proposed Data Model

Part B (expense) tables are in 6B.10.

The database must preserve historical requests, revisions, and decisions without relying on mutable display names. All money columns are integer cents (or exact decimal). The tax rate is an exact decimal (e.g. `NUMERIC(5,4)`).

## 9.1 User

- `id`
- `google_subject_id` (nullable)
- `pco_person_id` (nullable, unique)
- `email`
- `pco_leader_verified` (boolean)
- `pco_verified_at`
- `pco_field_value_snapshot`
- `access_status` (`active`, `suspended_not_leader`, `pending_department`, `inactive`)
- `display_name`
- `active`
- `created_at`
- `updated_at`

## 9.2 Role

- `id`
- `name`

Suggested values:

- `requester`
- `accountant`
- `church_administrator`
- `board_chair`
- `backup_board_approver`
- `administrator`

A separate user-role association table is recommended if users may have multiple roles.

## 9.3 Department

- `id`
- `name`
- `description`
- `status` (`active`, `inactive`, `proposed`, `rejected`)
- `proposed_by_user_id` (nullable)
- `merged_into_department_id` (nullable)
- `pco_source_type` (nullable: `services_team`, `groups_group`, `groups_tag`, `people_field_value`) (FR-39)
- `pco_source_id` (nullable)
- `pco_source_name` (nullable, display snapshot)
- `pco_mapping_mode` (`suggest` or `automatic`, default `suggest`)
- `pco_leaders_count_as_group_leaders` (boolean, default false)
- `pco_last_synced_at` (nullable)
- `version`
- `created_at`
- `updated_at`

## 9.4 UserDepartment

- `user_id`
- `department_id`
- `representative_type` (`primary`, `backup`, `representative`) (FR-38). A partial unique index allows at most one `primary` and one `backup` per department.
- `source` (`manual`, `form_pick`, `pco_mapping`)
- `pco_status` (nullable: `suggested`, `confirmed`, `no_longer_leader`, `ignored`)
- `pco_last_seen_at` (nullable)
- `away_from`, `away_until` (nullable, Primary only)
- `created_at`
- `assigned_by_user_id`

This supports users who represent multiple departments.

## 9.5 BudgetCycle

- `id`
- `name`
- `budget_year`
- `start_date`
- `submission_deadline`
- `status`
- `currency`
- `default_tax_rate`
- `created_by_user_id`
- `created_at`
- `updated_at`

## 9.6 AppSetting

- `key` (e.g. `sales_tax_rate`, `accountant_notification_email`, `email_sender_address`)
- `value`
- `updated_by_user_id`
- `updated_at`

`sales_tax_rate` defaults to `0.1200`. Branding keys: `church_name`, `app_name`, `accent_color`, `logo_asset_id`, `icon_asset_id`.

## 9.7 BudgetRequest

- `id`
- `reference_number`
- `budget_cycle_id`
- `department_id`
- `requester_user_id`
- `department_name_snapshot`
- `title`
- `justification`
- `status`
- `tax_rate` (snapshot at first submission)
- `requested_subtotal`
- `requested_tax`
- `requested_total`
- `approved_subtotal`
- `approved_tax`
- `approved_total`
- `edit_count`
- `version_number`
- `submitted_at`
- `approved_at`
- `declined_at`
- `closed_at`
- `created_at`
- `updated_at`

Approved amounts remain null until a valid approval occurs.

## 9.8 BudgetLineItem

- `id`
- `budget_request_id`
- `item_name`
- `quantity`
- `unit_price`
- `line_total`
- `product_url`
- `notes`
- `sort_order`

Store approved values separately from the original requested values. This can be implemented through a dedicated approval-line table or versioned approval records.

## 9.9 ApprovedLineItem

- `id`
- `budget_line_item_id`
- `approved_quantity`
- `approved_unit_price`
- `approved_line_total`
- `adjustment_reason`
- `approved_by_user_id`
- `approved_at`

Approved values must remain associated with the specific submitted request version being approved.

## 9.10 ApprovalAdjustment

- `id`
- `approval_decision_id`
- `amount` (pre-tax, may be negative)
- `reason`
- `created_by_user_id`
- `created_at`

Used only when the accountant changes the overall approved subtotal rather than individual lines.

## 9.11 RequestRevision

- `id`
- `budget_request_id`
- `revision_number`
- `edited_by_user_id`
- `created_at`
- `change_summary`
- `request_snapshot` (includes line items, subtotal, tax rate, tax, and total)

A versioned request-and-line-item snapshot or equivalent immutable version model is required.

## 9.12 ApprovalDecision

- `id`
- `budget_request_id`
- `request_version_id`
- `decision`
- `approved_subtotal`
- `approved_tax`
- `approved_total`
- `decision_reason`
- `approver_user_id`
- `released_at` (null while held under FR-19a)
- `created_at`

Decision values may include Approved, Returned for Clarification, and Declined.

## 9.13 AuditEvent

- `id`
- `actor_user_id` (nullable for system events)
- `actor_kind` (`user`, `system`, `job`)
- `acting_role` (nullable)
- `area` (`annual`, `expenses`, `spending`, `admin`, `access`)
- `event_type`
- `entity_type` and `entity_id` (the request, expense, entry, user, department, setting, and so on)
- `budget_request_id` (nullable, kept for Part A queries)
- `department_id` (nullable)
- `cycle_id` (nullable)
- `event_timestamp`
- `reason` (nullable)
- `details` (JSON: before and after values or a safe summary)
- `request_ip_hash` (nullable; for sign-in and access events only, hashed)

Indexes on (`event_timestamp`), (`area`, `event_type`), (`department_id`, `cycle_id`), (`actor_user_id`), and (`entity_type`, `entity_id`) keep the FR-52 Activity tab fast. AppSetting gains `backup_escalation_days` (default 3) and `weekly_audit_summary` (boolean, default off).

## 9.14 NotificationLog

- `id`
- `budget_request_id`
- `recipient`
- `notification_type`
- `attempted_at`
- `provider_status`
- `failure_reason`
- `retry_count`

## 9.15 SpendingEntry

- `id`
- `budget_cycle_id`
- `department_id`
- `budget_request_id` (nullable)
- `approved_line_item_id` (nullable)
- `entry_type` (`expense` or `refund`)
- `spent_on` (date)
- `payee`
- `description`
- `amount_cents` (including tax)
- `payment_method`
- `reference_number`
- `notes`
- `overspend_note`
- `status` (`recorded` or `voided`)
- `void_reason`
- `created_by_user_id`, `created_at`
- `updated_by_user_id`, `updated_at`
- `version` (for optimistic concurrency)

## 9.16 BudgetAmendment

- `id`
- `budget_request_id`
- `department_id`
- `budget_cycle_id`
- `amount_before_tax_cents` (may be negative)
- `tax_cents`
- `amount_cents` (including tax)
- `reason`
- `created_by_user_id`
- `created_at`

BudgetCycle also gains `decision_email_mode` (`immediate` or `scheduled`), `decision_release_at`, `release_message`, `spending_period_end`, `spending_locked_at`, and `spending_locked_by_user_id`. AppSetting gains `near_limit_threshold` (default `0.80`).

## 9.17 RequestMessage

- `id`
- `budget_request_id`
- `author_user_id`
- `body`
- `created_at`

## 9.18 UserPreference

- `user_id`
- `theme` (`light`, `dark`, `system`)
- `email_reminders` (boolean)
- `email_copies` (boolean)
- `email_digest` (`instant` or `daily`, accountants)
- `accountant_type` (`primary` or `backup`, accountants)
- `away_from`, `away_until` (nullable)

AppSetting gains `second_approval_threshold` (nullable, off by default). ApprovalDecision gains `decision_stage` (`first` or `second`).

## 9.18a SigningAuthority (FR-53)

- `id`, `name`, `email` (nullable), `active_from`, `active_until` (nullable), `removed_reason` (nullable), `version`, `created_at`, `updated_at`
- Payments store the signer's `id` and a `name_snapshot`.

## 9.18b DeadlineExtension (4.3)

- `id`, `cycle_id`, `department_id`, `new_deadline`, `reason`, `granted_by_user_id`, `created_at`. One active extension per department and cycle; changes are new rows.

## 9.18c Email sign-in (FR-01b)

- `EmailLoginCode`: `id`, `email`, `code_hash`, `expires_at`, `attempts`, `used_at`, `created_at`.
- User gains `totp_secret_encrypted` (nullable), `totp_enabled_at`, and `recovery_codes_hashed`.

## 9.19 Data Integrity Requirements

- Generate identifiers on the server.
- Enforce foreign-key constraints.
- Use database transactions for submissions and approvals.
- Enforce revision limits transactionally.
- Use a unique reference number for every request.
- Prevent duplicate primary submissions for the same department and cycle unless an approved exception exists.
- Preserve request versions and approval history.
- Use optimistic concurrency checks to prevent one user from silently overwriting another user's changes.
- Store monetary values with exact decimal semantics.
- Enforce with a check or test that `requested_total = requested_subtotal + requested_tax` and `approved_total = approved_subtotal + approved_tax`.

---

# 10. Security and Privacy Requirements

## 10.1 Authentication and Authorization

- Use an established Google authentication library or trusted identity provider implementation.
- Verify tokens server-side.
- Validate issuer, audience, signature, expiration, and required identity claims.
- Do not trust client-provided role values.
- Enforce authorization on every protected endpoint.
- Restrict requests, reports, and exports to authorized roles.
- Require sign-in before showing request details from email links.
- Two-step verification is not required for any role, including the accountant, Board Chair, Vice-Chair, Church Administrator, and System Administrator (decided 2026-10-15; see `docs/decisions.md`). Staff are encouraged, but not required, to turn it on for their own Google or Planning Center account.

## 10.2 Application Security

- Use HTTPS in production.
- Store secrets outside source control and client-side bundles.
- Apply secure session cookies and session expiration.
- Protect state-changing operations against CSRF where applicable.
- Validate and sanitize all user inputs.
- Use parameterized database queries or a safe ORM.
- Rate-limit sensitive endpoints.
- Prevent duplicate submissions and approval operations.
- Prevent cross-site scripting.
- Prevent unauthorized access through guessed request identifiers.
- Validate external links and render them safely.

## 10.3 Financial Data Integrity

- Recalculate subtotals, tax, and totals on the server.
- Ignore any client-supplied tax or total values.
- Keep original requested values separate from approved values.
- Preserve revisions and decisions.
- Require confirmation for approvals and declines.
- Record adjustment reasons.
- Prevent unauthorized changes to approved amounts or the tax rate.
- Ensure exported totals match the database's authoritative values.

## 10.4 Email Security

- Use an approved email provider with SPF, DKIM, and DMARC configured for the sending domain.
- Do not expose private request details through public links.
- Use authenticated application links.
- Avoid putting sensitive data in URL query parameters.
- Log notification outcomes.
- Retry transient failures safely.

## 10.5 Excel Security

- Prevent formula injection in exported user-supplied text (prefix cells beginning with `=`, `+`, `-`, `@`, tab, or carriage return).
- Export only authorized data.
- Avoid exposing unnecessary personal information.
- Apply appropriate file naming and worksheet conventions.

## 10.6 Backups and Retention

- Back up the database regularly.
- Test recovery procedures.
- Define a retention policy for requests, audit records, and notification logs.
- Preserve historical financial records according to the church's recordkeeping requirements (CRA generally requires charities to keep records for six years).
- Do not permanently delete approved or declined requests through routine interface actions.

---

# 11. Business Rules and Edge Cases

1. **One primary request per department per annual cycle.** Controlled revisions update the request history rather than creating duplicates.
2. **Authorized representatives only.** Users may submit for assigned departments.
3. **Annual cycle closure.** Closed cycles reject new submissions unless reopened by an administrator.
4. **Drafts do not count as submissions.** The department remains outstanding until a valid request is submitted.
5. **At least one item is required.** An empty request cannot be submitted.
6. **Positive quantity.** Quantity must be greater than zero.
7. **Non-negative unit price.** Negative prices are rejected.
8. **Zero-price items.** Permit only if required by policy, with a confirmation or explanation.
9. **Automatic calculations.** Server-side calculations are authoritative.
10. **Sales tax on every total.** Every request total includes sales tax at the request's snapshotted rate (default 12%), calculated once on the subtotal and rounded half-up to the cent.
11. **Tax-rate change.** Changing the rate affects drafts and new submissions only; submitted, revised, and approved requests keep their snapshotted rate.
12. **Tax-inclusive prices.** Unit prices are entered before tax. Help text warns users not to enter tax-inclusive prices, to avoid double taxation.
13. **Two-edit limit.** The server enforces the limit and preserves each successful revision.
14. **Returned requests.** Responding to a clarification does not consume an edit and does not reset the edit count.
15. **Approval.** Requester edits are blocked once the request is approved.
16. **Decline.** Declined requests remain available for reporting and audit.
17. **Line-item adjustments.** Approved quantities and prices are stored separately from requested values.
18. **Approval reconciliation.** The approved subtotal equals the sum of approved line items plus any explicitly recorded overall adjustment; approved tax and total are derived from it.
19. **Email failure.** Failed email delivery does not undo a valid submission or approval.
20. **Duplicate clicks.** Repeated submission or approval requests must not create duplicate records or conflicting decisions.
21. **Concurrent edits.** Version checks prevent silent overwrites.
22. **Department deactivation.** Historical requests remain accessible.
23. **Department renaming.** Historical reports preserve the original department identity and appropriate historical name.
24. **Missing link.** A product link is optional.
25. **Invalid link.** Non-HTTP/HTTPS links are rejected.
26. **Unusual price or quantity.** Validate sensible numeric limits (e.g. quantity ≤ 10,000; unit price ≤ $1,000,000) and display readable totals.
27. **Budget adjustment.** An overall adjustment must be recorded explicitly and must not be confused with item-level approval.
28. **No attachments.** Uploads are rejected at both interface and API levels.
29. **Multiple submitters.** Only authorized representatives may submit; duplicate primary submissions are prevented.
30. **Spending amounts include tax.** Spending entries record the amount actually paid; no tax is added on top.
31. **Overspending is recorded, not blocked.** Real spending must be captured even when it exceeds the budget; it requires an overspend note and triggers an alert.
32. **No deletion of spending.** Mistakes are corrected (with reason) or voided (with reason); history is kept.
33. **Amendments are separate.** Increasing or reducing a budget after approval never edits the original approval.
34. **Locked periods.** No spending changes after the accountant locks a cycle's spending period, unless reopened.
35. **Unbudgeted spending.** Spending for a department without an approved budget is allowed only after a warning and is flagged.

---

# 12. Status Model

Recommended statuses:

- `Draft`
- `Submitted`
- `Updated`
- `In Review`
- `Returned for Clarification`
- `Awaiting Second Approval` (only when FR-34 is turned on)
- `Approved`
- `Declined`
- `Closed`

Status transitions must be validated on the server.

Typical lifecycle:

- Draft → Submitted
- Submitted → In Review
- Submitted → Updated
- Updated → In Review
- In Review → Returned for Clarification
- Returned for Clarification → Updated
- In Review → Approved
- In Review → Declined
- In Review → Awaiting Second Approval → Approved (FR-34)
- Awaiting Second Approval → In Review (second approval refused)

A request may be reopened only through an explicitly authorized and audited administrative or accountant workflow.

Approved and declined requests must not silently return to a state where the requester can edit them.

---

# 13. Non-Functional Requirements

## 13.1 Performance

- Routine form interactions should feel immediate.
- Calculated totals and tax should update without noticeable delay.
- Dashboard filters should respond efficiently for the expected church workload.
- Export generation should provide progress or clear feedback for larger reports.
- Use pagination or appropriate loading strategies when lists become large.

## 13.2 Reliability

- Save requests transactionally.
- Avoid duplicate submissions.
- Maintain data integrity during email outages.
- Retry transient notification failures.
- Provide clear error messages when an action fails.
- Never indicate successful approval unless the server confirms the transaction.

## 13.3 Maintainability

- Use a clear separation between presentation, business logic, authorization, and persistence.
- Centralize calculation and tax rules in one shared module.
- Centralize status transition rules.
- Use documented API contracts.
- Provide automated tests for calculations (including tax rounding), permissions, revisions, approvals, and exports.
- Maintain a deployment and recovery procedure.

## 13.4 Compatibility

- Support current mainstream desktop and mobile browsers.
- Work on typical mobile screen sizes.
- Use responsive form and table layouts.
- Avoid requiring a desktop computer to submit a request.

## 13.5 Accessibility

- Target WCAG 2.2 AA.
- Support keyboard-only navigation.
- Provide screen-reader labels.
- Maintain sufficient contrast.
- Announce relevant status and validation changes.
- Respect reduced-motion settings.

---

# 14. Acceptance Criteria

Every item must pass before the matching stage (Section 15) is complete. Claude Code should turn each AC into at least one automated test where practical.

## Authentication and Access

- **AC-1** An authorized user can sign in with Google.
- **AC-2** An unauthorized Google account cannot access private church budget information.
- **AC-3** A requester cannot view another department's private request without permission.
- **AC-4** Only authorized accountants can approve, decline, return, or export all departments' budgets.
- **AC-5** Administrators can manage departments, cycles, user assignments, and the tax rate.

## Planning Center

- **AC-6** A person can sign in with Planning Center and with Google, and both reach the same account when the emails match.
- **AC-7** A Planning Center person whose configured custom field has an accepted value (default "Ministry Leader" = "Yes") can submit; one without it is denied requester access with a clear message.
- **AC-8** A Google sign-in for a requester is checked against the matching Planning Center person's custom field.
- **AC-9** Removing the field in Planning Center suspends requester access by the next sign-in or nightly sync, keeps their drafts, and emails the administrator and accountant.
- **AC-10** Accountant and Church Administrator users can sign in without the custom field (default setting).
- **AC-11** The administrator can choose the field and values and test a person before saving.

## Departments and Decision Release

- **AC-12** The administrator can add departments one at a time or by pasting a list.
- **AC-13** The department list on the form shows all active departments plus "Other (type your department)".
- **AC-14** Typing "Media Ministri" suggests "Media Ministry"; choosing to continue creates a proposed department and the administrator is emailed.
- **AC-15** The accountant cannot approve a submission whose department is still proposed.
- **AC-16** Merging a proposed department moves the submission and emails the requester.
- **AC-17** In Send immediately mode, the requester gets the approval email when the accountant confirms.
- **AC-18** In Hold mode with a release of Dec 1, 2026 at 9:00 a.m., requesters see In Review until then, and all decided departments receive their emails by 9:15 a.m. church time (Central, Winnipeg).
- **AC-19** Release now sends all held decision emails at once; decisions after release go immediately.

## Request Creation

- **AC-20** A requester can create a draft.
- **AC-21** A requester can resume a saved draft.
- **AC-22** The department (from the selector) and annual cycle are required.
- **AC-23** A justification and at least one valid line item are required.
- **AC-24** Invalid quantities, negative prices, and malformed links are rejected.
- **AC-25** No file upload is available in the UI, and the API rejects file payloads.
- **AC-26** Changing quantity or unit price updates line totals, subtotal, tax, and total correctly.
- **AC-27** The server independently validates the calculated values and ignores client-supplied totals.
- **AC-28** The preview displays every item, justification, link, subtotal, sales tax, and total including tax.
- **AC-29** Submission requires explicit confirmation.

## Sales Tax

- **AC-30** A request with a $30,000.00 subtotal shows Sales tax $3,600.00 and Total $33,600.00.
- **AC-31** A request with a $1,025.00 subtotal shows Sales tax $123.00 and Total $1,148.00.
- **AC-32** Tax is rounded to the cent: a $10.04 subtotal gives $1.20 tax ($1.2048), and a $10.29 subtotal gives $1.23 tax ($1.2348); a $10.46 subtotal gives $1.26 tax ($1.2552).
- **AC-33** Tax is calculated once on the subtotal, not summed per line.
- **AC-34** The submitted request stores the tax rate in effect at submission; changing the admin rate afterwards does not change that request's tax, revisions, or approval.
- **AC-35** When the accountant approves a different amount of $30,000.00 (incl. tax), the app stores Approved subtotal $26,785.71, Approved tax $3,214.29, Approved total $30,000.00. When the accountant edits line items instead, approved tax is calculated on the approved subtotal.
- **AC-36** Subtotal, sales tax, and total match across the form, preview, receipt email, accountant review, approval email, dashboard, and Excel export.

## Submission and Revisions

- **AC-37** A successful submission creates one unique request reference.
- **AC-38** Repeated clicks or retries do not create duplicate requests.
- **AC-39** The requester receives a submission receipt.
- **AC-40** The accountant receives a new-submission notification.
- **AC-41** The requester can make two successful post-submission revisions.
- **AC-42** A third revision is rejected unless a separately authorized exception applies. Responding to a return for clarification does not reduce the remaining edit count.
- **AC-43** Every revision preserves the previous version.
- **AC-44** The accountant receives revision notifications.
- **AC-45** The application shows remaining edit opportunities accurately.
- **AC-46** Approved and declined requests cannot be edited by the requester.

## Accountant Review

- **AC-47** The dashboard lists every expected department for the selected annual cycle.
- **AC-48** Drafts do not count as submitted budgets.
- **AC-49** The accountant can open and inspect requests.
- **AC-50** The accountant can approve as requested.
- **AC-51** The accountant can approve a different amount by entering one approved total including tax, with a note and board reference, without editing line items.
- **AC-52** Original requested values remain unchanged after adjustments.
- **AC-53** The application calculates the approved subtotal, tax, and total correctly.
- **AC-54** The accountant can return a request with a required clarification comment.
- **AC-55** The accountant can decline a request with a required reason.
- **AC-56** The requester receives the appropriate email for each decision.
- **AC-57** Approval records the approver, timestamp, approved values, and any adjustment reasons.

## Notifications, Sharing, and Approvals

- **AC-58** Every event in the FR-21 tables sends the listed emails, and each sent email appears in the request history.
- **AC-59** A message from the accountant on a request emails all of the department's representatives; a reply emails the accountant.
- **AC-60** Two representatives of one department can both edit the request; together they cannot exceed 2 edits.
- **AC-61** When the primary accountant is Away, new-submission emails go to the backup approver.
- **AC-62** An accountant who is also a representative of a department cannot approve that department's request.
- **AC-63** With a $10,000 second-approval threshold, a $11,200 approval waits for a second accountant before the requester is emailed.
- **AC-64** "Start from last year's request" creates a draft with last year's items and the current tax rate.

## Expenses (Part B)

- **AC-65** A requester can submit a purchase request; 2 × $450.00 gives Subtotal $900.00, Tax $108.00, Total $1,008.00.
- **AC-66** Approving that purchase request adds $1,008.00 to Committed and reduces Remaining by $1,008.00.
- **AC-67** An expense claim of $985.60 linked to it, once approved, releases the $1,008.00 commitment and adds $985.60 to Spent.
- **AC-68** An unlinked claim with receipts of $112.00 and $56.00 totals $168.00 and adds no tax.
- **AC-69** Approving a different amount of $500.00 (incl. tax) stores $446.43 + $53.57 tax.
- **AC-70** A submission that exceeds Remaining requires an over-budget explanation and shows the overage to the accountant.
- **AC-71** A requester can edit a submission until review starts, and cannot after.
- **AC-72** An approver cannot approve their own claim or one for their own department.
- **AC-73** After the accountant approves, the status is Awaiting Board Chair, the Board Chair is emailed, and the budget is not yet charged.
- **AC-74** Only after the Board Chair's final approval does the requester get "Your expense has been approved" and the Church Administrator get "Approved, ready for processing".
- **AC-75** The Board Chair can approve a smaller amount but not a larger one than the accountant approved.
- **AC-76** Recording a cheque payment requires the cheque number and two signers; recording church card, cash, e-transfer, or supplier EFT requires the matching fields.
- **AC-77** An approved claim appears in the Church Administrator's Ready to process queue; recording payment emails the payee and requester with the method and date.
- **AC-78** A department without an approved annual budget cannot submit expenses.
- **AC-79** Every expense event in FR-49 sends the listed emails.
- **AC-80** Approved expense claims appear in the Spending ledger without manual re-entry.
- **AC-81** Receipt files are visible only to authorized users and are rejected above 10 MB or with other file types.

## Spending Tracking

- **AC-82** A Church Administrator can record an expense for a department; Spent and Remaining update immediately.
- **AC-83** With an approved total of $33,600.00 and expenses of $10,000.00 and $5,000.00 and a $500.00 refund, Spent is $14,500.00 and Remaining is $19,100.00 (43.2% used).
- **AC-84** A $5,600.00 (incl. tax) amendment ($5,000.00 + $600.00 tax) increases Available budget from $33,600.00 to $39,200.00 without changing the original approved total.
- **AC-85** An entry that takes Remaining below zero requires an overspend note, shows "Over budget by $X", and emails the accountant once.
- **AC-86** Reaching the near-limit threshold emails the accountant once per cycle per department.
- **AC-87** A voided entry stays visible, is labelled Voided, and is excluded from Spent.
- **AC-88** A Church Administrator cannot approve, adjust, or amend budgets, and cannot delete spending entries.
- **AC-89** A requester sees their own department's budget, spent, and remaining, and cannot see other departments' spending.
- **AC-90** After the accountant locks the spending period, the Church Administrator cannot add, correct, or void entries.
- **AC-91** The Budget vs Actual export matches the Spending dashboard to the cent.

## Export and Audit

- **AC-92** The accountant can export one request to `.xlsx` from the dashboard.
- **AC-93** The accountant can export a consolidated annual workbook.
- **AC-94** Requested and approved values (subtotal, tax, total) are distinguishable in exports.
- **AC-95** Exported totals match the authoritative application values to the cent.
- **AC-96** Exported user text is protected against spreadsheet formula injection.
- **AC-97** Audit records exist for submissions, revisions, decisions, adjustments, tax-rate changes, and administrative changes.
- **AC-98** Normal users cannot modify or delete audit events.

## Branding

- **AC-99** An administrator can replace the logo and accent color, and the change appears on the sign-in screen, app, emails, and exports.
- **AC-100** An accent color that fails contrast is not saved, and a passing shade is suggested.
- **AC-101** Non-administrators cannot see or use the logo upload.

## Usability and Reliability

- **AC-102** The application works on desktop, tablet, and mobile.
- **AC-103** Keyboard navigation and accessible validation work correctly.
- **AC-104** Email failure does not undo a valid budget transaction.
- **AC-105** The application provides clear feedback when actions fail.
- **AC-106** Concurrent edits do not silently overwrite newer data.
- **AC-107** Database backup and recovery procedures have been tested.

## One Application and Roles

- **AC-108** One sign-in reaches all of a person's roles; a user who is both accountant and requester sees one navigation and one My tasks list.
- **AC-109** My tasks lists every item needing the person's action across their roles and removes it once handled.
- **AC-110** The System Administrator can view every annual budget (including drafts), expense, receipt, payment, spending entry, message, and audit event, and can export all reports.
- **AC-111** The System Administrator cannot approve, decline, adjust, or record payments unless also given that role.
- **AC-112** When the Board Chair is Away or conflicted, the Vice-Chair receives the final-approval task and email, and the decision records the Vice-Chair.

## Completeness additions

- **AC-113** The accountant can reopen a declined annual budget with a reason; the requester can edit and resubmit without using an edit, and the history keeps the earlier decision.
- **AC-114** With a board-approved church total of $150,000.00 and $140,000.00 already approved, approving a $15,000.00 department budget shows a warning that it exceeds the board total by $5,000.00.
- **AC-115** A purchase request requires "How it will be bought", and the choice appears to the Church Administrator in Ready to process.

## Primary and Backup Requester (FR-38)

- **AC-116** The administrator can set one Primary and up to two ranked Backup requesters (Backup 1, Backup 2) per department; a second Primary or a third Backup is rejected by the server.
- **AC-117** A Primary can nominate a verified Group Leader as Backup; the administrator is emailed and the change is audited.
- **AC-118** A clarification task left open for 3 days reminds the Backup requester, and the task shows "Backup reminded".
- **AC-119** While the Primary is Away, new-task emails go to the Backup, and the department shows "Covered by" the Backup.
- **AC-120** When the Primary is deactivated, Backup 1 becomes Primary automatically, Backup 2 moves up to Backup 1, and the administrator is emailed; with no Backup left, the department shows "No backup".

## Planning Center Team Mapping (FR-39)

- **AC-121** The administrator can map the Media department to a Planning Center Services team loaded from Planning Center.
- **AC-122** In Suggest mode, a team leader in Planning Center appears as "Suggested by Planning Center" and gets access only after the administrator adds them.
- **AC-123** In Automatic mode, a team leader removed in Planning Center loses representative access at the next sync, and the department's requests stay with the department.
- **AC-124** A mapped team leader without the Group Leader field cannot submit, unless "Team leaders count as Group Leaders" is on for that department.

## Activity, Audit and Analytics (FR-52)

- **AC-125** Every event type listed in FR-22, including sign-ins, access denied, and settings changes, appears in the Activity tab with actor, role, time, item, and reason.
- **AC-126** Filtering the Activity tab by department, person, event group, and date range returns only matching events, and the filtered view can be exported to Excel; the export is audited.
- **AC-127** The Overview totals (approved, committed, spent, remaining) match the Spending dashboard and the Budget vs Actual export to the cent.
- **AC-128** A requester sees only their own department's analytics and activity, with no payment details; a direct request for another department's data is refused by the server.
- **AC-129** Clicking a chart bar opens the list of items behind it, and each chart has an accessible table view.
- **AC-130** No user, including the administrator, can edit or delete an audit event through the app or its API.

## Added with v3.3 (church details)

- **AC-131** A fresh install can load the 18 starting departments by pasting the list; "Others" maps to the Other option, not a department.
- **AC-132** An accountant whose address is `name@outlook.com` can sign in with an emailed code; a wrong code 5 times blocks further tries for 15 minutes.
- **AC-133** Requesting a code for an address that is not on the allowlist shows the same message and sends no email.
- **AC-134** The administrator can add and remove a cheque signer; a removed signer is not offered in Record payment but still shows on past payments.
- **AC-135** Recording a cheque payment is blocked with a clear message when fewer than two active signers exist.
- **AC-136** The administrator can move the FY2027 deadline later with a reason; representatives who have not submitted are emailed and reminders use the new date.
- **AC-137** A one-department extension lets that department submit after the cycle deadline, while others are blocked.
- **AC-138** The administrator can change the logo and accent colour without a redeploy (see also AC-99).

---

# 15. Delivery Stages

Build and release in stages. Each stage is usable on its own and ends with its acceptance criteria passing. The detailed build order for Claude Code is in [CLAUDE.md](../CLAUDE.md).

## Stage 1: Annual Budget MVP (Part A)

- Project setup on the free-tier stack (20.3), database schema, shared money and tax module with tests.
- Google and Planning Center sign-in, Group Leader check, roles, staff allowlist (FR-01, FR-01a, FR-02).
- Departments with "Other" proposals, budget cycles, settings incl. tax rate (FR-03, Section 4).
- Annual budget form: drafts, items, 12% tax, justification, preview, submit, receipt, 2 edits, shared department requests, copy last year optional later (FR-04 to FR-12, FR-32).
- Accountant dashboard and review: approve as requested, approve a different amount (incl. tax, board reference), line changes, clarification, decline, reopen (FR-13 to FR-18a).
- Approval emails sent immediately; all Part A emails in FR-21; audit; Excel export; no attachments; help and privacy (FR-19, FR-20 to FR-23, FR-36).
- One application with role-based navigation and the My tasks home; administrator read-only access to everything (FR-37, 3.5).
- Sign-in with any email address for staff (FR-01b); flexible deadline and per-department extensions (4.3).
- Primary and Backup requester per department (FR-38) and the full activity log with the Activity tab of the Analytics & Audit dashboard (FR-22, FR-52).
- Acceptance: Authentication, Planning Center, Departments (except scheduled release), Request Creation, Sales Tax, Submission, Accountant Review, Export and Audit, Usability, Primary and Backup Requester, AC-125, AC-126, AC-130 to AC-133, AC-136, AC-137.

## Stage 2: Annual Budget polish

- Scheduled decision release (FR-19a), request messages (FR-31), backup approver and Away (FR-33), optional large-amount second approval (FR-34), copy last year (FR-35), branding (FR-30), email preferences and digest.
- Planning Center team mapping (FR-39). Overview and Access tabs of the Analytics & Audit dashboard for annual budgets (FR-52).
- Acceptance: Departments and Decision Release (release items), Notifications/Sharing, Branding, Planning Center Team Mapping, AC-128, AC-129, AC-138.

## Stage 3: Expense Submissions (Part B)

- Purchase requests and expense claims, receipts on claims, budget strip with Committed, two-level approval (accountant, Board Chair), Ready to process queue and Record payment, expense emails and exports (Section 6B, FR-40 to FR-51).
- Minimal spending ledger so approved claims create spending entries (FR-24, FR-42).
- Cheque signing authorities list (FR-53).
- Acceptance: Expenses (Part B), AC-134, AC-135.

## Stage 4: Spending tracking and amendments

- Church Administrator spending entries, refunds, voids, budget vs actual dashboard, amendments, alerts, requester budget panel, year-end lock, spending exports (FR-24 to FR-29).
- Expense and spending analytics on the Analytics & Audit dashboard (FR-52).
- Acceptance: Spending Tracking, AC-127.

## Stage 5: Hardening and launch

- Security review, accessibility pass with a screen reader, mobile testing, backup and restore test, email deliverability test, pilot with the accountant, Board Chair, church administrator, and two departments, user manual checked against the built app (Section 22), go-live checklist complete (Section 21).

# 16. Future Enhancements

Potential enhancements after the MVP:

- Automated deadline reminders.
- Department budget ceilings and warning thresholds.
- Comparison with previous annual budgets.
- Year-over-year spending reports.
- Budget variance analysis.
- Separate GST and PST lines, and per-item tax-exempt or zero-rated flags.
- Multi-level approvals.
- Optional accountant notes and internal-only comments.
- Read-only links to approved church storage documents, if evidence is required in the future.
- Accounting software integration.
- Purchase order workflows.
- More advanced financial reporting.

These should not delay delivery of the initial requirements unless the church identifies them as essential.

---

# 17. Decisions Confirmed for This Specification

| Decision | Confirmed requirement |
|---|---|
| Department management | Administrator-managed department list; department selector on the form |
| Authentication | Google Sign-In |
| Budget frequency | Annual budget cycle |
| Drafts | Requesters can save and resume drafts |
| Request items | Item name, quantity, unit price, optional link, calculated line total |
| Sales tax | 12% on every request total, calculated once on the subtotal, rounded half-up to the cent, admin-configurable, snapshotted per request |
| Totals shown | Subtotal, Sales tax, Total including tax, everywhere amounts appear |
| Links | Optional product or supplier URLs |
| Justification | Required |
| Attachments | Prohibited |
| Pre-submission review | Mandatory preview and explicit confirmation |
| Post-submission edits | Two successful revisions |
| Accountant notifications | Email on new submissions and revisions |
| Approval model (Part A) | Approve as requested, approve a different amount (one total incl. tax, with board reference), or approve with line changes |
| Approved amount and tax | The approved total entered by the accountant includes tax; the app works out the tax inside it |
| Expense submissions (Part B) | Purchase requests and expense claims against the approved annual budget; two approvals (accountant, then Board Chair); Church Administrator processes and records how it was paid |
| Clarification | Accountant can return requests with comments |
| Decline | Accountant can decline requests with a reason |
| Submission receipt | Email to requester |
| Approval notification | Email to requester |
| Export | Individual and consolidated Excel workbooks |
| Auditability | Submission, revision, adjustment, tax-rate, decision, spending, and amendment history |
| Spending tracking | Church Administrator records spending per department; app shows approved, spent, remaining |
| Spending amounts | Entered as actually paid, including tax |
| Budget changes after approval | Accountant-only amendments with reason |

---

# 18. Final Product Recommendation

Build the application around two primary experiences:

**The requester workspace** should make creating, calculating (including tax), reviewing, and submitting a budget straightforward, with strong validation and a clear revision allowance.

**The accountant workspace** should prioritize departmental completion tracking, efficient request review, a fast "approve" or "change amount and approve" decision, clear requested-versus-approved comparisons, and dependable Excel reporting.

The most important architectural decisions are to preserve the distinction between what a department requested and what the accountant approved, and to compute money and tax in one shared, tested module so every screen, email, and export agrees to the cent.

Before implementation begins, validate the proposed requester workflow and accountant dashboard with actual users. Confirm the church's department list, Google account access policy, annual budget dates, tax treatment, and email delivery configuration. Once those are settled, proceed to high-fidelity UI design and then development.

**Definition of done:** The system must be secure, auditable, accessible, responsive, accurate in its calculations, and usable by a department representative who has no technical background.

---

# 19. Requirements Traceability (Original Asks)

Every item from the original request is covered:

| Original ask | Where it is specified |
|---|---|
| Google sign-in as login | FR-01, 10.1, AC-1–2 |
| Planning Center sign-in and Group Leader check | FR-01a, AC-6–11 |
| Department selector on the form | FR-03, 7.3 Step 1, AC-22 |
| Item name, quantity, price, optional link | FR-06, FR-08 |
| Automatic total when quantity is more than one | FR-07, AC-26 |
| 12% sales tax on every total (e.g. $30,000 → $33,600) | FR-07, FR-07a, AC-30–36 |
| Description of why the budget is requested | FR-09 |
| No file attachments | FR-23, AC-25 |
| Preview before submit | FR-10, 7.5, AC-28–29 |
| Email receipt of what was submitted | FR-11, FR-21, AC-39 |
| Ability to make 2 changes after submitting | FR-12, AC-41–42 |
| Accountant sees which departments submitted | FR-13, FR-14, AC-47–48 |
| Download as Excel | FR-20, AC-92–95 |
| Approve, or change just the amount then approve | FR-15, FR-16, AC-50–53 |
| Approval email to requester | FR-19, FR-21, AC-56 |
| Approval email immediately, or all at a scheduled date and time | FR-19, FR-19a, AC-17–19 |
| Admin adds all departments; requesters pick from the list or type "Other" | FR-03, AC-12–16 |
| Accountant approves a different yearly amount based on the board (e.g. $40,000 asked, $30,000 approved incl. tax) | FR-16, AC-35, AC-51 |
| Two-level expense approval (accountant, Board Chair), then email to the church administrator; payment method recorded; requester gets approved email | 3.3, 6B.4, 6B.5, FR-49, AC-73–77 |
| Expense submission form during the year | Section 6B (FR-40 to FR-51), AC-65–81 |
| Admin assistant records what each department spent and what remains | 3.4, 5.7, FR-24 to FR-29, AC-82–91 |
| A second requester for each department | FR-38, AC-116–120 |
| Team mapping: department tagged like the ministry leader in Planning Center | FR-39, AC-121–124 |
| Dashboard, reports and analytics auditing everything done on the platform, easy to navigate | FR-22, FR-52, DRD 6.13, AC-125–130 |
| Instruction manual on how to use the platform | Section 22, [user-manual.md](user-manual.md) |
| Every tool and integration needed to go live | Section 21, [go-live-checklist.md](go-live-checklist.md) |

---

# 20. Recommendations and Open Questions

## 20.1 Decisions log (confirmed by G, 2026-10-15)

- Sales tax: 12%, one combined line, calculated once on the subtotal, no exempt items, rate set by the administrator and snapshotted per request.
- Unit prices are entered before tax; spending entries and expense claim receipts are entered as paid, including tax.
- Annual budget: the accountant's approved amount is entered including tax, with a board reference; line-item editing is optional.
- A clarification response does not use one of the two edits.
- Requesters see their own department's budget, spending, and remaining (no payment details).
- Overspending is recorded with a required note, not blocked.
- The accountant locks the spending year manually at year-end.
- Branding (logo, names, accent colour) is changeable by the administrator. English only.
- Every update to a submission, decision, or budget emails the people involved.
- Decision emails: immediate by default, or held and released together on a scheduled date and time.
- Departments: administrator-managed list plus "Other" proposals; picking a department makes the user a representative.
- Sign-in with Google or Planning Center; requesters must have the configured Group Leader custom field ("Ministry Leader" = "Yes" to start).
- Expenses need two approvals: accountant, then Board Chair (Vice-Chair as backup); then the Church Administrator processes and records how it was paid.
- One application for every role; the System Administrator sees everything, read-only.
- Receipt files are allowed on expense claims only.
- Everything runs on free tiers; email via Resend (the church's existing account) from a church-domain address.
- Requirements and design stay as separate documents, linked by a README. Claude Code will develop the application.
- Each department has a Primary requester and up to two optional, ranked Backup requesters (FR-38).
- Departments can be mapped to Planning Center teams, groups, tags or a custom field so leaders stay in step (FR-39).
- An Analytics & Audit dashboard covers everything done on the platform (FR-52).
- Starting department list: the 18 departments in FR-03; representatives are not pre-loaded because leaders change.
- Staff may use any email address (FR-01b).
- Cheque signers are a list the administrator edits (FR-53).
- The administrator can change the submission deadline, and extend it for one department (4.3). The first cycle is FY2027.
- The administrator (G) edits the logo and brand colour (FR-30).

## 20.2 Defaults in place (change in Settings or by revising this document)

| Topic | Default |
|---|---|
| Prices including tax | Not allowed; form labels "before tax". |
| One request per department per year | Yes; second requests only as an explicit exception. |
| Accountant notification address | Primary accountant's email; backup when Away. |
| Approved amount per line visible to requesters | Yes, in approval email and request details. |
| Church Administrator can correct others' spending entries | Yes, with a reason, audited. |
| Monthly spending summary email | Off. |
| Departments source | Assigned in the app; optional Planning Center mapping per department (FR-39), in Suggest mode. |
| Backup requester escalation delay | 3 days (FR-38). |
| Weekly audit summary email | Off (FR-52). |
| Staff roles need Group Leader field | No. |
| Who can submit expense claims | Department representatives and people given Expense submitter permission. |
| Expense claim deadline | 90 days after purchase. |
| Large-amount second approval for annual budgets (FR-34) | Off. |
| Confetti | On successful annual budget submission only; off with reduced motion. |

Before Stage 1 starts, the church provides: the department list (received, FR-03; representatives come from sign-in and Planning Center); the exact Planning Center custom field; the accountant, Board Chair, backup board approver, and Church Administrator accounts; cheque signing authorities; logo and brand colour; budget year dates.

## 20.3 Recommended technology stack: free tier only

Decision (G, 2026-10-15): **everything must run on free tiers; the church pays for nothing.** Free-tier limits change; confirm each one when signing up.

| Need | Free choice | Free limit (approx.) | Notes |
|---|---|---|---|
| Email | **Resend free plan** (the church already uses Resend) | 3,000/month, 100/day, 1 verified domain; shared with the church's other Resend apps | Sends from an address on the church's verified domain. Expected use is a few hundred emails a month. There is no second provider: emails that fail or go over the daily limit stay in the outbox and are retried. |
| Hosting | Netlify free or Cloudflare Pages/Workers free | Generous for this size | Vercel's free Hobby plan is limited to personal, non-commercial use, so check its terms before using it for a church. |
| Database | Neon free Postgres | ~0.5 GB, sleeps when idle and wakes in about a second | Supabase free also works, but pauses projects after a week of no activity, which matters for a seasonal app. |
| Backups | Nightly database export by a free GitHub Actions job to a private church Google Drive folder | Free | Free database tiers have limited or no backups. |
| Receipt files (if allowed) | Cloudflare R2 free | ~10 GB | Restrict to images/PDF, re-encode images on upload. |
| Scheduled jobs (nightly Planning Center check, reminders, scheduled release) | GitHub Actions scheduled workflow, or the host's free cron | Free | — |
| Sign-in | Google OAuth and Planning Center OAuth | Free | — |
| Planning Center API | Church's existing Planning Center account | Free | — |
| Web address | Free host subdomain (e.g. `ifc-budget.netlify.app`) | Free | A custom domain costs about $15/year; only needed if wanted. |

Application code:

- **Frontend and backend:** Next.js (React + TypeScript) in one project. Forms with React Hook Form and Zod validation shared between client and server.
- **Authentication:** Auth.js (NextAuth) with the Google provider and a custom OAuth provider for Planning Center, plus the user table for roles.
- **Planning Center:** People API (custom field data) called server-side with the church's API credentials, re-verified nightly by the scheduled job.
- **ORM:** Prisma or Drizzle. Store money as integer cents and the tax rate as `NUMERIC(5,4)`.
- **Money and tax:** a single `money.ts` module using integer cents with explicit half-up rounding, covered by unit tests including the examples in Section 14.
- **Excel export:** ExcelJS (server-side), writing numeric cells with CAD number format.
- **UI components:** Tailwind CSS with shadcn/ui (Radix).

All accounts are created under a church-owned Google account (20.5), never a personal one.

## 20.4 Other recommendations

1. **Write the tax calculation first.** Build and test the shared money/tax module before any screens, since every screen, email, and export depends on it.
2. **Label prices "before tax"** on the form and preview to prevent double taxation.
3. **Make "Approve as requested" one click** (plus confirmation), and keep "Approve with changes" one step further, so routine approvals are fast.
4. **Pre-select the department** when a user has only one.
5. **Show remaining edits** prominently on the request details page and in every receipt email ("You have 1 edit remaining").
6. **Use a readable reference number** such as `IFC-2027-0007` in emails and Excel file names.
7. **Keep emails simple:** plain HTML with the totals table and a "View in app" button; no attachments.
8. **Plan a short pilot** with the accountant and two departments before opening the cycle to everyone.
9. **Record retention:** keep approved and declined requests for at least six years to align with typical CRA charity recordkeeping.
10. **Privacy:** the app stores names and emails of church members; publish a short privacy notice on the sign-in page (FR-36).

## 20.5 Ownership and handover

Church volunteers change, so the app must not depend on one person:

- Keep at least two administrators at all times; the app warns if the last administrator tries to remove their own role.
- Create the hosting, database, email provider, domain, and Google sign-in project under a church-owned account (e.g. a church Google Workspace admin account), not a personal one.
- Keep a short admin guide: how to add users and departments, open a cycle, change the tax rate or branding, and who to contact for technical help.
- Keep a separate test (staging) copy of the app for trying changes before they reach real users.

---

# 21. Go-Live Checklist

Everything needed to put the app live, on free tiers only (20.3), is in **[go-live-checklist.md](go-live-checklist.md)**: each account, tool and integration, who owns it, what to configure, the environment variable it feeds, and the launch-day steps. In short:

| # | Tool or account | Used for |
|---|---|---|
| 1 | Church-owned Google account (Workspace for Nonprofits if eligible) | Owns every other account and the backups |
| 2 | GitHub (repository, Actions, secrets) | Code, CI, scheduled jobs, backups |
| 3 | Netlify (free) | Hosting the app |
| 4 | Neon Postgres (free) | Database, plus a branch for staging |
| 5 | Google Cloud project | Google sign-in (OAuth client) and Drive access for backups |
| 6 | Planning Center | Sign-in (OAuth app), Group Leader check and team mapping (Personal Access Token) |
| 7 | Cloudflare R2 (free) | Receipts and logo files |
| 8 | Google Drive folder + encryption key | Nightly encrypted database backups |
| 9 | Resend (free, the church's existing account) | Sending all email |

---

# 22. User Manual

The instruction manual for people using the app is **[user-manual.md](user-manual.md)**. It is organized by role (getting started, requester, Primary and Backup requester, accountant, Board Chair and Vice-Chair, Church Administrator, System Administrator) with a short FAQ, and it is the source for the in-app Help page (FR-36). It is written from this specification; Stage 5 checks it against the built app and adds screenshots.
