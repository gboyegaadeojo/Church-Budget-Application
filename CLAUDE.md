# CLAUDE.md: IFC Church Budget Application

Build guide for Claude Code. The two specifications live in `docs/`.

- `docs/church-media-budget-requirements.md`: **what** to build (FR-xx, AC-xx, data model, rules). It wins on behaviour.
- `docs/church-media-budget-design.md`: **how** it looks and behaves (tokens, screens, motion, accessibility). It wins on look and interaction.
- `docs/user-manual.md`: how people use it, by role. Keep it in step with the app; it feeds the Help page (FR-36).
- `docs/go-live-checklist.md`: every account and integration needed to launch.

Read the relevant FRs and the DRD screen section before starting any feature. If something in the specs is ambiguous, choose the option that keeps money correct and auditable, note it in `docs/decisions.md`, and continue.

## Hard constraints

1. **Free tiers only.** Don't add a paid service, plan or dependency. If a feature seems to need one, stop and record it in `docs/decisions.md`. The one approved exception is Twilio for reminder texts (2026-10-18).
2. **Money is integer cents.** Never use floating point for money. All amounts go through `src/lib/money.ts`.
3. **The server is authoritative.** Recalculate every total, tax and balance on the server, and ignore client-sent totals.
4. **Permissions are checked on the server** for every route and action, in one place (`src/lib/authz.ts`). Hiding UI is not security. A user's permissions are the union of their roles (Requirements 3.6). The System Administrator can **read everything** but cannot perform money actions without the matching role.
5. **No file uploads** except receipts on expense claims (6B.9), optional attachments on purchase requests (a quote, invoice or photo; docs/decisions.md 2026-10-17) and the admin's logo (FR-30). Reject multipart bodies everywhere else.
6. **Nothing is deleted** that holds financial history. Void, supersede or version it. Audit every change (FR-22).
7. **Emails go through the outbox.** Write an `email_outbox` row in the same transaction as the business change, and send after commit. Never send inside the transaction, and never block the action on email success.
8. **Status changes go through one state machine per entity** (`src/domain/*/status.ts`). Reject invalid transitions on the server.
9. **English (Canada) only.** Use `en-CA` formatting and keep all UI copy in `src/copy/`.
10. **Never put secrets in code.** Use environment variables only.
11. **One application.** There is one Next.js app, one sign-in and one session for all roles. Don't build separate portals. Home (`/`) renders My tasks from `src/domain/tasks/` (FR-37), which queries pending actions across all of the user's roles.

## Stack (all free tier)

| Concern | Choice |
|---|---|
| App | Next.js (App Router) + TypeScript (strict) |
| UI | Tailwind CSS with design tokens from DRD 3.2 as CSS variables, shadcn/ui (Radix), Lucide icons, Inter font (self-hosted) |
| Forms and validation | React Hook Form + Zod; the Zod schemas are shared by client and server |
| Database | Neon Postgres (free) with the Drizzle ORM and Drizzle migrations |
| Auth | Auth.js (NextAuth v5): custom OAuth provider for Planning Center + emailed-code sign-in for the Church Administrator and System Administrators. No Google sign-in (docs/decisions.md, 2026-10-15) |
| Planning Center | People API, called server-side with the church's Personal Access Token |
| Email | Resend (REST API via `fetch`, the church's existing account) behind an `EmailSender` interface; a fake sender in tests |
| Reminder texts | Twilio pay-as-you-go (REST via `fetch`) behind an `SmsSender` interface, `src/lib/sms/`; the one approved paid exception to constraint 1 (docs/decisions.md 2026-10-18) |
| Files (receipts, logo) | Cloudflare R2 (S3 API), private bucket, signed URLs |
| Excel | ExcelJS, server-side |
| Hosting | Netlify free (Next.js runtime) |
| Scheduled jobs | GitHub Actions cron every 15 min, calling `POST /api/jobs/<name>` with `Authorization: Bearer $JOBS_SECRET` |
| Backups | Nightly GitHub Action: `pg_dump` → encrypted → upload to a church Google Drive folder |
| Tests | Vitest (unit and integration), Playwright (end-to-end) using Chromium; axe-core for accessibility |
| Quality | ESLint, Prettier, `tsc --noEmit`, and GitHub Actions CI on every PR |

## Project structure

```
src/
  app/                  # routes: (auth), annual/, expenses/, spending/, admin/, api/
  components/           # shared components (DRD section 10); FinancialSummary has 3 variants
  domain/
    annual/             # Part A: service, status machine, rules
    expenses/           # Part B: service, status machine, two-level approval, payments
    spending/           # budget vs actual, entries, amendments
    tasks/              # My tasks: aggregates pending actions across roles (FR-37)
    analytics/          # Analytics & Audit dashboard queries, role-scoped (FR-52)
    departments/ users/ cycles/ settings/
  lib/
    money.ts            # cents math, tax forward & inclusive, formatting (en-CA CAD)
    authz.ts            # role and department checks, used by every action
    audit.ts            # writeAudit(tx, event)
    email/              # outbox, templates (shared layout), senders (resend, fake)
    pco.ts              # Planning Center client: leader verification + team mapping (FR-39), read-only
    excel/              # workbook builders + formula-injection guard
    storage.ts          # R2 signed upload/download
  db/schema.ts          # Drizzle schema = Requirements section 9 + 6B.10
  copy/                 # all UI text
tests/ (unit, integration, e2e)
docs/  (specs, decisions.md)
.github/workflows/ (ci.yml, jobs.yml, backup.yml)
```

## Money and tax (Requirements FR-07, FR-07a, FR-16)

Implement these first, with exhaustive unit tests.

```ts
lineTotal(qty, unitPriceCents)            // qty × price, integer cents
taxForward(subtotalCents, rate)           // round half-up(subtotal × rate)
totalForward(subtotal, rate)              // { subtotal, tax, total }
splitInclusive(totalCents, rate)          // subtotal = round half-up(total / (1+rate)); tax = total − subtotal
formatCAD(cents)                          // "$1,148.00" (en-CA)
```

- Store the rate as a string decimal (`"0.1200"`) and do the arithmetic with integer or BigInt math, or decimal.js. Never use float.
- Required test values: $30,000.00 → tax $3,600.00 → $33,600.00; $1,025.00 → $123.00 → $1,148.00; $10.04 → $1.20; inclusive $30,000.00 → $26,785.71 + $3,214.29; inclusive $500.00 → $446.43 + $53.57.
- The tax rate is snapshotted on each annual request and expense at submission.

## Build order (Requirements section 15)

Work stage by stage. A stage is done when its ACs pass in CI.

1. **Stage 1: Annual Budget MVP**
   1. Repo, CI, design tokens, one-app layout shell with area navigation and the Home/My tasks page (DRD 6.0, FR-37), light/dark/system theme.
   2. `money.ts`, `authz.ts`, `audit.ts` and the DB schema for Part A.
   3. Auth: Planning Center, account linking, Group Leader check, access-denied variants (FR-01, FR-01a, DRD 6.1a). (Google was removed later; see docs/decisions.md.)
   4. Admin: users and roles, departments (with Proposed, Primary and Backup requester, FR-38), cycles, settings (tax, Planning Center).
   5. Annual budget form: details → items with sticky summary → preview → confirm; drafts and autosave; 2 edits; shared department requests (FR-03 to FR-12, FR-32).
   6. Accountant dashboard and review: approve as requested, approve a different amount (inclusive), line changes, clarification, decline (FR-13 to FR-18).
   7. Email outbox + Resend sender + Part A templates (FR-19, FR-21). Excel exports (FR-20). Help and privacy pages (FR-36).
   8. Full activity log (FR-22 as extended) and the Activity tab of Analytics & Audit (FR-52); global search and breadcrumbs (DRD 6.0).
2. **Stage 2:** scheduled decision release (FR-19a), messages (FR-31), backup approver and Away (FR-33), FR-34, copy last year (FR-35), branding (FR-30), email preferences, Planning Center team mapping (FR-39), Analytics & Audit Overview and Access tabs (FR-52).
3. **Stage 3: Expenses** (6B, FR-40 to FR-51): purchase requests, claims and receipts (R2), budget strip, accountant → Board Chair approval, Ready to process, Record payment, expense emails and exports, auto spending entries.
4. **Stage 4: Spending** (FR-24 to FR-29): ledger, refunds and voids, budget vs actual dashboard, amendments (inclusive), alerts, requester panel, year-end lock, expense and spending analytics (FR-52).
5. **Stage 5:** hardening per Requirements section 15 Stage 5.

Open one PR per numbered step or per feature. Keep PRs small.

## Conventions

- **Server actions or route handlers** call domain services. Services take a `tx` and do this in order: authz check → validate (Zod) → state-machine check → write → audit → outbox. Everything happens in one transaction.
- **Idempotency:** every submit, approve and pay action takes an idempotency key (from the form) and is stored, so duplicate clicks are no-ops (FR-10).
- **Optimistic concurrency:** each editable row has a `version` column. Updates use `WHERE version = $expected`, and a conflict returns the DRD 11.2 message.
- **Reference numbers:** annual budgets use `IFC-{year}-{0001}` and expenses use `EXP-{year}-{0001}`, from a per-year sequence table.
- **Excel:** prefix cell text starting with `= + - @ \t \r` with `'`. Write numbers as numbers in CAD format.
- **Links:** accept only http/https, render with `rel="noopener noreferrer"` and `target="_blank"`, and show the domain.
- **Emails:** one shared layout. Each template has a subject, a plain-text version and an HTML version. Show the Subtotal / Sales tax / Total block whenever amounts appear. Links are authenticated app URLs with no data in query strings.
- **Planning Center:** cache the verification result on the user. Re-verify at sign-in and in the nightly job, and allow a 72-hour grace period if Planning Center is down (FR-01a).
- **Time zone:** store UTC and display in the church time zone setting (`church_timezone` in Settings, default `America/Winnipeg`; `APP_TIMEZONE` is the fallback).
- **Accessibility:** follow DRD section 9. Run axe in Playwright on every page, with no violations allowed.
- **Motion:** use CSS transitions with the DRD 5.2 tokens and respect `prefers-reduced-motion`.

## Testing

- Write unit tests for `money.ts`, the state machines and authz (role × action matrix from Requirements 3.6, including multi-role users, administrator read-only, and the Vice-Chair acting for the Chair).
- Write integration tests for the services against a test Postgres (a Neon branch or local Docker Postgres in CI).
- Write Playwright end-to-end tests for each stage's main flows. Name tests after their ACs (e.g. `AC-35 approve different amount inclusive`) so coverage can be traced.
- Stub email, R2 and Planning Center behind interfaces, and use fakes in tests.
- CI must pass lint, typecheck, unit, integration and e2e before merge.

## Environment variables (names only; values live in Netlify and GitHub secrets)

```
DATABASE_URL
DATABASE_URL_UNPOOLED                     # optional: Neon's direct connection, used by scripts/migrate.mjs
FIRST_ADMIN_EMAIL, FIRST_ADMIN_NAME       # the first System Administrator of an empty app; inert once one exists
AUTH_SECRET, AUTH_URL
PCO_CLIENT_ID, PCO_CLIENT_SECRET          # OAuth sign-in
PCO_APP_ID, PCO_PAT_SECRET                # server-side People API (Personal Access Token)
RESEND_API_KEY, RESEND_FROM               # email sending (From is on the church's verified domain)
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM   # reminder texts (the one paid service, docs/decisions.md 2026-10-18)
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
JOBS_SECRET
APP_TIMEZONE=America/Winnipeg
# GitHub Actions only (backup.yml)
BACKUP_AGE_RECIPIENT, GDRIVE_FOLDER_ID, GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN
```

See `docs/go-live-checklist.md` for where each value comes from. Note its warning on GitHub Actions minutes for the 15-minute jobs.

## Scheduled jobs (`.github/workflows/jobs.yml`, every 15 min unless noted)

- `send-outbox`: retries pending or failed emails with backoff.
- `release-decisions`: sends held annual decisions whose release time has passed (FR-19a).
- `reminders` (daily): deadline, unclaimed purchase, unprocessed payment and Board Chair reminders.
- `pco-verify` (nightly): re-checks requesters' Group Leader status and syncs Planning Center team mappings (FR-39).
- `backup` (nightly, `backup.yml`): database dump to Drive.

## Definition of done (every PR)

- [ ] It implements the referenced FRs and matches the DRD screen.
- [ ] The relevant ACs have passing tests.
- [ ] Authz is checked on the server, the action is audited, and emails go through the outbox.
- [ ] There's no float money and no client-trusted totals.
- [ ] Loading, empty, error and permission-denied states are present (DRD 11).
- [ ] It works at 360 px and 1440 px, by keyboard, and with axe clean.
- [ ] Any spec deviation is noted in `docs/decisions.md`.
