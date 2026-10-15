# IFC Church Budget Application

A web app for Immanuel Fellowship Church to:

1. **Set each department's yearly budget (Annual Budget).** Departments submit what they need for the year. The accountant approves it, or approves a different amount (including 12% tax) based on the board's decision.
2. **Approve spending during the year (Expenses).** Departments submit purchase requests and expense claims against their approved budget. The accountant approves, then the Board Chair. The church administrator then pays or purchases and records how.
3. **Track what's left.** The app shows approved, committed, spent and remaining for every department.

Sign-in is with Google or Planning Center. Only verified Group Leaders can submit. Everything runs on free tiers.

## Documents

| Document | What it covers | Who it's for |
|---|---|---|
| [Requirements (PRD/SRS) v3.3](docs/church-media-budget-requirements.md) | What the app must do: roles, workflows, functional requirements (FR-xx), data model, security, business rules, acceptance criteria (AC-xx), delivery stages, decisions | Developer (Claude Code), testers, church leadership |
| [Design Requirements (DRD) v3.3](docs/church-media-budget-design.md) | How it looks and behaves: colours, typography, motion, screens, statuses, emails, accessibility | Designer, developer |
| [User manual](docs/user-manual.md) | How to use the app, by role; source for the in-app Help page | Everyone using the app |
| [Go-live checklist](docs/go-live-checklist.md) | Every account, tool and integration needed to launch, on free tiers | Church leadership, administrators, developer |
| [Build guide for Claude Code](CLAUDE.md) | How to build it: stack, structure, conventions, build order, testing, setup | Claude Code |

If the two documents disagree about **behaviour**, the requirements win. If they disagree about **look or interaction**, the design document wins.

## Quick reference

| Topic | Answer | Where |
|---|---|---|
| Sales tax | 12%, one line, on the subtotal, rounded to the cent, no exemptions | Req FR-07a |
| Annual approval | Accountant enters one approved total **including tax**, plus a board reference | Req FR-16 |
| Edits after submitting the annual budget | 2; a clarification response doesn't count | Req FR-12 |
| Expense approval | Accountant, then Board Chair; then the church administrator records payment | Req 6B.4–6B.5 |
| Attachments | None, except receipts on expense claims and the admin's logo | Req FR-23, 6B.9 |
| Emails | Every update emails the people involved; annual decisions can be held for a scheduled release | Req FR-21, FR-19a, FR-49 |
| Sign-in | Google or Planning Center; requesters need the Group Leader custom field | Req FR-01, FR-01a |
| Cost | Free tiers only (Gmail, Netlify, Neon, GitHub Actions, Cloudflare R2) | Req 20.3 |
| Department leaders | One Primary and an optional Backup requester per department | Req FR-38 |
| Planning Center teams | Departments can be mapped to a Planning Center team, group or tag to keep leaders in step | Req FR-39 |
| Audit and analytics | Reports → Analytics & Audit: charts, full activity log, access checks | Req FR-52 |
| Build order | Stage 1 Annual Budget → 2 Polish → 3 Expenses → 4 Spending → 5 Launch | Req Section 15 |

## Roles

It is **one application** for everyone: one web address, one sign-in, and a Home page with **My tasks** showing what each person needs to do across all their roles.


| Role | Who | Main job |
|---|---|---|
| Requester | Department leaders (verified Group Leaders in Planning Center) | Submit the annual budget and expenses |
| Accountant (+ backup approver) | Church accountant | Approve annual budgets; first approval on expenses |
| Board Chair | Chairman of the Board | Final approval on expenses |
| Vice-Chair | Vice-Chairman of the Board | Final approval when the Chair is away or conflicted |
| Church Administrator | Admin assistant | Pay or purchase approved expenses; record spending |
| System Administrator | Whoever runs the app | Users, departments, settings, Planning Center, branding; **sees everything** (read-only) |

## What the church needs to provide before building starts

- [x] Department list (18 departments, Req FR-03). Representatives aren't pre-loaded because leaders change; they join by signing in or through Planning Center mapping
- [ ] Planning Center: G creates the OAuth app and API key, and confirms the custom field and value for Group Leader
- [ ] Email addresses for the accountant, Board Chair, Vice-Chair, backup approver, church administrator, and two system administrators; any address works (Req FR-01b)
- [ ] A church-owned Google account to own hosting, database, email and code (explained in the [go-live checklist](docs/go-live-checklist.md))
- [ ] Cheque signing authorities' names; editable later in the app (Req FR-53)
- [ ] Logo and brand colour; editable later by the administrator (Req FR-30)
- [ ] FY2027 budget year dates and submission deadline; the deadline can be changed or extended per department (Req 4.3)

## Going live

Every account, tool and integration needed to launch is listed in the [go-live checklist](docs/go-live-checklist.md).

## Status

The requirements and design are final for build (v3.0, 2026-10-15). Claude Code will build the app in the stages in Requirements Section 15. The two specifications are in `docs/`; the build guide for Claude Code is `CLAUDE.md` at the repository root.
