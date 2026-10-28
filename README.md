# IFC Church Budget Application

A web app for Immanuel Fellowship Church to:

1. **Set each department's yearly budget (Annual Budget).** Each department submits one budget for the year. The accountant approves it, approves a different amount (including 12% tax) based on the board's decision, asks a question, or declines.
2. **Approve spending during the year (Expenses).** Departments submit purchase requests (before buying) and expense claims (after buying) against their approved budget. The accountant and the Board Chair both approve; then the Church Administrator pays or purchases and records how.
3. **Track what's left (Spending).** Approved, amendments, committed, spent and remaining for every department, with a ledger, Budget vs actual, alerts, a year-end lock and Excel exports.

It runs at **https://budget.ifcwpg.com**. Most people sign in with an emailed code: ministry leaders and church staff type the email on their Planning Center profile (Ministry Leader = Yes), the one Church Center uses, and anyone not in Planning Center uses the address the church has for them. People who log in to Planning Center itself can use that instead. It installs on phones like an app, with alerts. Everything runs on free tiers, except Twilio for the optional reminder texts (about CA$5-8 a month). The services are listed under [Services and tools](#services-and-tools).

## Status

Stages 1 to 4 are built, tested and merged (annual budgets, polish, expenses, spending). **Stage 5: hardening and launch** (Requirements Section 15) is under way. Done: the security review, the nightly backup and restore test, reminder texts, the performance check ([docs/performance.md](docs/performance.md)), the user manual check, the automated phone check, the email deliverability test script ([docs/email-deliverability.md](docs/email-deliverability.md)), production setup (migrations on deploy, the first System Administrator), the manual's screenshots and the [pilot plan](docs/pilot-plan.md). Left for the church: the phone check on real phones, the deliverability test, the pilot, and the [go-live checklist](docs/go-live-checklist.md).

Every choice made along the way that the specifications didn't settle is recorded in [docs/decisions.md](docs/decisions.md).

## Roles

It is **one application** for everyone, at **https://budget.ifcwpg.com**: one web address, one sign-in, and a Home page with **My tasks** showing what each person needs to do across all their roles.

| Role | Who | Main job |
|---|---|---|
| Requester | Department leaders (Ministry Leader = Yes in Planning Center) | Submit the annual budget and expenses; follow their department's spending |
| Accountant (+ backup approver) | Church accountant | Decide annual budgets; approve expenses; amend budgets; lock the year |
| Board Chair | Chairman of the Board | Approve expenses (alongside the accountant) |
| Vice-Chair | Vice-Chairman of the Board | Approves when the Chair is away or conflicted |
| Church Administrator | Admin assistant | Pay or purchase approved expenses; record spending |
| System Administrator | Whoever runs the app | Users, departments, settings, Planning Center, branding; **sees everything** (read-only on money) |

## Documents

| Document | What it covers | Who it's for |
|---|---|---|
| [Requirements (PRD/SRS)](docs/church-media-budget-requirements.md) | What the app must do: roles, workflows, functional requirements (FR-xx), data model, rules, acceptance criteria (AC-xx), delivery stages | Developer, testers, church leadership |
| [Design Requirements (DRD)](docs/church-media-budget-design.md) | How it looks and behaves: colours, typography, motion, screens, emails, accessibility | Designer, developer |
| [Decisions](docs/decisions.md) | Every choice and change made during the build, with the reason | Developer, church leadership |
| [User manual](docs/user-manual.md) | How to use the app, by role; source for the in-app Help page | Everyone using the app |
| [Go-live checklist](docs/go-live-checklist.md) | Every account, tool and integration needed to launch, on free tiers | Church leadership, administrators, developer |
| [Demo site](docs/demo-site.md) | A hosted training copy with made-up people, alongside production | Administrators, trainers |
| [Build guide](CLAUDE.md) | Stack, structure, conventions, hard constraints, testing | Developer (Claude Code) |

If the requirements and the design disagree about **behaviour**, the requirements win; about **look or interaction**, the design wins. Later decisions in `docs/decisions.md` override both where they say so.

## Quick reference

| Topic | Answer | Where |
|---|---|---|
| Sales tax | 12%, one line, on the subtotal, rounded to the cent; the rate is kept with each request and expense | Req FR-07a |
| Money | Integer cents everywhere; the server recalculates every total | CLAUDE.md |
| Annual budgets | One per department per year; 2 shared edits after submitting; the accountant approves one total **including tax** | Req FR-12, FR-16; decisions 2026-10-17 |
| Expense approval | The accountant and the Board Chair are asked at the same time; either may approve first, and the lower amount stands | Req 6B.4; decisions 2026-10-16 |
| Files | Receipts on claims, optional attachments (quote, invoice, photo) on purchase requests, and the admin's logo; nothing else | Req 6B.9, FR-30; decisions 2026-10-17 |
| Emails | Every update emails the people involved, through an outbox; nobody can turn them off | Req FR-21, FR-49 |
| Texts | Four reminders also go by text to a Planning Center mobile number, 9:00 a.m. to 8:00 p.m., up to a monthly limit; reply STOP to stop | decisions 2026-10-18 |
| Sign-in | **Sign in with Church Center Email** first: a 6-digit code to the email on a leader's Planning Center profile ("Ministry Leader" = "Yes"), or to the address the church has for someone not in Planning Center. **Staff: sign in with Planning Center** for people who have one. Staff are added from Planning Center | Req FR-01, FR-01a, FR-01b; decisions 2026-10-20, 2026-10-23 |
| Year-end | The accountant locks a year's spending; open purchase requests are cancelled or carried into next year | Req FR-29, FR-46 |
| Audit and analytics | Reports → Analytics & Audit: Overview charts, the full activity log, access checks | Req FR-52 |
| Notifications | Every email also lands in the bell; the installed app shows phone alerts, which only a System Administrator can turn off | decisions 2026-10-19, 2026-10-22 |
| Cost | Free tiers: Vercel, Neon, Resend, GitHub, Cloudflare R2, Google Drive, web push. Paid: Twilio for reminder texts (approved) | Req 20.3; decisions 2026-10-18 |

## Services and tools

What the app runs on, and what each one is for. Accounts are the church's; secrets live only in the hosting and GitHub settings, never in this repository.

| Service | What it's for | Plan |
|---|---|---|
| **Vercel** | Hosts the app at **https://budget.ifcwpg.com**: builds each release, runs the pages and server, and brings the database up to date on each production deploy ([docs/vercel.md](docs/vercel.md)) | Free (Hobby); see the note in docs/vercel.md |
| **Netlify** | The first host, replaced by Vercel on 2026-10-23. The setup is kept (`netlify.toml`) so the app can move back in minutes | Free |
| **Neon** | The Postgres database: every budget, expense, payment, user and the activity log. Production and staging branches, in AWS US East (Ohio) next to the app | Free |
| **Planning Center** | The People API: checks the Ministry Leader field (also for emailed-code sign-in), suggests departments, finds staff to add, reads mobile numbers for texts. Also the "Staff: sign in with Planning Center" button | The church's existing account; API free |
| **Resend** | Sends every email (decisions, approvals, payments, reminders, sign-in codes) from budget@ifcwpg.com | The church's existing account; free |
| **Cloudflare R2** | Stores receipt photos and purchase-request attachments, privately, with short-lived links | Free tier (card on file) |
| **Web push** | Phone and computer alerts for the installed app, through Apple's, Google's, Mozilla's and Microsoft's own push services (`web-push` library, VAPID keys) | Free, no account |
| **Twilio** | Optional reminder texts (deadline, approvals, payments, unclaimed purchases) | Paid, about CA$5-8 a month; the one approved paid service, set up when the church is ready |
| **GitHub** | The code, tests on every change (GitHub Actions), the nightly jobs (Planning Center check, reminders), the hourly jobs on Vercel, and the nightly backup | Free (public repository) |
| **Google Drive** (+ a Google Cloud project) | Holds the encrypted nightly database backups in a church folder | Free |
| **age** | Encrypts each backup before it leaves GitHub; the private key is kept offline on two USB drives | Free, open source |
| **Squarespace** | The church's domain settings: `budget` points at Vercel | The church's existing domain |

## For developers

### Stack

Next.js (App Router, TypeScript strict) · Tailwind CSS with the DRD tokens · Radix UI · React Hook Form + Zod (shared by client and server) · Neon Postgres with Drizzle ORM and migrations · Auth.js (Planning Center OAuth and emailed codes) · Resend for email · web push for phone alerts · Twilio for reminder texts · Cloudflare R2 for files · ExcelJS for exports · Vitest and Playwright (Chromium, axe-core) for tests. Hosted on Vercel (Netlify also works from the same code).

### Run it on your computer

You need Node.js 22 or later. On Windows PowerShell, use `npm.cmd` instead of `npm`.

```sh
npm install
npm run dev:fake     # the app at http://localhost:3000 with no outside services
```

`dev:fake` starts an in-memory Postgres (PGlite), migrates it, seeds test people and data, and turns on **Sign in as…** buttons for each test person, a fake email outbox and a fake Planning Center. Data is gone when it stops. New migrations are applied while it runs.

`npm run dev:demo` runs the same thing as the hosted demo (banner and demo sign-in) at <http://demo.localhost:3000>.

To run against a real database instead, copy `.env.example` to `.env.local`, fill in the values (see the go-live checklist for where each comes from) and run `npm run dev`.

### Commands

| Command | What it does |
|---|---|
| `npm run dev:fake` | Local app with fake services and test data |
| `npm run dev:demo` | Local app as the demo site |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` · `npm run format:check` · `npm run typecheck` | ESLint, Prettier, TypeScript |
| `npm test` | Unit tests (Vitest) |
| `npm run test:integration` | Service tests against Postgres (PGlite locally, a real Postgres in CI) |
| `npm run test:e2e` | Playwright end-to-end and accessibility tests; it builds the app and starts the fake server on port 3100 itself |
| `npm run test:perf` | The performance check: a year of data at three times church scale, timed page by page (not in CI) |
| `npm run screenshots` | Regenerates the user manual's screenshots in `docs/images/manual/` from the fake server (not in CI) |
| `npm run db:generate` · `npm run db:migrate` · `npm run db:check` | Drizzle migrations |

### Where things are

```
src/app/          routes: (auth) sign-in, (app) annual/ expenses/ spending/ reports/ admin/, api/
src/domain/       business rules: annual, expenses, spending, tasks, analytics, users, settings…
src/lib/          money.ts (cents and tax), authz.ts (every permission), audit, email and text outboxes, storage, excel
src/copy/         all UI text (English, Canada)
src/db/schema.ts  the database schema; migrations are in drizzle/
tests/            unit, integration, e2e (tests are named after their ACs)
scripts/          fake server, test seed, demo reset
vercel.json       Vercel build, region, production-only migrations, and main as the only branch built
netlify/functions hourly jobs when hosted on Netlify
.github/workflows CI on every PR, nightly jobs, hourly jobs on Vercel, backup, demo reset
```

Every action follows the same order in one transaction: permission check, validation, status-machine check, write, audit, email outbox. See [CLAUDE.md](CLAUDE.md) for the hard constraints and conventions.

### Quality bar

CI must pass lint, typecheck, unit, integration and end-to-end tests (with axe accessibility checks at 360 px and 1440 px) before anything merges into `main`.

### Deploying

Production is the Vercel project `ifc-budget`, connected to this repository ([docs/vercel.md](docs/vercel.md)). **Merging a pull request into `main` puts it live** within a few minutes; other branches and pull requests are never built (Vercel shows them as "Canceled", which is expected). [vercel.json](vercel.json) builds it and, on production deploys only, brings the database up to date afterwards (`scripts/migrate.mjs`); a failed migration fails the deploy and the previous version stays live. The hourly jobs run from `.github/workflows/hourly.yml`. [netlify.toml](netlify.toml) does the same on Netlify, the previous host. On a new, empty database, set `FIRST_ADMIN_EMAIL` and sign in with an emailed code at that address to become the first System Administrator. The environment variables, secrets and scheduled jobs are listed in [CLAUDE.md](CLAUDE.md#environment-variables-names-only-values-live-in-netlify-and-github-secrets) and explained in the [go-live checklist](docs/go-live-checklist.md). The optional training copy is set up as in [docs/demo-site.md](docs/demo-site.md).

## What the church provides before launch

- [x] Department list (18 departments, Req FR-03). Leaders join by signing in or through Planning Center mapping
- [x] Planning Center: the OAuth app and API key, and the leader custom field and value ("Ministry Leader" = "Yes", used for leaders and staff)
- [ ] Who holds each staff role: accountant, Board Chair, Vice-Chair, backup approver, Church Administrator and two System Administrators. Staff in Planning Center are added from it; an email address is needed only for someone who isn't
- [ ] A church-owned Google account to own hosting, database, email and code (see the [go-live checklist](docs/go-live-checklist.md))
- [x] Cheque signing authorities' names (editable later, Req FR-53)
- [x] Logo and brand colour (editable later by the administrator, Req FR-30)
- [ ] FY2027 budget year dates and submission deadline (changeable and extendable per department, Req 4.3)
