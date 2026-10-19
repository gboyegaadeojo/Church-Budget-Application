# Pilot plan (Stage 5)

Before the whole church uses the app, a small group uses it for real work for one to two weeks and reports what goes wrong or is confusing. This is go-live checklist launch step 7 (Requirements section 15, Stage 5).

**Who:**
- the accountant (and the backup approver, if there is one);
- the Board Chair and the Vice-Chair;
- the Church Administrator;
- a System Administrator;
- **two departments**, each with its Primary and at least one Backup. Pick one leader who is comfortable with computers and one who isn't.

**Where:** the **staging** site (go-live checklist, item 3). It is a full copy of the app with its own database: people sign in with their real Planning Center logins and get real emails and texts, but the money is practice. Nothing from the pilot is carried into the live site.

**How long:** week 1 is annual budgets, week 2 is expenses and spending. Plan 15 to 30 minutes per person per scenario.

**Coordinator:** one person (usually the System Administrator) sets up, sends the scenarios, collects findings, and holds a 10-minute check-in twice a week.

## Before the pilot (System Administrator, about an hour)

- [ ] Staging is deployed and the [deliverability test](email-deliverability.md) passed on it.
- [ ] Sign in as the first System Administrator (`FIRST_ADMIN_EMAIL`; go-live checklist launch step 6).
- [ ] Admin → Users & Roles: add the pilot staff with their roles, and link each one's Planning Center profile.
- [ ] Admin → Departments: add the two pilot departments with their Primary and Backups. The leaders can also join by signing in and picking their department.
- [ ] Admin → Settings: the tax rate (12%), the Primary accountant, at least two signing authorities, and the contact email.
- [ ] Annual Budget → Budget cycles: create a practice cycle (for example **FY2027 Pilot**) with a deadline about 5 days away, and open it. Every pilot leader is emailed.
- [ ] Send everyone this page, the link to staging, and the [user manual](user-manual.md) section for their role.

## Week 1: annual budgets

| # | Who | Do this | You should see | Done |
|---|---|---|---|---|
| 1 | Everyone | Sign in on a computer and on your phone. | Home with **My tasks**; the menu shows only your areas. | |
| 2 | Department A Primary | Submit your department's budget with at least 5 items, one of them $0.00 with a note. Leave halfway and come back. | The draft is saved; the summary shows Subtotal, Sales tax (12%) and Total; you get a receipt email with the reference number. | |
| 3 | Department A Backup | Open the same budget and use one edit to change a quantity. | Edits left goes from 2 to 1; both leaders are emailed. | |
| 4 | Department B Primary | Start from last year's request if there is one, otherwise a new budget. Submit. | As in 2. | |
| 5 | Accountant | Return Department A's budget with a question. | Department A sees it in My tasks and by email. | |
| 6 | Department A (either) | Answer the question and resubmit. | No edit is used; the accountant is emailed. | |
| 7 | Accountant | Approve Department A as requested. Approve Department B **a different amount** (type a total including tax). | The review shows the tax inside the amount and the difference; each department sees its decision and is emailed. | |
| 8 | Accountant | Send a message on one budget. The department replies. | Each message is emailed to the other side. | |
| 9 | Accountant | Reports → Exports: download the annual workbook. | Totals match the review dashboard to the cent. | |
| 10 | Primary of A | Set **Away** for two days, then turn it off. | The Backup gets reminders while you are away. | |

## Week 2: expenses and spending

| # | Who | Do this | You should see | Done |
|---|---|---|---|---|
| 11 | Department A leader | Submit a **purchase request** to be bought on the church account, with a quote attached. | The budget strip shows Remaining after this; a receipt email. | |
| 12 | Accountant and Board Chair | Both approve it, in either order. | After the second approval it's Committed on the department's spending page; the Church Administrator gets a task. | |
| 13 | Church Administrator | **Start processing**, then **Record payment** as Church card. | It shows Purchased; a spending entry appears in Spending → Ledger. | |
| 14 | Department B leader | Submit an **expense claim** with a photo of a receipt taken on your phone, to be paid by e-transfer. | The photo is attached; a receipt email. | |
| 15 | Board Chair | **Approve a smaller amount** with a reason; then the accountant approves. | The lower amount is approved; the department is told. | |
| 16 | Church Administrator | Record the e-transfer payment. | It shows Paid; the requester is emailed. | |
| 17 | Department A leader | Submit a claim that takes the department over budget, with an explanation. | A warning with the amount; the approvers see it too. Decline it (accountant). | |
| 18 | Accountant | Record a spending entry by hand, then void it with a reason. | The voided entry stays listed, struck through, and isn't counted. | |
| 19 | Accountant | Spending → Export to Excel. | The Budget vs Actual totals match the Spending dashboard to the cent. | |
| 20 | Vice-Chair | With the Board Chair set to **Away**, approve an expense. | The Vice-Chair gets the task and the email. Turn Away off afterwards. | |
| 21 | System Administrator | Reports → Analytics & Audit → Activity and Access. | Every step above is in the activity log, with who did it. | |

Also notice, all fortnight: emails that arrive late or in spam, reminder texts outside 9 a.m. to 8 p.m., anything slow, and words that confuse you.

## Recording findings

Keep one shared list (a Google Sheet works well) with these columns:

| When | Who | Page or step # | What you did | What happened | What you expected | Screenshot | Kind |
|---|---|---|---|---|---|---|---|

**Kind:**
- **Money:** an amount, tax or total is wrong, or doesn't match an export. Fix before launch, always.
- **Blocker:** someone can't finish a task they need. Fix before launch.
- **Confusing:** finished, but the words or steps were unclear. Fix before launch if quick, otherwise soon after.
- **Idea:** something that would help. Considered after launch.

The coordinator reviews the list at each check-in and passes it to the developer. Each fix is noted against its row, and the person who found it checks it again.

## Finishing the pilot

The pilot ends, and launch can go ahead, when:

- [ ] every scenario above is ticked by the role that ran it;
- [ ] no **Money** or **Blocker** finding is open;
- [ ] the pilot's emails arrived in inboxes, not spam, for everyone;
- [ ] the accountant and the Board Chair agree it is ready.

Then record the dates, who took part and the findings fixed in `docs/decisions.md`, and continue with launch step 8 in the [go-live checklist](go-live-checklist.md). Nothing from staging moves to the live site: the live database starts empty, and the live set-up (launch step 6) is done again there.
