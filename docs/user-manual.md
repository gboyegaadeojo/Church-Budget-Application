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
2. Choose **Continue with Planning Center** or **Continue with Google**. They reach the same account if your email matches. If your **Ministry Department** field in Planning Center names your department, you are added to it when you sign in.
   - **Not in the church's Planning Center?** The Church Administrator and System Administrators can choose **Continue with email** instead: enter the address the church has for you, and type in the 6-digit code we email you. A code works once, for 10 minutes. After 5 wrong codes, wait 15 minutes. Everyone else signs in with Planning Center.
3. Department leaders must be marked as a **Group Leader** in Planning Center: **Ministry Leader** set to **Yes** on their Planning Center profile. If you see "Your Group Leader status in Planning Center could not be confirmed", ask your ministry's Planning Center administrator.
4. If you see "Waiting for department assignment", the System Administrator has been told and will add you.

Two-step verification isn't required for any role. Turning it on for your own Google or Planning Center account is still a good idea.

### Home and My tasks

Everyone lands on **Home**:

- **My tasks** lists everything waiting for you across all your roles, oldest first, with one button each. When it is empty it says "You're all caught up."
- **At a glance** shows a card for each of your roles, such as your department's remaining budget.
- **Recent activity** shows what changed on items you are involved in.

You never need to switch accounts. If you are both an accountant and a requester, you see both in one menu.

### Getting around

- The menu is grouped by area: **Home, Annual Budget, Expenses, Spending, Reports, Admin**, each with its own colour. You only see what your roles allow.
  - **Computer:** choose an area in the sidebar to open its pages; the area you are in opens by itself, and a dot marks it when it is closed. **Collapse sidebar** shrinks it to coloured icons.
  - **Tablet:** the coloured icons down the left side are the areas; tap one to see its pages.
  - **Phone:** the bar at the bottom has Home, Annual Budget, Expenses and Spending. **More** opens every page, grouped by area, plus Help and Privacy.
- **Search** (top bar, or press `/`): type a reference number such as `EXP-2027-0042` or `IFC-2027-0007`, a department, or a person.
- **Breadcrumbs** under the top bar show where you are; click any part to go back up.
- Every reference number, department and person name is a link.

### Your account

From the account menu: theme (light, dark or system), email preferences, **Away** (accountants, Board Chair, Vice-Chair, Primary requesters), and sign out.

### Money on screen

All amounts are Canadian dollars. Every total shows **Subtotal**, **Sales tax (12%)**, and **Total (incl. tax)**. Prices you type are **before tax**; the app adds tax once on the subtotal.

---

## 2. Requesters: annual budget

Each department submits **one** annual budget for the year. Once it has one (a draft or a submitted budget), nobody can start another for it: everyone in the department works on that one, and after submitting you edit it instead. **My department's budget** shows each of your departments' budgets with the next step (**Continue draft**, **Respond**, **Edit budget** or **View budget**); **Submit annual budget** appears only for a department that doesn't have one yet.

### Submit your department's budget

1. Go to **Annual Budget → My department's budget** and choose **Submit annual budget** (or **Continue draft** if your department has one). The page shows the open cycle, its deadline and how many days are left.
2. **Choose your department.** Your own departments are listed first, marked **Yours**; type in **Search departments** to narrow the list. If yours isn't there, choose **Other (type your department)** and type its name. If it looks like one on the list, the app asks "Did you mean …?". A new name is added as a new department for the System Administrator to confirm, and you can still finish and submit. A department that already has a budget this year is marked **Has a budget**; choosing it offers **Open it** instead of starting another.
   - New Group Leaders who don't have a department yet see **Choose your department** on the "You're verified" screen while a cycle is open, and become their department's representative by picking it.
3. **Request information:** give a title and write why the department needs this budget.
4. **Budget items:** the items are a list with one row each: name, quantity, unit price (before tax) and the line total. Open **Link and notes** under an item to add a product link or a note (a $0.00 item needs a note). Use **Add item** (or press Enter in the last item). Each item's **⋯** menu has **Move up**, **Move down** and **Remove**; removing an item that has details asks first. The summary on the side (a bar at the bottom on a phone; tap **Show breakdown**) updates as you type.
5. Your work saves automatically as a **draft** ("Saved just now"). Use **Save and exit** to save and go back to your budget page, or just leave and come back; if your sign-in times out, the app keeps what you typed on this device and offers it back. A draft that was never submitted can be deleted with **Delete draft**.
6. **Preview:** check everything, including the totals. Use **Edit** to go back to a section.
7. **Confirm submission**, then **Submit request** in the dialog. You see the reference number (for example IFC-2027-0001), the total including tax, and how many changes you can still make. Your receipt email arrives shortly, and the accountant is told.

### After you submit

- You can **edit** a submitted budget **twice** before it is decided. The app shows how many edits are left. Edits are shared by everyone in your department.
- If the accountant asks a question (**Returned for clarification**), it appears in My tasks. Answer it and resubmit; this does **not** use an edit.
- Use **Messages** on the budget to talk with the accountant; each message emails the other side.
- The accountant's question, decline reason or approved amount appears on your budget's page and is emailed to everyone who represents your department. The approved amount may be different from what you asked for; it always includes tax, and the page and the email show it beside what you asked for.
- Before the deadline you're reminded 7 days and 1 day ahead if your department hasn't submitted. You're also told when a budget cycle opens, closes or reopens, and when your deadline changes.
- You're also emailed when you submit (your receipt), when anyone in your department changes the budget, when the review starts, and if it's reopened. Each email says what changed and what, if anything, you need to do. Its link asks you to sign in.
- **Emails** at the bottom of your budget's page lists every email sent to your department about it, and whether it went. If one says **Couldn't be sent**, the budget itself is safe; ask the administrator to check the address.

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

Each department has a **Primary requester** (accountable for the department's budget) and can have up to two **Backup requesters** who cover: **Backup 1** and **Backup 2**. Two Backups help a department that runs at two locations.

- All of them can do everything for the department: submit and edit the annual budget, answer questions, send messages, and submit expenses.
- All of them see the department's tasks in My tasks. Reminders go to the Primary first; if a task is still open after 3 days, both Backups are reminded too.
- **Primary: choose your backups.** On your department page, choose **Make Backup 1** or **Make Backup 2** for a verified Group Leader. The System Administrator is told.
- **Primary: going away?** Turn on **Away** with dates. Your Backups get the reminders and the department shows who is covering.
- If the Primary leaves the role, Backup 1 becomes Primary automatically, Backup 2 moves up to Backup 1, and the System Administrator is asked to fill the empty Backup place.

---

## 5. Accountant

### Annual budgets

1. **Annual Budget → Review dashboard** shows the cycle at a glance: departments expected, submitted and outstanding, requests awaiting review, and the total requested and approved (including tax). Choose another cycle, a status, a department or search by reference, department, requester or title; the filters stay in the address, so Back and shared links keep them.
   - **Review queue**: every submitted budget, changed ones (**Updated**) first. Drafts never appear here.
   - **Department completion**: every department with its representative, status (**Not submitted**, **Draft exists**, or the budget's status), totals and next step.
   - Budgets waiting for you also appear in **My tasks** on Home.
2. Open a budget with **Review**. Opening it marks it **In Review**. You see the details, the items, the revision history (what changed in each version) and earlier decisions. Then choose:
   - **Approve as requested**;
   - **Approve a different amount**: type the one approved total **including tax**, a note, and optionally the board reference. The app shows the tax inside it as you type (for example $30,000.00 includes $3,214.29 sales tax on $26,785.71) and how it compares with what was asked;
   - **Adjust individual items**: change approved quantities or prices before tax (quantity 0 leaves an item out) and add a note; the app adds tax;
   - **Return for clarification** with your question;
   - **Decline** with a reason.
3. **Review decision**, check the summary (requested, approved and the difference, all including tax), and confirm. The department sees the decision on its budget straight away and is emailed; you get a copy for your records.
4. **Reopen** an approved or declined budget with a reason if the board reconsiders. It goes back to the department as Returned for Clarification, without using one of its edits, and the earlier decision stays in the history.
5. You're emailed when a budget is submitted, changed or answered if you are the Primary accountant (every accountant is, until one is chosen in Settings). **Emails** at the bottom of the review screen lists every email sent about the budget, copies included.
6. You cannot decide a budget for a department you represent; the page says so, and another accountant or the backup approver decides it.

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
- Set each department's **Primary** and up to two **Backup** requesters (**Backup 1** takes over first). Giving someone a place that's taken makes its holder a Representative; moving a leader into another leader's place swaps them. Use the **No backup** filter to find gaps.
- **Proposed** tab: departments people typed under **Other**. Choose **Add to list**, **Merge into…**, or **Reject** with a reason.
- **Planning Center value**: leaders whose **Ministry Department** field in Planning Center holds the department's name are linked to it automatically (marked **From Planning Center**). If Planning Center uses a different name, type it in **Planning Center value**. A leader whose field no longer lists the department is marked **No longer listed in Planning Center**; nobody is removed automatically, so use **Remove** if they have left.
- **Planning Center mapping** (Stage 2): link a department to a Planning Center Services team (for example the Media team that runs ProPresenter), a group, a group tag, or a custom field value. In **Suggest** mode, leaders found there appear as suggestions you **Add** or **Ignore**; in **Automatic** mode they are added and removed for you. Use **Sync now** to check straight away.

### Budget cycles

**Admin → Budget Cycles**: create the year (the first is FY2027), set the deadline and board-approved church total, open and close it, and choose whether decision emails go out immediately or at a scheduled time.

- **Change deadline**: pick the new date and give a reason; departments that haven't submitted are emailed.
- **Give extension**: a later date for one department only, with a reason.

### Settings

Tax rate (applies to new submissions only), Planning Center connection, custom field and **Test a person**, branding (logo, names, colour), email settings, sign-in options (Google, Planning Center, email), backup reminder delay, and the weekly audit summary email.

- **Sales tax**: type the new rate (for example 12 or 12.5) and confirm. Requests already submitted keep the rate they were submitted with.
- **Accountants**: more than one person can have the Accountant role (give it in Users & Roles). Choose the **Primary accountant**, who gets the accountant emails; everyone else with the Accountant or Backup approver role is a backup approver. If the Primary accountant loses the role or is deactivated, choose a new one here.
- **Church time zone**: deadlines, release times and emails use it (default America/Winnipeg).
- **Sign-in and Planning Center**: the contact email shown to people who can't sign in, which sign-in buttons appear, the custom field and the values that count as a Group Leader, and which roles need the check.
- **Ministry Department**: the second Planning Center field, which names each leader's department, and what it does. **Off** ignores it. **Suggest** (the default) adds leaders to the departments their field names, and they can still pick another department on the form. **Restrict** lets leaders submit only for the departments their field names, plus any you assigned yourself, and hides **Other** on the form. Use **Test a person** to try the field and values on someone before you save. The **Requesters failing verification** list shows who is suspended or not yet verified.

**Signing authorities**: the people who can sign church cheques. They don't need an account in the app. **Add signer** when someone can sign cheques (name, optional email, and the date they start). To fix a spelling or remove someone, open **Edit {name}**; **Remove** takes the date they stop and an optional reason. Removed signers stay on the list and on every payment they signed. When the Church Administrator records a cheque payment, she picks the two people who signed from this list, so keep at least two active; the page warns you when fewer remain.

### Keeping it healthy

You're emailed when something needs you: a leader joins or proposes a department, a new leader is waiting for a department, a requester is suspended because Planning Center no longer lists them, Planning Center can't be reached, someone without access tries to sign in, or the Primary accountant is cleared. Once a day you also get a list of any emails that couldn't be sent after every retry.


Emails that don't go are retried for about three days. **Admin → Notifications & Audit** lists every email with its status; filter by **Couldn't be sent** to see failures and the reason. After fixing an address or the Resend settings, use **Send again** on one email or **Send all failed again**. Check it, and **Reports → Analytics & Audit → Access** weekly (see the [go-live checklist](go-live-checklist.md), section 4).

---

## 9. Analytics and Audit (everyone, by role)

**Reports → Analytics & Audit** has three tabs. What you see depends on your roles; requesters see their own department only.

- **Overview:** headline numbers (approved, committed, spent, remaining, waiting approvals) and charts. Use the filter bar (cycle, department, area, dates). Click a bar to see the items behind it, then click an item to open it. **Chart / Table** switches to a table; **Export** downloads Excel.
- **Activity:** every action on the platform: who did it, in which role, when, on what, and why. Use the quick views (Today, Decisions this week, Money changes, Sign-ins and access, Settings and roles, Failed emails), search, or filters. Click a row to see before and after values.
- **Access** (System Administrator): failed sign-ins, access denied attempts, Planning Center problems, and departments without a Backup, each with a link to fix it.

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
