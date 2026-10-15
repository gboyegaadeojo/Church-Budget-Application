# IFC Budget App: User Manual

**Organization:** Immanuel Fellowship Church (IFC)
**Companion documents:** [Requirements](church-media-budget-requirements.md) (Section 22) · [Design](church-media-budget-design.md) · [Go-live checklist](go-live-checklist.md) · [README](../README.md)

This manual explains how to use the app, by role. It is written from the specification; before launch it is checked against the built app, screenshots are added, and it becomes the source for the in-app **Help** page.

**Contents**

1. [Getting started (everyone)](#1-getting-started-everyone)
2. [Requesters: annual budget](#2-requesters-annual-budget)
3. [Requesters: expenses during the year](#3-requesters-expenses-during-the-year)
4. [Primary and Backup requesters](#4-primary-and-backup-requesters)
5. [Accountant](#5-accountant)
6. [Board Chair and Vice-Chair](#6-board-chair-and-vice-chair)
7. [Church Administrator](#7-church-administrator)
8. [System Administrator](#8-system-administrator)
9. [Analytics and Audit (everyone, by role)](#9-analytics-and-audit-everyone-by-role)
10. [Frequently asked questions](#10-frequently-asked-questions)

---

## 1. Getting started (everyone)

### Signing in

1. Open the app's web address on a computer or phone.
2. Choose **Continue with Google**, **Continue with Planning Center**, or **Continue with email** (we email you a 6-digit code). They all reach the same account if your email matches. Staff can use any email address, such as a work or personal one; staff signing in by email code also enter a code from an authenticator app.
3. Department leaders must be marked as a **Group Leader** in Planning Center: **Ministry Leader** set to **Yes** on their Planning Center profile. If you see "Your Group Leader status in Planning Center could not be confirmed", ask your ministry's Planning Center administrator.
4. If you see "Waiting for department assignment", the System Administrator has been told and will add you.

Staff (accountant, Board Chair, Vice-Chair, Church Administrator, System Administrator) must have 2-Step Verification on their Google account.

### Home and My tasks

Everyone lands on **Home**:

- **My tasks** lists everything waiting for you across all your roles, oldest first, with one button each. When it is empty it says "You're all caught up."
- **At a glance** shows a card for each of your roles, such as your department's remaining budget.
- **Recent activity** shows what changed on items you are involved in.

You never need to switch accounts. If you are both an accountant and a requester, you see both in one menu.

### Getting around

- The menu is grouped by area: **Home, Annual Budget, Expenses, Spending, Reports, Admin**. You only see what your roles allow. On a phone, the bar at the bottom has Home, Annual Budget, Expenses and Spending, and **More** has the rest.
- **Search** (top bar, or press `/`): type a reference number such as `EXP-2027-0042` or `IFC-2027-MEDIA-0007`, a department, or a person.
- **Breadcrumbs** under the top bar show where you are; click any part to go back up.
- Every reference number, department and person name is a link.

### Your account

From the account menu: theme (light, dark or system), email preferences, **Away** (accountants, Board Chair, Vice-Chair, Primary requesters), and sign out.

### Money on screen

All amounts are Canadian dollars. Every total shows **Subtotal**, **Sales tax (12%)**, and **Total (incl. tax)**. Prices you type are **before tax**; the app adds tax once on the subtotal.

---

## 2. Requesters: annual budget

Each department submits one annual budget for the year.

### Submit your department's budget

1. Go to **Annual Budget → Submit**. If your department already has a draft, the app opens it.
2. **Details:** choose your department (or **Other** and type it; the System Administrator will confirm it), give a title, and write why the department needs this budget. Or choose **Start from last year's request** to copy last year's items.
3. **Items:** add each item with name, quantity, unit price (before tax), and an optional product link. The summary on the side (bottom on a phone) updates as you type.
4. Your work saves automatically as a **draft**. You can leave and come back.
5. **Preview:** check everything, including the totals.
6. **Confirm submission.** You get a receipt email, and the accountant is told.

### After you submit

- You can **edit** a submitted budget **twice** before it is decided. The app shows how many edits are left. Edits are shared by everyone in your department.
- If the accountant asks a question (**Returned for clarification**), it appears in My tasks. Answer it and resubmit; this does **not** use an edit.
- Use **Messages** on the budget to talk with the accountant; each message emails the other side.
- When decided, you get an email. The approved amount may be different from what you asked for; it always includes tax.

### See how much is left

**Spending → My department budget** shows your approved budget, committed, spent, and remaining for the year.

---

## 3. Requesters: expenses during the year

Spend against your approved annual budget with two kinds of submission:

| Use | When |
|---|---|
| **Purchase request** | Before buying: "May we buy 2 microphones?" Approval sets the money aside (Committed). |
| **Expense claim** | After buying: "I paid $112.00, please pay me back." Attach receipts. Submit within 90 days of buying. |

### Submit an expense

1. Go to **Expenses → New expense** and pick the type.
2. Choose the department. The **budget strip** shows Available, Committed, Spent and Remaining.
3. Enter the title and why it is needed.
4. Purchase request: add items (before tax) and choose **How it will be bought**. Expense claim: add receipt lines (amount paid including tax), choose who is paid and how (cheque or e-transfer), and attach photos or PDFs of the receipts.
5. If it would take the department over budget, explain why.
6. Preview and **Confirm submission**.

### What happens next

The accountant approves first, then the Board Chair (or Vice-Chair). After final approval, the Church Administrator pays or buys and records how. You get an email at each step, and **My expenses** shows a tracker with where it is.

---

## 4. Primary and Backup requesters

Each department has a **Primary requester** (accountable for the department's budget) and can have a **Backup requester** who covers.

- Both can do everything for the department: submit and edit the annual budget, answer questions, send messages, and submit expenses.
- Both see the department's tasks in My tasks. Reminders go to the Primary first; if a task is still open after 3 days, the Backup is reminded too.
- **Primary: choose your backup.** On your department page, choose **Nominate a backup** and pick a verified Group Leader. The System Administrator is told.
- **Primary: going away?** Turn on **Away** with dates. Your Backup gets the reminders and the department shows who is covering.
- If the Primary leaves the role, the Backup becomes Primary automatically and the System Administrator is asked to pick a new Backup.

---

## 5. Accountant

### Annual budgets

1. **Annual Budget → Review dashboard** shows each department's status, totals, and the board total versus what is already allocated.
2. Open a budget to review it, then choose:
   - **Approve as requested**;
   - **Approve a different amount**: type the one approved total **including tax** and the board reference; the app works out the tax inside it (for example $30,000.00 = $26,785.71 + $3,214.29 tax);
   - **Approve with line changes**;
   - **Return for clarification** with your question;
   - **Decline** with a reason.
3. Confirm. If decisions are set to **Hold**, emails go out together at the scheduled release time (**Decision release**); otherwise straight away.
4. **Reopen** a declined budget with a reason if the department needs to try again.
5. You cannot decide a budget for a department you represent; it goes to the backup approver.

### Expenses (first approval)

1. **Expenses → Review queue**. Open a submission to see items, receipts, and the budget before and after.
2. Choose **Approve and send to Board Chair**, **Approve a different amount**, **Return for clarification**, or **Decline**.

### Spending

Record spending, refunds and corrections, make **budget amendments** with a reason, and **lock** the spending year at year-end (**Spending** area).

### Away

Turn on **Away** in the account menu; the backup approver gets your emails and tasks.

### Reports

**Reports** for Excel exports, and **Reports → Analytics & Audit** for charts and the activity log (section 9).

---

## 6. Board Chair and Vice-Chair

1. When the accountant approves an expense, you get an email and a task: **Final approval**.
2. Open it from the email or **Expenses → Awaiting my approval**. You see the amount, the accountant's note, receipts, and the department's remaining budget.
3. Choose **Give final approval**, **Approve a smaller amount** (including tax, with a reason), **Return to accountant** with a question, or **Decline** with a reason.
4. The Chair can turn on **Away**; the Vice-Chair then gets the tasks. The Vice-Chair also decides when the Chair represents the department or is the payee. Decisions show who made them.

These screens are designed for a phone.

---

## 7. Church Administrator

### Pay or buy approved expenses

1. You get an email "Approved, ready for processing" and a task. Open **Expenses → Ready to process** (oldest first).
2. Select **Start processing**. The requester is told.
3. Pay or buy outside the app, then select **Record payment**: how it was paid (cheque, church card, cash, e-transfer, supplier invoice, other), date, amount paid including tax, reference (cheque number and the two signers, card last 4 digits, and so on), and notes.
4. Confirm. The requester is emailed, and the department's spending updates automatically.

### Record other spending

**Spending → Record spending** for spending that did not come through an expense. You can **correct** or **void** an entry with a reason; nothing is deleted. You cannot record into a locked year.

### Reports

Spending and budget-vs-actual exports, and spending analytics on **Reports → Analytics & Audit**.

---

## 8. System Administrator

You can **see everything** but cannot approve or pay unless you are also given that role.

### Users and roles

**Admin → Users & Roles**: add people, assign roles and departments, deactivate people who leave. Keep at least two System Administrators.

### Departments

**Admin → Departments**:

- Add departments (or paste a list), rename, deactivate. At setup, paste the church's 18 departments; nobody needs to be assigned in advance, because leaders join by picking their department.
- Set each department's **Primary** and **Backup** requester. Use the **No backup** filter to find gaps.
- **Proposed** tab: departments people typed under **Other**. Choose **Add to list**, **Merge into…**, or **Reject** with a reason.
- **Planning Center mapping**: link a department to a Planning Center Services team (for example the Media team that runs ProPresenter), a group, a group tag, or a custom field value. In **Suggest** mode, leaders found there appear as suggestions you **Add** or **Ignore**; in **Automatic** mode they are added and removed for you. Use **Sync now** to check straight away.

### Budget cycles

**Admin → Budget Cycles**: create the year (the first is FY2027), set the deadline and board-approved church total, open and close it, and choose whether decision emails go out immediately or at a scheduled time.

- **Change deadline**: pick the new date and give a reason; departments that haven't submitted are emailed.
- **Give extension**: a later date for one department only, with a reason.

### Settings

Tax rate (applies to new submissions only), Planning Center connection, custom field and **Test a person**, branding (logo, names, colour), email settings, sign-in options (Google, Planning Center, email), backup reminder delay, and the weekly audit summary email.

**Signing authorities**: **Add signer** when someone can sign cheques; **Remove** when they no longer can. Removed signers stay on past payments. Keep at least two active.

### Keeping it healthy

Check **Admin → Notifications & Audit** for failed emails, and **Reports → Analytics & Audit → Access** weekly (see the [go-live checklist](go-live-checklist.md), section 4).

---

## 9. Analytics and Audit (everyone, by role)

**Reports → Analytics & Audit** has three tabs. What you see depends on your roles; requesters see their own department only.

- **Overview:** headline numbers (approved, committed, spent, remaining, waiting approvals) and charts. Use the filter bar (cycle, department, area, dates). Click a bar to see the items behind it, then click an item to open it. **Chart / Table** switches to a table; **Export** downloads Excel.
- **Activity:** every action on the platform: who did it, in which role, when, on what, and why. Use the quick views (Today, Decisions this week, Money changes, Sign-ins and access, Settings and roles, Failed emails), search, or filters. Click a row to see before and after values.
- **Access** (System Administrator): failed sign-ins, access denied attempts, Planning Center problems, staff without 2-Step Verification, and departments without a Backup, each with a link to fix it.

The address keeps your filters, so you can bookmark a view or send the link to a colleague who has the same access.

---

## 10. Frequently asked questions

**How is tax calculated?** 12% of the subtotal, once, rounded to the cent. Example: $1,025.00 + $123.00 tax = $1,148.00.

**Why was I approved for less than I asked?** The board sets each department's yearly amount; the accountant enters it including tax. See the decision email or Messages.

**Does answering a question use one of my two edits?** No.

**Can I upload quotes or documents?** Only receipts on expense claims. Use product links instead.

**I didn't get an email.** Check spam, then My tasks, which always shows what needs you. Ask the System Administrator to check **Notifications**.

**Someone else in my department started the budget.** That's fine: everyone in the department works on the same one.

**How do I change my personal information?** Use the request link on the **Help** page. Financial records are kept for the retention period.

**Who do I contact?** The System Administrator for access; the accountant for budget and expense questions.
