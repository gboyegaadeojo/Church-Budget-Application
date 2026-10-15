# Decisions and deviations

Record any choice the specs leave open, and any deviation from them.

## Stage 1, step 1

- **Temporary preview user.** Sign-in arrives in step 3. Until then `src/lib/viewer.ts` returns a sample person with every role (or the roles in `PREVIEW_ROLES`), and the app shows a "Preview" banner. *Removed in step 3, along with the banner.*
- **Theme preference** is stored in the browser (next-themes) until accounts exist; DRD 3.3 asks for it in the account, which comes with sign-in.
- **Next.js 16 with Cache Components** (the scaffold default). Anything that reads the session must sit behind a `<Suspense>` boundary. See `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`.

- **One placeholder route per navigation link** (`src/components/coming-soon.tsx`), not a catch-all. With Cache Components a catch-all streams its shell before it can call `notFound()`, so unknown paths returned 200. Separate files keep unknown paths a real 404. A unit test checks that every navigation link has a page. Each feature replaces its placeholder file.
- **Account and More menus are non-modal** (`modal={false}`). In modal mode Radix marks the page `aria-hidden` while its links stay focusable, which fails axe (`aria-hidden-focus`). Escape, outside click and focus return still work.
- **`playwright-core` override.** `@axe-core/playwright` pulls a newer `playwright-core` whose `Page` type doesn't match `@playwright/test` 1.56.1. An npm override pins it to the same version.
- **Analytics & Audit (FR-52, docs v3.3)** is in the Reports navigation for every role from now on, and read-only for the Board Chair and Vice-Chair (Requirements 3.6). The page itself arrives in step 8 (Activity tab) and Stage 2 (Overview, Access). Global search and breadcrumbs (DRD 6.0, v3.3) are also step 8.
- **CI** runs format, lint, typecheck, unit and end-to-end with axe. The integration job was added in step 2.

## Stage 1, step 2

### Money

- **Integer quantities only** (FR-06 allows fractional quantities only if the rules say so, and they don't). The limits are 1 to 10,000 per line and a unit price of at most $1,000,000.00 (Requirements 11, rule 26). The database enforces the same limits.
- **Rounding for negative amounts** is half away from zero, so −$500.00 splits into exactly the negative of +$500.00. Only amendments and adjustments can be negative.
- **The tax rate** is held as ten-thousandths in BigInt, parsed from its exact string ("0.1200"), and never becomes a float. `tsconfig` targets ES2020 for BigInt literals. Next.js compiles with SWC, so only type checking changes.

### Authorization (`src/lib/authz.ts`)

- **Role names** stay as in code (`church_admin`, `vice_chair`, `system_admin`, `backup_approver`), not the suggested names in 9.2. `backup_approver` is the backup accountant (FR-33) and has the accountant's permissions.
- **Conflict of interest covers every decision.** An accountant can't approve, adjust, return, decline or reopen for a department they represent (FR-33 lists approve, decline and adjust; return and reopen are decisions too). Nobody approves or pays an expense whose payee is themselves. If the department is unknown, the decision is refused.
- **Accountants see submitted requests, not drafts.** The dashboard can still show "Draft exists" (FR-14). Draft contents stay with the department until submitted. The System Administrator reads drafts too (3.6).
- **The Board Chair and Church Administrator read approved annual budgets only** (3.6), and the board reads only the expenses sent to them.
- **Effective roles.** `authorize` trusts the roles it is given. From step 3 the session layer removes the requester role from anyone suspended or inactive (FR-01a), and routes write an `access.denied` audit event when `assertCan` throws.

### Status machine (`src/domain/annual/status.ts`)

- **Revising while In Review is allowed** and moves the request to Updated. FR-12 blocks edits only after approval or decline.
- **Only approved requests close.** Closed means an approved budget whose year ended. Declined requests stay Declined.
- **A rejected proposed department sends the request back to Draft** (FR-03).

### Database

- **One driver everywhere:** node-postgres (`pg`), which works with Neon's connection string, Docker or PGlite in tests. Services take a `Tx` typed against Drizzle's base Postgres class, so any driver fits.
- **Integration tests** use a throwaway database per test file on `TEST_DATABASE_URL` (Postgres 17 service in CI), or in-process PGlite locally when it's not set. No local Postgres install is needed.
- **Append-only history** is enforced with triggers, which hold whichever database role connects (on Neon the app's role may own the tables, so grants alone wouldn't). The triggers cover audit events, request revisions, approved lines and adjustments. Approval decisions also accept one change: setting `released_at` once for a held decision (FR-19a).
- **Database checks repeat the money rules:** totals equal subtotal plus tax, line totals equal quantity × price, a submitted request has its rate, amounts and reference, and an approval has amounts and a method. A reason is required for returns, declines, reopens and different-amount approvals.
- **One request per department per cycle**, with a unique key. FR-04's "explicitly supported exception" isn't built; add it if the church asks.
- **One cycle per budget year.**
- **Reference numbers:** the counter is a row updated inside the submitting transaction, so a rollback gives the number back and numbers have no gaps. (The format changed after this step; see below.)

## Reference number format (2026-10-15)

- **Annual budgets use `IFC-{year}-{0001}`** (e.g. `IFC-2027-0007`), with no department code. The church asked for this. The earlier `IFC-{year}-MEDIA-{0001}` came from when the app was for the Media team only, and was misleading on other departments' budgets. Expenses keep `EXP-{year}-{0001}`. Updated in the code, tests, CLAUDE.md, the requirements, the DRD and the user manual. Nothing had been issued yet, so no data changes.
- **Department names** are unique regardless of case among non-rejected departments. A merged proposal becomes `rejected` with `merged_into_department_id` set.
- **Settings** are text key/value rows so rates stay exact. The migration seeds the 9.6 and 20.2 defaults. The time zone stays in `APP_TIMEZONE`, not in settings.
- **Not in this step:** `email_outbox` (step 7), idempotency keys (step 5, with the first submit action), messages and preferences (Stage 2), Part B and spending tables (Stages 3 and 4), and Auth.js tables (step 3).

## Stage 1, step 3

### Group Leader field: "Ministry Leader" = "Yes" (2026-10-15)

- **The church's field is "Ministry Leader", a Yes/No field, and "Yes" is the only accepted value.** This replaces the specs' example "Ministry Role" = "Group Leader". The README, requirements (FR-01a, AC-7, 20.1), go-live checklist and user manual are updated.
- **It is a setting, not code.** The defaults are seeded into `app_settings` (`pco_leader_field_name`, `pco_leader_accepted_values`) by migration `0002`, and repeated in `src/domain/settings`. The administrator changes them in Settings → Planning Center (step 4). A test signs in with a different field and value to prove nothing is hard-coded.
- **How Planning Center returns a Yes/No value isn't documented.** Its API reference describes every custom field value only as a string, and its help pages say Yes/No fields accept "Yes/No" and "True/False" in any case. So for a field whose `data_type` is `boolean`, the app compares by meaning: "Yes", "yes", "true", "1", "checked" and "on" all mean yes, and an accepted "Yes" matches any of them. Other field types compare as text, ignoring case. The raw value is stored on the user (`pco_field_value_snapshot`), so the first real sign-in shows exactly what Planning Center sent. **Confirm with one real person once the token exists** (the setup guide gives the command).

### Email sign-in (FR-01b): moved to step 7

- **Not built in this step.** A development sender that prints codes to the terminal would be throwaway code. FR-01b also needs the outbox (CLAUDE.md rule 7: codes go through it, sent straight after commit), an authenticator-app (TOTP) step with recovery codes for staff, and rate limits. All of those belong with real email in step 7. Fake Google and Planning Center sign-in already cover local testing. Until step 7, staff sign in with Google (any address can be a Google account) or Planning Center. The sign-in screen doesn't show "Continue with email" yet.

### Sign-in and accounts

- **Auth.js v5 (`next-auth@5.0.0-beta.32`, pinned).** This is the version that supports Next.js 16. It is still labelled beta.
- **JWT sessions, no Auth.js tables.** The session is Auth.js's encrypted cookie holding only our `users.id`. Roles, departments and status are read from the database on every request, so deactivation, role changes and Planning Center suspension apply immediately (FR-02), not when the session expires. Sessions last 12 hours and refresh hourly while in use.
- **Planning Center sign-in uses OpenID Connect** (Planning Center supports it: scopes `openid people`, with PKCE, state and nonce). Auth.js validates the ID token's issuer, audience, signature and expiry (10.1). The token's `sub` is the Planning Center person id. Sign-ins whose `organization_id` isn't the church's organization (read with the access token) are refused, so leaders from other churches can't sign in.
- **Account linking is one-directional, for safety.** A Google sign-in links to an existing account by its Google-verified email, and also links that person's Planning Center record when exactly one Planning Center person has that email (FR-01a). A Planning Center sign-in links only by Planning Center person id, never by email. People can edit the emails on their own Planning Center profile, so email linking would let someone take over an account (for example the accountant's) by adding that email to their profile. An unlinked Planning Center sign-in for an email that already has an account gets the new "Sign in with Google first" screen (`link-required`), so the person signs in once with Google, or the administrator links them. AC-6 still holds: after one Google sign-in, both reach the same account.
- **New people:** only a verified Group Leader can create an account by signing in. They get the requester role and wait for a department (the "waiting" screen). Everyone else needs an account the administrator created. When "Require for requesters" is off, nobody joins by themselves.
- **Several Planning Center people sharing one email** (common for families) count as "not found", because the app can't tell which one signed in.
- **Suspension** keeps every other role. An accountant who is also a requester and loses the field keeps accountant access. Drafts and history are untouched. The emails to the administrator and accountant (FR-01a, AC-9) wait for the outbox in step 7, and the audit events are written now.
- **72-hour rule:** someone verified within 72 hours gets in while Planning Center is down (`access.pco_unavailable` is audited with `usingGracePeriod`). After that, they see "We can't reach Planning Center". A missing token, bad credentials, or the configured field not existing all count as Planning Center being unavailable.
- **Access-denied screens** use the DRD 6.1a variants plus `link-required`. The email that was used reaches the screen in a 10-minute httpOnly cookie scoped to `/access-denied`, never in the URL. An unknown reason shows "Page not found" with `noindex`, but the status is 200 for the same streaming reason as in step 1.
- **The proxy checks only that a session cookie exists.** Auth.js's proxy wrapper re-sets the session cookie on every request, which put the session back right after sign-out. Real validation happens on every page (`getViewer`) and action (`authz.ts`).
- **Audited:** successful and failed sign-ins (method, reason, and a keyed hash of the client address), sign-outs, identity links, and leader granted, suspended or restored. Session expiry isn't detectable with cookie sessions, so it isn't logged.
- **Privacy page:** it's still behind sign-in until step 7 builds Help and Privacy (FR-36). The sign-in screen carries the short privacy note from DRD 6.1.

### Tests and local development without credentials

- **Fake sign-in** is an Auth.js credentials provider that signs in as preset Google or Planning Center identities (`tests/fixtures/fake-identities.json`), with a fake Planning Center directory (`tests/fixtures/pco-directory.json`). It runs through the same `resolveSignIn` as real sign-in. It turns on only with `AUTH_FAKE_PROVIDERS=1` and an `AUTH_URL` on localhost, and never on Netlify (`NETLIFY` or `CONTEXT` set). Unit tests cover that guard.
- **`scripts/fake-server.mjs`** runs the app against an in-process PGlite database served over the Postgres protocol (`@electric-sql/pglite-socket`), migrated and seeded with the 18 departments and the test people. Playwright uses it in CI and locally, and `npm run dev:fake` uses it for trying the app. It runs with one database connection, because PGlite is single-connection.
- **The nightly job** (`POST /api/jobs/pco-verify`, `.github/workflows/jobs.yml` at 03:15 Pacific) does nothing until `APP_URL` and `JOBS_SECRET` are set as GitHub secrets.
