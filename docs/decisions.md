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

- **Department names** are unique regardless of case among non-rejected departments. A merged proposal becomes `rejected` with `merged_into_department_id` set.
- **Settings** are text key/value rows so rates stay exact. The migration seeds the 9.6 and 20.2 defaults. The time zone stays in `APP_TIMEZONE`, not in settings. *(Superseded: see "Church time zone" below.)*
- **Not in this step:** `email_outbox` (step 7), idempotency keys (step 5, with the first submit action), messages and preferences (Stage 2), Part B and spending tables (Stages 3 and 4), and Auth.js tables (step 3).

## Reference number format (2026-10-15)

- **Annual budgets use `IFC-{year}-{0001}`** (e.g. `IFC-2027-0007`), with no department code. The church asked for this. The earlier `IFC-{year}-MEDIA-{0001}` came from when the app was for the Media team only, and was misleading on other departments' budgets. Expenses keep `EXP-{year}-{0001}`. Updated in the code, tests, CLAUDE.md, the requirements, the DRD and the user manual. Nothing had been issued yet, so no data changes.

## Stage 1, step 3

### Group Leader field: "Ministry Leader" = "Yes" (2026-10-15)

- **The church's field is "Ministry Leader", a Yes/No field, and "Yes" is the only accepted value.** This replaces the specs' example "Ministry Role" = "Group Leader". The README, requirements (FR-01a, AC-7, 20.1), go-live checklist and user manual are updated.
- **It is a setting, not code.** The defaults are seeded into `app_settings` (`pco_leader_field_name`, `pco_leader_accepted_values`) by migration `0002`, and repeated in `src/domain/settings`. The administrator changes them in Settings → Planning Center (step 4). A test signs in with a different field and value to prove nothing is hard-coded.
- **How Planning Center returns a Yes/No value isn't documented.** Its API reference describes every custom field value only as a string, and its help pages say Yes/No fields accept "Yes/No" and "True/False" in any case. So for a field whose `data_type` is `boolean`, the app compares by meaning: "Yes", "yes", "true", "1", "checked" and "on" all mean yes, and an accepted "Yes" matches any of them. Other field types compare as text, ignoring case. The raw value is stored on the user (`pco_field_value_snapshot`), so the first real sign-in shows exactly what Planning Center sent. **Confirm with one real person once the token exists** (the setup guide gives the command).

### Email sign-in (FR-01b): moved to step 7

- **Not built in this step.** A development sender that prints codes to the terminal would be throwaway code. FR-01b also needs the outbox (CLAUDE.md rule 7: codes go through it, sent straight after commit) and rate limits. (The authenticator-app step for staff was later dropped; see "No two-step verification requirement".) All of those belong with real email in step 7. Fake Google and Planning Center sign-in already cover local testing. Until step 7, staff sign in with Google (any address can be a Google account) or Planning Center. The sign-in screen doesn't show "Continue with email" yet.

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
- **The nightly job** (`POST /api/jobs/pco-verify`, `.github/workflows/jobs.yml` at 03:15 Winnipeg time) does nothing until `APP_URL` and `JOBS_SECRET` are set as GitHub secrets.

## Church time zone: America/Winnipeg (2026-10-15)

- **The church is in Winnipeg, so the default time zone is `America/Winnipeg`** (Central: UTC−6 in winter, UTC−5 in summer). It replaces the specs' `America/Vancouver` in CLAUDE.md, `.env.example`, the requirements (FR-19a, AC-18 is now "9:15 a.m. church time"), the go-live checklist and the Playwright tests.
- **It is now a real setting, as the requirements intend** (Settings lists the time zone). The `church_timezone` row is seeded with `America/Winnipeg` by migration `0003`, and the administrator can change it in Admin → Settings (step 4). `getChurchTimeZone()` reads it. If the stored value isn't a valid zone, it falls back to `APP_TIMEZONE`, then to `America/Winnipeg`, so dates always render. Times are still stored in UTC.
- **The nightly Planning Center check runs at 08:15 UTC.** That is 03:15 in Winnipeg in summer and 02:15 in winter, because GitHub's cron is UTC only.

## Neon setup (2026-10-15)

- **Region: AWS US East (Ohio)**, to match Netlify's default server region, so the database sits next to the app rather than next to the church. Every page queries the database, so this matters more than distance to users.
- **Compute autoscaling maximum: 0.25 CU**, so the free plan's monthly compute hours aren't used up by a larger compute size. Both are in the go-live checklist.

## Stage 1, step 4

- **Settings → Planning Center shows the connection status, not a "last sync" time.** The page checks the connection live with the church's token. A last-sync time comes when the nightly `pco-verify` job records one. Planning Center team mapping (FR-39) is Stage 2.
- **The custom-field picker** lists Planning Center's People fields when it can reach Planning Center. Otherwise it falls back to a text box, so the setting can still be changed during an outage.
- **"Test a person"** sends the Save form's current values to a separate action, so it tests the field and values as typed, before they're saved (AC-11). It runs outside a form submission, because React 19 resets a form after a form action and would wipe the unsaved changes. It looks up personal information, so every test is audited.

## Stage 1, step 5a: annual request services

- **Drafts use the tax rate in Settings**, not the cycle's `default_tax_rate`. FR-07a says the administrator's rate applies to drafts and new submissions, and it is snapshotted on the request at submission (AC-34). Drafts store no amounts; totals are calculated when the draft is shown.
- **Drafts may hold unfinished lines.** Autosave never fails because a row is half-typed: an empty quantity counts as 1, an empty price as $0.00, and fully blank rows are dropped. Anything typed must still be valid (a quantity of 0, a negative price or a non-http link is refused). Submission adds the rest: a title, a justification, at least one item, item names, and a note on any $0.00 item (rule 8).
- **Deleting a draft (FR-05).** Only a draft that was never submitted can be deleted. It is audited first, with its content. Draft events (started, saved, deleted) name the request in `entity_id` but leave the `budget_request_id` link empty, because that foreign key would block the deletion. From submission on, events are linked and the request can never be deleted. A request sent back to Draft because its proposed department was rejected keeps its history and can't be deleted.
- **Picking a department on the form (FR-03, FR-38).** Picking a department joins the person as its Primary if it has none, otherwise as a Representative (`source = form_pick`, audited). Only verified Group Leaders may join while the Planning Center check is on. Typing a name that already exists, in any case, reuses that department; a new name creates a Proposed department. If the department already has a request this cycle, the person is sent to it, so there is still one request per department per cycle.
- **Proposed departments can submit.** "Only active departments take new submissions" is read as excluding inactive departments. A request for a Proposed department can be submitted and is labelled until the administrator decides (FR-03); the accountant can't decide it until then (step 6).
- **A revision with no changes is refused** and uses no edit (FR-12: only a confirmed change uses one). Answering a clarification may have no changes and never uses an edit (AC-42).
- **Deadline.** Submission is refused after the department's deadline (its extension if any, otherwise the cycle's). Revisions after the deadline are allowed, because they are limited by the two edits and the accountant may ask for changes.
- **Idempotency keys** (`idempotency_keys`, migration `0006`) belong to one person and one action. A repeat returns the stored first result; a key reused by someone else, or for another action, is refused.
- **Emails are deferred to step 7.** The receipt, the accountant notice, the revision notice and the administrator's "someone joined" or "new department proposed" emails are marked `TODO(step 7)` where the outbox row will be written.

## Stage 1, step 5b: annual form screens (2026-10-15)

- **Department step on its own page.** DRD 6.3 puts the department in step 1 with the title and justification. Choosing the department creates or opens the request (FR-03, FR-32), so it comes first at `/annual/new`; the editor's step 1 holds the title and justification, under the same progress indicator.
- **Preview is a step in the editor, not a separate page.** Values stay in the form between steps (DRD 6.3 "Preserve entered values"). For a draft, the preview first saves, then shows the server's totals; submitting sends only the id, version and idempotency key, so what is submitted is exactly what was saved. For a revision or a clarification response, the preview shows the figures calculated with the same `money.ts` code at the request's snapshotted rate, and the server recalculates on confirm.
- **One idempotency key per preview.** A double click or a retry from the same preview sends the same key (FR-10, AC-38); going back and previewing again makes a new one.
- **Reorder with Move up / Move down only.** DRD 6.3 asks for a drag handle as well; menu items cover keyboard and touch without a drag-and-drop library. A drag handle can be added later.
- **Items as a list, not boxes (after user testing).** One row per item (Item | Qty | Unit price | Line total), column headings on wider screens, two columns on a phone; link and notes behind a per-item toggle (open when they hold something or have an error); Move up, Move down and Remove in one ⋯ menu per item.
- **Save and exit.** Drafts autosave, but people asked for an explicit way out: it saves now and returns to the dashboard with "Draft saved". Editing a submitted request has **Discard changes** instead, because nothing is saved (and no edit used) until it is confirmed.
- **One budget per department, in the screens too.** The database and `startRequest` already allowed only one request per department per cycle (rule 1); the dashboard now shows each department's budget with its next step and offers **Submit** only for a department without one, and the picker marks departments that have one.
- **Every save refreshes the request's pages.** Saves, submissions, revisions and deletions revalidate `/annual`, `/annual/[id]` and `/annual/[id]/edit`; without the last, the browser could reopen the edit form from an earlier, empty visit.
- **Drafts are shared with the department's other representatives.** DRD 7.1 says a draft is "Only you can see it", but FR-32 makes the request the department's; the status text reads "Your department's leaders can see it".
- **Leaders waiting for a department may open the form.** FR-01a's waiting screen stays for every other page; while a cycle is open it links to `/annual/new`, where picking a department makes them its representative (FR-38). The app shell loads the viewer once per request either way.
- **Unsaved values on this device.** Every change is kept in `localStorage` with the version it was based on; it is offered back only if the request hasn't changed since, and removed once saved (DRD 11.1). Leaving with unsaved changes asks first.
- **Not yet:** the Undo toast after removing an item (DRD 5.6; removing a populated item already asks first), the session-expiry warning (DRD 11.1), **Start from last year's budget** (FR-35, Stage 2), the My department budget panel (6.2a, Stage 4) and recent activity (step 8). The confirmation says "We'll email your receipt shortly" until the outbox exists (step 7).

## Up to two ranked Backups per department (2026-10-15)

- **A department can have a Primary, Backup 1 and Backup 2** (FR-38, AC-116, AC-120 updated). Some departments run at two locations and have three people who request on their behalf. Representatives were already unlimited and can already request (FR-32); the second Backup adds a second person who covers and takes over.
- **Ranked, not equal.** If the Primary leaves, Backup 1 becomes Primary and Backup 2 moves up to Backup 1, so the order of takeover is always visible. Removing Backup 1 also moves Backup 2 up, and a lone Backup is always Backup 1.
- **Stored as `user_departments.backup_rank`** (1 or 2, only on Backup rows), with a unique index per department and rank and a check that ties rank to type (migration `0004_backup_ranks`, which makes existing Backups Backup 1). In code a leader's place is one "slot" (`src/domain/departments/slots.ts`).
- **Changing places:** giving someone a place that's taken makes its holder a Representative. When a leader moves into another leader's place, the two swap (for example, Make Backup 1 on Backup 2).
- **Escalations and Away (Stage 2, FR-33, FR-38)** go to both Backups.

## Several accountants and cheque signers, set up in Admin now (2026-10-15)

- **Several accountants, one Primary (FR-33 as written).** Any number of people can hold the Accountant or Backup approver role. The administrator picks the Primary accountant in Admin → Settings → Accountants; everyone else is a backup approver. It's stored as the `primary_accountant_user_id` setting, version-checked and audited like other settings. If that person loses the Accountant role or is deactivated, the setting is cleared automatically (audited as `admin.primary_accountant_cleared`) and the page warns until a new Primary is chosen. Away and email routing still arrive with FR-33 (Stage 2) and the outbox (step 7).
- **Cheque signers are a list, not a role (FR-53).** The people who sign cheques are often board members or a treasurer who never use the app, so they don't need an account. The administrator keeps them in Admin → Settings → Signing authorities: name, optional email, active from, and (when removed) the date they stop plus an optional reason. `active_until` is the first day a signer may no longer sign.
- **Built now, used in Stage 3.** The list is ready before Record payment (6B.5), which will offer only active signers, require two different people on every cheque (AC-76, AC-135), and keep each signer's id and name snapshot on the payment.
- **Signers are never deleted.** A database trigger refuses DELETE on `signing_authorities` (migration `0005_signing_authorities`), so every past payment can still name who signed it.

## No two-step verification requirement (2026-10-15)

- **No role requires two-step verification.** This covers the accountant, backup approver, Board Chair, Vice-Chair, Church Administrator and System Administrator, at the church's request. It replaces Requirements 10.1's rule and the "I confirm this person has two-step verification" checkbox that Add staff and Roles required for staff roles.
- **What's left.** Google and Planning Center sign-ins use whatever protection those accounts have. Email-code sign-in (FR-01b, step 7) uses the emailed code only, with no authenticator-app (TOTP) step or recovery codes. AC-132 is updated to match. The "staff without two-step verification" card is removed from the Access dashboard.
- **The tradeoff.** A staff member's app access is only as strong as their own Google or Planning Center account, or their email inbox. Staff are encouraged, not required, to turn on two-step verification themselves. Money actions still need the matching role and are audited, and Planning Center leader checks are unchanged.
- **The church-owned Google account keeps its 2-Step Verification** (go-live checklist, item 1). It owns the hosting, database and backups, not app sign-in.

## Email: Resend only (2026-10-15)

- **Resend is the only email provider.** It replaces both the Gmail API (the spec's primary sender) and Brevo (the spec's fallback). The church already uses Resend for other applications, and Resend has no Gmail refresh token that can expire and silently stop email. It sits behind the `EmailSender` interface, with a fake sender in tests. Environment variables: `RESEND_API_KEY`, `RESEND_FROM`; the `GMAIL_*` variables are gone.
- **No second provider.** If Resend fails, emails stay in `email_outbox`, and the `send-outbox` job retries them with backoff. Failed emails appear in Admin → Notifications & Audit. Actions never wait on email (CLAUDE.md constraint 7), so an outage delays emails but loses nothing.
- **Free plan limits are shared.** Resend's free plan allows 3,000 emails a month, 100 a day and one verified domain, all shared with the church's other Resend apps. Normal use is a few hundred a month. A burst, such as opening a cycle or releasing every decision at once, could reach the daily cap. Emails over the cap are refused, stay in the outbox and go out the next day. Step 7 must treat Resend's rate-limit and quota answers as "retry later", not as permanent failures.
- **Emails come from the church domain.** Resend needs a verified domain, so the From address is something like `budget@<church-domain>`.
- **The backup job gets its own Google OAuth client** (`GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET`) instead of reusing the Gmail one.
- **Step 7 calls Resend's REST API with `fetch`**, adding no dependency. It sends the outbox row id as the `Idempotency-Key`, so a retry never sends an email twice.

## Navigation: calmer sidebar, area colours, tablet rail (2026-10-15)

After user feedback that the sidebar was busy (a person with several roles saw about 20 links in six identical grey groups):

- **Areas open one at a time.** On desktop each area with several pages is a button that opens its pages (an accordion); the area of the current page opens by itself, and opening another closes it. A closed area that holds the current page shows a dot. Areas with one page (Home, and Reports for most people) are a single link. Every page is still reachable, and `navigationFor(roles)` is unchanged; the server still checks every route.
- **Each area has a colour** (Home violet, Annual Budget blue, Expenses teal, Spending amber, Reports pink, Admin slate), added to the DRD 3.2 palette as `--area-*` tokens in light and dark. The colour marks the area's icon tile, its open panel, the guide line down its pages and the active page. `tests/unit/area-colours.test.ts` keeps every pairing at 4.5:1 or more in both themes. Colour is never the only signal: the current page also has `aria-current`, weight and a dot.
- **Tablets (768–1023 px) get an icon rail, not the bottom bar.** DRD 6.0 names only desktop (sidebar) and mobile (bottom bar). Below 768 px is the phone layout; from 768 px a 76 px rail of coloured area icons opens each area's pages in a flyout. From 1024 px the full sidebar shows, and collapsing it gives the same rail.
- **More on a phone opens a bottom sheet** (Radix Dialog, new free dependency `@radix-ui/react-dialog`) with the same accordion as the desktop sidebar, plus Help and Privacy, instead of a long dropdown.
- **Motion** follows DRD 5.5 tokens: groups open by animating height, pages fade in one after another, the chevron turns, the active tab's pill and the rail's bar grow in, and the sheet slides up. The global reduced-motion rule flattens all of it.

## Stage 1, step 6a: accountant review services (2026-10-15)

- **Opening a request starts the review without a version bump.** When an accountant who may decide opens a Submitted or Updated request, it becomes In Review (`annual.review_started` is audited). Its content is unchanged, so `version` stays and a representative editing at that moment isn't interrupted. A decision still checks the version, so the accountant can't decide on a version the department has since changed (DRD 11.2). A decision on a request that is still Submitted or Updated starts the review in the same transaction.
- **One calculation for approved figures** (`src/domain/annual/decision.ts`, `approvedFigures`), shared by the review screen's live summary and the server, which recalculates from the stored lines at the snapshotted rate. As requested: total forward. Different amount: the total entered is split inclusive (AC-35, AC-69), lines stay as requested, and the pre-tax gap is stored in `approval_adjustments` with the note (FR-16). Line changes: total forward on the approved lines.
- **Approval rules chosen:** an approved total must be more than $0.00 (to approve nothing, decline), and at most $100,000,000.00. Approving more than requested is allowed. Line changes must include every line once and change at least one; quantity 0 excludes an item (FR-15). A note is required to approve a different amount, approve with line changes, return or decline; per-line reasons are optional.
- **Approved history survives revisions.** Approved lines point at `budget_line_items`, which a revision used to delete and re-insert. A revision after a reopen now marks lines an approval points to as superseded (`superseded_at`, migration `0007`) instead of deleting them (CLAUDE.md rule 6); working lines leave superseded ones out.
- **Reopen** (FR-18a) sends an Approved or Declined request back to Returned for Clarification with a required reason, adds a `reopened` decision (earlier decisions stay), and clears the current approved amounts until the next decision. No edit is used.
- **Not yet:** second approval above a threshold (FR-34, Stage 2): every approval is final for now. Held release (FR-19a, Stage 2): each decision's `released_at` is the decision time. The reopen warning for approved expenses (FR-18a) waits for expenses (Stage 3). Decision emails wait for the outbox (step 7, marked `TODO(step 7)`).
- **Dashboard** (`getReviewDashboard`, permission `annual.review`: accountants act, the System Administrator reads): expected departments are the active ones plus any other department with a submitted request in the cycle. Drafts show only as "Draft exists" and never reach the queue (AC-48). The queue lists Updated first, then other requests awaiting review, returned, then decided, oldest first, filtered by status group, department and search.

## Planning Center "Ministry Department" field (2026-10-15)

Requested by the user: a second People custom field, **Ministry Department**, decides which departments a leader can budget for. This is the People-field part of FR-39, built before Stage 2, on the FR-39 columns already in `departments`.

- **Settings → Planning Center → Ministry Department:** the field name (default "Ministry Department") and a mode, stored as `pco_department_field_name` and `pco_department_mode`. Defaults apply when no row exists, so no seed migration is needed.
  - **Off:** the field is ignored.
  - **Suggest** (default): leaders are added to the departments their field names, and the form lists those first; other departments and **Other** stay available.
  - **Restrict:** the form lists, and the server allows, only the departments the field names plus links the administrator or the form made earlier (minus any marked no longer listed). **Other** is hidden and refused.
- **Matching:** a value matches a department's Planning Center value if the administrator set one (Admin → Departments → **Planning Center value**, stored as `pco_source_type = 'people_field_value'`), otherwise its name, ignoring case and spacing. A checkboxes field can name several departments. Two departments can't share a value.
- **When:** at each sign-in after a successful Group Leader check, and in the nightly `pco-verify` job, for people with the Requester role. The Group Leader field still decides **whether** someone is a leader; this field only decides **which** department.
- **Joining** follows FR-38: Primary if the department has none, otherwise Representative, with `source = 'pco_mapping'`. A new leader whose field names a department lands on Home instead of the waiting screen.
- **Nothing is removed automatically.** A Planning Center link whose department is no longer listed is marked **No longer listed in Planning Center** (`pco_status = 'no_longer_leader'`) and audited; the administrator removes it. If it comes back, it is confirmed again. Links made by the administrator or the form are never changed.
- **Outages:** the values last read are stored on the user (`pco_ministry_departments`, migration `0008`). If Planning Center is down or the field doesn't exist, nothing changes and the last known values stay in force (FR-01a).
- **Restrict and earlier picks:** a department a leader picked on the form while the mode was Suggest stays allowed after switching to Restrict, because they already represent it; the administrator can remove the link.
- **Not in e2e:** switching the shared mode to Restrict in a parallel browser test would affect every other test, so Restrict is covered by integration tests.

## Stage 1, step 6b: accountant dashboard and review screens (2026-10-15)

- **Routes:** `/annual/review` is the dashboard (FR-13, FR-14, DRD 6.6) and `/annual/review/[id]` the review screen (DRD 6.7). **All budgets** (`/annual/all`) is the same dashboard for the System Administrator, read-only (Requirements 3.5); the review screen shows "View only" instead of decision controls.
- **Opening starts the review from the browser, not during rendering.** The screen calls a server action when it mounts, so a prefetch or crawler never changes a status.
- **Decision controls are one choice list** in the DRD's order (approve as requested, a different amount, adjust items, return, decline), then **Review decision**, which validates in the browser with the shared Zod schema and opens a confirmation showing requested, approved and the difference. Each confirmation carries a fresh idempotency key. The live figures come from the same `approvedFigures` the server uses and update before a note is written.
- **The right-hand column isn't sticky**, because it is often taller than the screen; only the decision button bar sticks to the bottom on desktop. On a phone the order is details, summary, decision, then history.
- **The department sees decisions in the app now:** the request page shows the accountant's question, decline reason or approved amounts beside what was asked, and the edit form shows the question while they respond. Since step 7a they are also emailed.
- **My tasks** lists Submitted, Updated and In Review budgets in the open cycle for accountants and backup approvers, leaving out departments they represent (FR-33).
- **Not yet:** Excel export buttons (FR-20, step 7), the link to the Spending dashboard (Stage 4), the board-total allocation bar (DRD 6.7a, with cycle board totals), the held-decisions banner (FR-19a, Stage 2), and the "Updated since you last viewed" marker per accountant (the queue lists Updated requests first instead).

## Stage 1, step 7a: email outbox and annual budget emails (2026-10-15)

- **One `email_outbox` table is both the queue and the log** (Requirements 9.14 NotificationLog). Each row keeps the rendered subject, plain text and HTML, the recipient, the template, the attempts, the provider id and the last error, so a request's history shows exactly what was sent and when (FR-21, AC-58). Rows change status but can't be deleted (database trigger).
- **Queued in the business transaction, sent after commit** (CLAUDE.md constraint 7). Services call `queueAnnualEmails` after the change and its audit event. `runForResult` counts the emails an action queued and, once the transaction has committed, sends them with Next.js `after()`, so they usually leave within seconds. Sending never runs inside a business transaction, and its failure never undoes or blocks the action.
- **Retries:** temporary answers (rate limit, daily quota, outages, a wrong key or unverified domain) wait 1, 5 and 15 minutes, then 1, 3, 6 and 12 hours, then daily, honouring Retry-After; after 10 tries the email is marked failed. A refusal of the email itself (an invalid address) fails at once. Rows are claimed with `FOR UPDATE SKIP LOCKED` and the row id is Resend's Idempotency-Key, so the job and an action never send one email twice. A row left "sending" by a stopped server is retried after 10 minutes.
- **The 15-minute job runs as a Netlify Scheduled Function** (`netlify/functions/send-outbox.mts`, free plan), the go-live checklist's recommended choice: free GitHub Actions minutes can't cover a 15-minute schedule for a private repository. GitHub Actions also calls `/api/jobs/send-outbox` nightly as a backstop.
- **Who gets what** follows FR-21's "Request lifecycle" table: every representative of the department who can sign in (Primary, Backups, others), the Primary accountant (every accountant while none is chosen, so no submission goes unannounced), and Church Administrators for "new budget available". Submit, revise, clarification answer, review started, return, approve (all three methods), decline and reopen are covered. Accountant copies always go; per-person email preferences arrive in Stage 2.
- **The department's history shows only the emails sent to it**; the accountant's review screen shows all of them, copies included.
- **Without email configured** (no `RESEND_API_KEY` or `RESEND_FROM`), emails wait in the outbox and go once it is set up. Tests and local development use an in-memory fake sender.
- **Not in 7a:** the other FR-21 emails (cycle opened, closed and deadline changes, department and representative changes, access requests, role changes, Planning Center alerts, the delivery-failure digest) and the admin list of failed emails come in step 7b with the remaining `TODO(step 7)` markers; email-code sign-in (FR-01b) also needs this outbox and follows. Held release (FR-19a), second approval (FR-34), messages (FR-31), Away routing (FR-33), preferences and the accountant's daily digest are Stage 2.

## Stage 1, step 7b: the remaining Stage 1 emails (2026-10-15)

- **Every `TODO(step 7)` is now an email**, built on the 7a outbox and layout:
  - **Departments (FR-03, FR-38):** a leader joining or proposing a department (to administrators); a proposal added, merged or rejected (to the proposer and its leaders); a person assigned to or removed from a department; Backup 1 becoming Primary (to administrators and the new Primary).
  - **Cycles (FR-21, 4.3):** opened, closed and reopened (to every active department's representatives); a deadline change (only to departments still to submit and without a later extension); an extension (to that department).
  - **Access (FR-01a, FR-21 System):** new staff and role changes (to the person); a new leader waiting for a department, a suspended leader (AC-9, also to the accountant), a Planning Center outage, the Primary accountant being cleared, and access requests (to administrators).
- **"Administrators" means everyone with the System Administrator role.**
- **The daily `reminders` job** (`POST /api/jobs/reminders`, nightly in `jobs.yml`) sends the 7-day and 1-day deadline reminders to departments still to submit, using each department's own deadline (4.3), counted in calendar days in the church time zone. Once the cycle deadline passes, it sends the accountant the list of outstanding departments, and it sends the administrators' digest of failed emails (FR-21). Running it twice in a day, or missing a day, sends nothing twice.
- **`dedupe_key` on the outbox** (migration 0010) makes an email go once per key and address: reminders are keyed by department, deadline and day count (a new deadline gets new reminders); the outstanding list by the deadline; the digest and the Planning Center outage notice by date.
- **Access requests are limited:** once a day per address, and at most 10 a day per administrator overall. Anyone with a Google or Planning Center account can try to sign in, so without a limit a stranger could use up the church's shared Resend quota. A refusal because Planning Center is down isn't an access request.
- **Sign-in and the Planning Center job send their emails straight away** like actions do (`after()` and a direct outbox run), instead of waiting for the next scheduled run.
- **Not yet:** email-code sign-in (FR-01b) follows.

## Admin → Notifications & Audit: the email log (2026-10-15)

- **`/admin/audit` is the email log for now** (FR-21 "Log attempted notifications, provider outcomes, and failures"): counts by status, a status filter and a search over subject, address and name, the newest 100 emails with their tries, last error and times, and a link to the request.
- **Send again** puts a failed email back in the queue with a fresh set of retries; **Send all failed again** does that for every failed email, for after a Resend setting is fixed. Only failed emails can be sent again: a sent one never goes twice, and a waiting one is already queued. Each use is audited (`admin.emails_retried`). The permission is `admin.notifications`, System Administrator only.
- **The activity log** (FR-22, FR-52 Activity tab) is step 8, under Reports → Analytics & Audit; the page says so.
- **Navigation fix found while testing:** an area's pages became visible one frame after the group opened, so a very quick Tab after Enter skipped them (an intermittent e2e failure). The visibility transition now runs only when a group closes.

## Stage 1, step 7c: sign-in with an emailed code (2026-10-15)

- **Only the Church Administrator and System Administrators can use it (user decision).** FR-01b offers it to all staff. The church wants as few sign-in options as possible: everyone else is in the church's Planning Center and signs in there. The people who may not be church members are the Church Administrator and the System Administrators, so only accounts with one of those roles are emailed a code (`EMAIL_SIGN_IN_ROLES` in `src/lib/roles.ts`), and `resolveSignIn` refuses email sign-in for anyone else as a second check. AC-132 is tested with a Church Administrator at an outlook.com address instead of an accountant. Removing Google sign-in follows in the next PR.
- **Same answer for every address (AC-133).** Every request writes an `email_login_codes` row, including addresses with no account or the wrong role, and counts towards the same limits; only allowed accounts get an email. So neither the message, the limits nor the wrong-code count reveals who has access. The administrator can see in the audit log whether a code was sent (`access.sign_in_code_requested`, `sent`).
- **Limits.** 5 codes per address in any rolling hour (the message says when the next is allowed), and 20 per network (keyed hash of the address) per hour, so one visitor can't fill the table. 5 wrong codes on a code lock the address for 15 minutes: no codes are checked or sent until then. Only the newest code counts, so asking again replaces the old one. A code works once, for 10 minutes.
- **The code is never stored readable for long.** `email_login_codes` holds an HMAC of the code keyed with `AUTH_SECRET`, so a database copy can't be used to find codes. The outbox row has to hold the email itself until it goes, so outbox rows can now be `sensitive` with an `expires_at`: once sent, failed or expired the body is replaced with a placeholder, an expired one is never sent, and the email log offers no Send again for it. The code isn't in the subject, which the email log shows.
- **Sent straight after commit**, like other action emails, but only that email (`sendOutboxAfterResponse({ ids })`), so a code never waits behind a backlog.
- **How it signs in.** An Auth.js Credentials provider (`email-code`) checks the code in its own transaction, so a wrong try is counted even though the sign-in fails, then hands the proved address to the same `resolveSignIn` as the other methods (audit, deactivation and roles all apply). A wrong, expired or locked code comes back to the form as a `CredentialsSignin` error with the reason, and the Auth.js logger stays quiet about it.
- **Settings → Sign-in → "Allow email sign-in"** (on by default, migration 0011). At least one method must stay on. The button only shows when email sending is configured, since otherwise codes would wait unsent.
- **Testing.** End-to-end tests read the code from `GET /api/test/emails?to=…`, which lists what the in-memory fake sender sent. It answers 404 unless fake sign-in is on, so it doesn't exist on a deployed site. The fake sender lives on `globalThis` because route and action bundles each load their own copy of the module.

## Google sign-in removed; administrators link Planning Center profiles (2026-10-15)

- **Church decision: no Google sign-in.** Planning Center works for nearly everyone, and the church wants as few sign-in options as possible. The people who may not be church members (the Church Administrator and the System Administrators) sign in with an emailed code (step 7c). This departs from FR-01 (Google as a provider), FR-01b's Google option, and AC-1 and AC-6 as written; the requirements and DRD 6.1 carry a short note. The Google provider, the sign-in button, the "Allow Google sign-in" setting and `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are gone. The Google Cloud project stays, only for the Drive backup.
- **`users.google_subject_id` stays, unused.** Dropping a column is destructive and buys nothing; no code reads or writes it now. The `signin_google_enabled` settings row is left unread for the same reason.
- **Administrators link staff to Planning Center (AC-6 as now met).** Planning Center sign-in still never links to an existing account by email, because people can change the emails on their own Planning Center profile, and that would let someone take over the accountant's account. Until now the way out was "Sign in with Google first". Now the administrator links the account on the person's page (Admin → Users & Roles → Planning Center profile): it lists the Planning Center people with the account's email address, and has a search by name or email. The administrator confirms by name. Searches are audited (`admin.pco_person_searched`), like "Test a person". Links and unlinks are versioned and audited (`access.identity_linked` or `access.identity_unlinked`, `by: "administrator"`). One Planning Center person can be linked to one account only. Linking or unlinking clears the cached Group Leader result, which belonged to the old person, so the next sign-in checks again. The `link-required` screen now says to ask the administrator.
- **An emailed code also links the Planning Center person** when exactly one active person has that address, as a verified Google email used to. The code proves the address.
- **A Planning Center outage no longer turns away linked people.** A Planning Center sign-in first confirms the person belongs to the church's organization, and that check needs the API. If the API can't be reached but the Planning Center person is already linked to an account here, the person is known, so the 72-hour rule (FR-01a) decides instead of a flat refusal. Before, only Google sign-ins could reach that rule during an outage.
- **Test people** in `tests/fixtures/fake-identities.json` are all Planning Center now. Accountant Pat is seeded as linked, and Bo Chair (Board Chair) as added but not linked, for the end-to-end linking test.

## Stage 1, step 7d: Excel exports (FR-20) (2026-10-16)

- **One source of truth.** The workbook is built from the same review view the accountant sees (`getReviewView`), so every figure matches the screens, emails and receipts to the cent (AC-36, AC-95). Amounts are written as numbers in a CAD format (cents ÷ 100, display only), and the Total row is summed in cents. There are no formulas anywhere in the workbook.
- **Who:** accountants, backup approvers and the System Administrator (`annual.export_all`; AC-4, AC-110). The Church Administrator's spending reports come with Stage 4, so for now their Reports page says there's nothing for their roles. The download route checks permission again and audits a refusal as `access.denied`.
- **Audit:** each export writes `annual.exported` with the file name, the number of budgets and the filters. The workbook is built inside the same transaction, so a failed export leaves no record of an export.
- **Where:** a **Download Excel** button on the review screen, an **Excel** button per department row on the dashboard (DRD 6.6), **Export this view** (the dashboard's cycle, status and department filters; free-text search is a screen aid and isn't exported), and the **Reports** page (DRD 6.10), which explains the two sheets before downloading. The button shows "Preparing the workbook…", then "Downloaded {file}." or a plain error.
- **Download route:** `GET /api/exports/annual?cycle=&department=&status=&request=`. The query holds only ids and a status name, never data. The response isn't cached.
- **Sheets:** Summary (FR-20's columns; "Revision count" is the number of edits after submission) with a Total row when there's more than one budget, which covers "requested and approved budget summaries". Line Items has a one-budget workbook ending with Subtotal, Sales tax and Total for requested and approved. An approval of one different total adds an **Overall adjustment** row (the stored adjustment), so the approved lines add up to the approved subtotal.
- **Formula injection (AC-96):** text starting with `= + - @`, a tab or a carriage return is prefixed with `'`. Product links stay clickable, but only http and https.
- **File names:** `FY2027_Annual_Budgets.xlsx`, `FY2027_Annual_Budgets_Media_Team_Approved.xlsx`, `FY2027_Media_Team_IFC-2027-0007.xlsx`.
- **Not yet:** the church logo in the workbook header (branding, FR-30, Stage 2); spending, expense and payment workbooks (Stages 3 and 4); the Activity tab export (step 8).
- **New dependency:** `exceljs` 4.4.0 (MIT, free), as CLAUDE.md's stack lists.

## Stage 1, step 7e: Help and Privacy (FR-36) (2026-10-16)

- **Help** (`/help`) shows the guides for the person's own roles first, the common questions (tax, edits, approvals, spending, sign-in), and then the other roles' guides, folded. The text lives in `src/copy/help.ts` and follows the user manual, but only for what the app does today. Expenses and spending say they're coming, rather than describing screens that don't exist yet.
- **Contextual help:** "How is tax calculated?" on the budget form's items step and on the review screen opens a side panel (Radix Dialog, sliding in from the right; reduced motion is respected globally), so nothing typed is lost. Escape closes it and focus returns to the link. The panel links to the full answer on Help.
- **Privacy notice** (`/privacy`) is open without signing in, in a new `(public)` route group with its own simple layout (the decision in step 3 kept it behind sign-in until now). It's linked from the sign-in screen and the footer. It lists exactly what the app stores (including the Planning Center field value, the hashed address in the activity log and the hashed sign-in code), why, who can see it by role, the service providers and that some store data in the United States, at least six years of retention for financial records and the activity log (CRA), and the 30-day reply. The contact is the "Contact email on access screens" setting. It was drafted from the app, not by a lawyer; the go-live checklist asks the church to review it.
- **See or correct my information:** a form on Help emails the System Administrators through the outbox (`access.privacy_request`) and is audited (`access.privacy_requested`, with the kind only, not the text). One request a day per person, so the shared email quota can't be used up. Financial records aren't deleted on request; the form says so.
- **Found and fixed: forms lost what was typed after an error.** React 19 resets a form after a native form action, even when the server answers with a validation error, so for example "Add a staff member" with a mistyped email also cleared the name (against DRD 11). `ActionForm` now submits through `onSubmit` (keeping the clicked button's name and value) and resets only on success, when `resetOnSuccess` is set, before the success message shows. `SubmitButton` gets its pending state from the form. An earlier version reset in an effect after the render, which let a quick next entry be wiped; the end-to-end suite caught it.

## Stage 1, step 8: the activity log, search and breadcrumbs (2026-10-16)

- **Activity tab** (Reports → Analytics & Audit; FR-22, FR-52, AC-125, AC-126) reads the audit log with filters (person, acting role, area, kind of event, department, cycle, church-local date range, free text over references, titles, people, departments and reasons) and the six quick views, kept in the address. It shows pages of 50, newest first. Each row has when, who with a role chip, a plain-language action (`src/copy/activity.ts`; an unknown type is worded from its name, so nothing is ever hidden), the item, department and reason. **Show the details** expands a before/after table, marking changes with the word "changed" as well as colour. The Overview and Access tabs are Stage 2.
- **Who sees what** (3.6, FR-52), filtered in SQL on the server: the System Administrator sees everything; accountants and backup approvers the financial areas (Annual Budget, Expenses, Spending); the Church Administrator Spending; requesters their own departments' financial events, without the accountant's exports; the Board sees what they did themselves (their expense decisions arrive in Stage 3); everyone sees their own actions. A department, person or search filter can only narrow that.
- **The department and cycle of an event** come from the event, or from its budget. A draft's events name the budget only in `entity_id` (step 5), so the join also matches on that.
- **Export** of the filtered log (up to 10,000 events) is audited as `admin.activity_exported`, in the same transaction as building the workbook, with the formula guard.
- **A budget's own activity** is a separate page, `/annual/{id}/activity` ("Activity on this budget", linked from the budget and the review screen), rather than a section at the bottom: on the page itself it repeated the question and the reference beside the real content. Access follows the budget's own page; the rows follow the log's rules.
- **Emails in the log:** the outbox records `notifications.email_sent` and `notifications.email_failed` (FR-22 "notification attempts and failures"), once each, not every retry. The email log keeps every try. They're Admin-area events, so only the administrator sees them; the "Emails that failed" quick view uses them.
- **Home's Recent activity** (FR-37, deferred to this step) is the same log, scoped the same way, without sign-ins, email deliveries, autosaves and lookups: the latest six, with a link to the full log.
- **Global search** (DRD 6.0): `/` (when not typing) or Ctrl/Cmd+K opens a combobox dialog with focus in the box. It finds budgets by reference, title, department or item name (each checked with `annual.view`, so a draft stays with its department), departments (to the place each role works with them), people (System Administrator only) and pages in the person's own navigation. Results are grouped, arrow keys move, Enter opens. A server action does the search.
- **Breadcrumbs** above the heading on pages below the navigation's own pages: the area (as text, since its first page may belong to another role), the nearest navigation page above, and a "Details" crumb for a budget in between. The current page is named by its heading, so it isn't repeated, and navigation pages show none.
- **Found by axe:** an untitled draft (no reference, no title yet) made an empty link in Recent activity and the log; both now say "Untitled draft".
- **Session expiry** still isn't recorded: cookie sessions end without the server hearing about it (step 3). Sign-outs are recorded.

## Stage 1: closing the remaining acceptance criteria (2026-10-16)

- **AC-15, proposed departments.** A budget for a department that's still proposed can't be approved in any of the three ways, because a budget is approved only for a department on the list (FR-03). The service refuses it (`RuleError`), and the review screen says so above the decision panel. Return for clarification and Decline still work, so the accountant can ask which department it really is. Once the administrator adds the department or merges it, the budget can be approved as usual.
- **AC-25, no file uploads.** Server actions arrive as multipart form posts, so multipart itself can't be refused. `src/proxy.ts` instead refuses (415) any request that carries a file, and any multipart body sent to an `/api/` route. A multipart body that can't be read is refused too. The two allowed uploads (receipts in Stage 3, the logo in Stage 2) will be let through here by path when they arrive.
- **AC-114, board-approved total (4.2).** The allocated amount is the sum of `approved_total_cents` over the cycle's approved budgets. On the review screen it leaves out the budget being decided, so re-approving after a reopen isn't counted twice. The review dashboard shows "Allocated … of … board total" and what's left (or how much over), with the board reference. The decision panel warns, in the Warning style, when the approval would take the year past the total, and the approval is still allowed (DRD 6.7a). The words carry the meaning; the bar is decoration (`aria-hidden`).
- **AC-117, a Primary names Backups.** The Primary's own departments show a **{Department}: leaders** panel on Annual Budget, offering verified Group Leaders as Backup 1 or Backup 2. The existing `setRepresentative` service does it, with the same checks as for the administrator. When the actor is acting as a requester, it refuses moving themselves, moving the Primary, or any slot other than a Backup. Each nomination emails the System Administrators through the outbox (`department.backup_nominated`) so they can undo it. The audit is the existing `admin.department_leader_changed` with the acting role.
- **AC-118, clarification reminders.** The daily `reminders` job reminds the Primary once, a day after the accountant's question. It reminds the Backups once, after `backup_escalation_days` (Settings, default 3, at least 1). The reminders are keyed to the question (the latest *returned* or *reopened* decision), so a new question starts again and running the job twice sends nothing new. While the Backups' reminder is out for the current question, the requester's task on Home shows **Backup reminded**. Away (FR-33) isn't built yet, so for now reminders don't change for a Primary who is away; that comes with Stage 2.
- **AC-131, "Others".** The church's department list ends with "Others", which is the form's **Other (type your department)** option. Pasting it into Add departments skips it with a note, rather than creating a department called Others.

## Analytics & Audit is for staff only; cleaner Activity and Exports pages (2026-10-16)

- **Staff only, by the church's decision.** Requesters (department leaders) don't need the activity and audit dashboard, so **Reports → Analytics & Audit**, its Excel export and Home's **Recent activity** are for the accountant and backup approver, the Church Administrator, the System Administrator, and the Board Chair and Vice-Chair (read only). `analytics.view` no longer includes the Requester role, so the page, the export route and global search all refuse or leave it out; a leader who is also staff gets it through the staff role (union of roles). This changes Requirements 3.6 (the matrix row), the FR-52 rule on requesters, AC-128 and DRD 6.13's "Requester view"; they're updated to match.
- **Leaders keep their budget's history.** **Activity on this budget** stays on each budget for its department, with the same scope as before (their departments' financial events, without internal exports). The requester branch of `activityScope` now serves only that page.
- **Activity page:** quick views are chips in each area's colour with an icon (the name is always written, so colour is never the only signal). One search box with **Apply filters**; the other filters sit under **More filters** (a native disclosure, open when one of them is set). Each applied filter is a removable chip, a plain link without that parameter, so it works without JavaScript. Rows start with their area's icon in its colour (Access uses Admin's colour with a key icon), the role a person acted in is a chip tinted by role, and the item and department sit under what happened. Four columns instead of six; on phones the log is a list of cards, and the quick views scroll sideways in one row. The note about later tabs is gone: the Overview and Access tabs appear when they're built.
- **Exports page:** one card per report in its area's colour: **Annual budgets** (full width, with "What's in the workbook" folded away), **Activity log** (staff; a link to Analytics & Audit), and greyed **Expenses and payments** (Stage 3) and **Spending and budget vs actual** (Stage 4) cards. The Church Administrator sees the cards still to come instead of an empty page.
- The permission-denied text on Analytics & Audit says it's for church staff and points leaders to their budget's history.

## Stage 2, step 1: scheduled release of decisions (FR-19a) (2026-10-16)

- **Stored as the spec's model:** a held approval or decline is a normal decision with `released_at` empty. The request's real status is Approved or Declined, which the staff see at once (`annual.view_held`: accountants and backup approvers; the Church Administrator, the board and the System Administrator read it). The department sees **In Review**, no amount, no edit buttons and "Decisions will be shared on Dec 1, 2026" until release. The page, My budget requests, global search and the budget's own activity (which leaves out the Approved or Declined event) all apply this, on the server.
- **What's held:** only approvals and declines made while the cycle is in Hold mode and before the release time. Returns are never held (FR-19a). The accountant's copy is sent at once and says when the department will hear. The Church Administrator's "new budget available" email also goes at once, since staff see decisions as soon as they're made.
- **Release:** at release each held decision gets its release time (the one change the history table allows, once), an `annual.decision_released` audit event, and the department's email with the shared message and the time it was decided. Only a request's latest decision counts, so an approval reopened before release is never sent. Two runs at once can't send twice: the update only takes a decision whose release time is still empty.
- **Release now** sets the cycle's release time to now and releases everything held, with an idempotency key, so decisions made afterwards go straight out (AC-19). **Cancel schedule** goes back to Send immediately and sends whatever is held at once, so nothing is left unsent; the confirmation says how many. Changing the time or message just saves it (versioned and audited, `annual.release_scheduled`).
- **Who:** the accountant and backup approver change it (`annual.release`). The System Administrator can open the page read-only by its address; it isn't in their menu, which holds no money actions (Requirements 3.5).
- **The job:** `POST /api/jobs/release-decisions` releases due cycles and, a day ahead, emails the accountants a list of departments still undecided or not submitted (once per release time). At release it sends them a summary with what's still outstanding; those are sent as soon as they're decided. The Netlify scheduled function (`netlify/functions/send-outbox.mts`) now calls release, then the outbox, every 15 minutes in one invocation, so held emails go within 15 minutes of the time (AC-18). The nightly GitHub workflow calls it too, as a backstop.
- **Screens:** Annual Budget → **Decision release** (DRD 6.7b) shows how decisions go out, where the cycle stands (Approved, Declined, Undecided, Not submitted), who gets which email at release, and Hold / Save / Release now / Cancel schedule with confirmations. Release now and Cancel remove their own buttons, so they come back to the page with the confirmation in the address. The review dashboard has a **Decision emails** card, and every review screen shows a banner while decisions are held.
- **End-to-end tests** don't hold the cycle: they share one open cycle with every other test running in parallel, and holding it would hold their approvals. Holding, releasing, Release now and Cancel are covered by integration tests named after AC-17 to AC-19; the end-to-end tests cover the page, its validation, access and axe.
- **Not yet:** "Expenses can't start for a department until its decision is released" arrives with expenses (Stage 3).
- **Fixed on the way:** the review screen's done message said "The department will be emailed once email sending is set up". Email has worked since step 7, so it now says the department has been emailed (or, when held, when it will see the decision).

## Stage 2, step 2: request messages (FR-31) (2026-10-16)

- **Tables** (migration `0012_request_messages`): `request_messages` (9.17, plus `acting_role` so each message shows which side wrote it) is append-only by trigger, like the other history tables, so a message can't be edited or deleted (FR-31). The text is 1 to 2,000 characters, checked in the database too. `request_message_reads` keeps when each person last read a request's thread, for the unread counts (DRD 6.11a). It's the only thing that changes, and it isn't audited because reading isn't a change.
- **Who writes and reads:**
  - The department's leaders write (`annual.message_send`, own department), as do the accountant and backup approver once the request is submitted. A leader who is also an accountant writes as the department.
  - A draft has no thread: the accountant can't see a draft, so the panel appears once the request is submitted.
  - The System Administrator reads every thread (AC-110). The board and the Church Administrator aren't part of it.
  - The thread stays open after approval or decline.
- **Emails (AC-59):** each message emails the other side through the outbox, with the text. The accountant's message goes to every representative of the department; a leader's goes to the accountant(s) (`accountantRecipients`, which will follow Away in FR-33). The writer is never emailed. The link opens the request at its Messages panel. Each message is audited (`annual.message_sent`, with the side and length, not the text) and so shows in the budget's activity.
- **Limits:** 30 messages per person per rolling day. A conversation can't use up the free email quota (100 a day on Resend's free plan) that every other email shares. Each Send carries its own idempotency key, so a double click posts one message.
- **Links:** http and https addresses in a message are shown as links that open in a new tab without the opener, each followed by its domain (CLAUDE.md "Links"). Nothing else is markup.
- **Unread counts:** "1 new message" on the department's request rows (Annual Budget) and on the accountant's review queue, until the thread is opened. Messages you wrote yourself are never unread.
- **Not yet:** a My tasks item for an unanswered message, and the email digest and preferences (later in Stage 2).

## Stage 2, step 3: Away for the accountant and a department's Primary (FR-33, FR-38) (2026-10-16)

- **Days, not times:** Away is whole church-local days: from the start of the first day until the start of the day back ("Back on"), or open-ended. The first day defaults to today, and a future first day starts it on that day. Stored in UTC; nothing has to run for it to start or end.
- **Accountants** (migration `0013_user_preferences_away`): a new `user_preferences` row per person (9.18) holds `away_from` / `away_until`. Email preferences join it later in Stage 2. It's versioned, and setting and clearing are audited (`user.away_set`, `user.away_cleared`). The accountant and backup approver set it from **Account settings** (account menu → Away).
- **Who gets "accountant" emails** (`accountantRecipients`, AC-61): the Primary accountant. While they're away, everyone else with the Accountant or Backup approver role who isn't away. With no Primary chosen, every accountant who isn't away. Never nobody: if everyone is away, the Primary (or every accountant) still gets them. Every email that goes "to the accountant" follows this, judged at the moment of the change.
- **Covering is shown** on the Review dashboard ("Pat is away until Oct 23. Accountant emails go to Bo.") and on the person's Account settings.
- **Deciding isn't affected:** the Primary accountant can still decide while away, and backup approvers always could (FR-33 gives them the same permissions).
- **A department's Primary** uses the Away dates already on their department row (FR-38). They set it under their department's leaders on Annual Budget; the administrator can too (`department.away`). It needs at least one Backup, so someone covers. While it's on, the clarification reminder reaches the Backups from the first day instead of after the escalation delay (AC-119), and every leader of the department sees "Covered by … until …". Other department emails already go to every leader (FR-32). Audited as `department.away_set` and `department.away_cleared`. Changing the Primary clears the old Primary's Away (step 4 already did this).
- **The Board Chair's Away** (Vice-Chair receives the final-approval queue, AC-112) comes with expenses in Stage 3. Until then, Away isn't offered to the board.
- **End-to-end tests** never make anyone Away today, because that would move other tests' accountant emails while they run in parallel. They set a future Away and turn it off. AC-61 and AC-119 are integration tests.
- **Local dev server and new tables:** `npm run dev:fake` migrated its in-memory database only at startup, so pages using a table added while it ran (messages, Away) failed with "relation does not exist" until a restart. With `--dev` it now watches `drizzle/meta/_journal.json` and applies new migrations as they land. Test and CI servers are unchanged.

## Stage 2, step 4: second approval for large budgets (FR-34) (2026-10-16)

- **Setting:** Admin → Settings → **Second approval for large budgets**. It's an approved total including tax, stored in cents (`second_approval_threshold`). Off when empty, which is the default. Changing it is audited (`admin.second_approval_threshold_changed`).
- **First approval:** an approval (any of the three ways) whose approved total is at or above the threshold moves the request to **Awaiting Second Approval**.
  - The decision is recorded with its amounts and approved lines as usual, at stage `first`, but the request carries no approved amount yet. So it isn't counted as approved anywhere (the board total, dashboards, exports, spending later).
  - Audited as `annual.first_approved`.
  - The department is emailed "Approved by the accountant, awaiting final sign-off" without an amount, because the amount can still change if the second approval is refused.
  - Every other accountant and backup approver who doesn't lead the department is emailed "Second approval needed", preferring those not away, and gets a **Give the second approval** task in My tasks.
  - The approve button says **Approve (needs second sign-off)** when the figures reach the threshold (DRD 6.7).
- **Second approval:** by anyone with the Accountant or Backup approver role except the first approver and anyone who leads the department (`annual.second_approve` plus a service check).
  - **Give second approval** records a `second_approved` decision with the same amounts and makes the request Approved. The department, the accountant and the Church Administrator then get the usual approval emails.
  - **Refuse** needs a reason, records `second_refused`, and returns the request to In Review. The first approver and the accountant are emailed the reason. The department isn't emailed: nothing final happened, and their page shows In Review.
  - Both take an idempotency key and are audited.
- **With scheduled release (FR-19a):** the first approval isn't a final decision, so it's never held. But while the cycle holds decisions, the department sees In Review instead of Awaiting Second Approval and isn't told it's awaiting sign-off, because either would give the decision away. The second approval is the final decision: it's held and released like any approval.
- **End-to-end tests** only change the threshold to an amount far above anything the other tests approve, because they run in parallel against one database. The approve, second-approval and refuse flows are integration tests.

## Stage 2, step 5: start from last year's request (FR-35) (2026-10-16)

- **Where:** a checkbox on the start form (step 1). It shows only when the chosen department has a submitted request from an earlier cycle and no budget yet this cycle, and it names that request ("Start from last year's request (FY2026, IFC-2026-0004)"). FR-35 says "when starting a new request", so it lives there rather than as a separate button on the dashboard (DRD 6.2).
- **What counts as last year's:** the department's request in the most recent earlier cycle that was submitted (any status but Draft). An old draft is never copied.
- **What's copied (AC-64):** title, justification and each item's name, quantity, unit price, link and notes. It goes into a normal new draft, which uses today's tax rate and can be changed freely. Approved values, revisions, decisions, messages, emails and the reference number stay with last year's request, which is untouched. Audited as `annual.copied_last_year` with the source request.
- **The editor** opens with a note to check every item. If there's nothing to copy (the department never submitted before), the draft starts empty as usual.
- **Tests:** the fake test data has a single cycle, so the option doesn't appear in end-to-end tests. AC-64 is an integration test (copied content, today's rate, nothing else copied, last year unchanged).

## Stage 2, step 6: branding (FR-30) (2026-10-16)

- **Where:** Admin → Settings → **Branding** (`/admin/settings/branding`), for the System Administrator only (`admin.branding`, AC-101). The Settings page links to it.
- **What can change:** the logo, an optional square browser icon, the church name, the application name and the accent colour. Each change is audited (`admin.branding_changed` with old and new values; `admin.logo_uploaded` / `admin.icon_uploaded` with type, size, dimensions and SHA-256). Each part is versioned on its own, so two administrators can't silently overwrite each other.
- **Files are stored in Postgres, not R2** (migration `0014_brand_assets`). A logo is at most 1 MB and there are only ever a handful. R2 needs a payment card on file (go-live checklist item 7), and that decision is still open for receipts in Stage 3. This keeps branding free of that dependency. The table is append-only (the history trigger), so a replacement is a new row and Settings points at the current one (`logo_asset_id`, `icon_asset_id`). Removing a logo only clears the pointer.
- **File checks:** the type comes from the file's bytes, not its name or the browser's claim: PNG, JPEG or SVG, up to 1 MB. FR-30 says "SVGs sanitized". An SVG with scripts, event handlers, links, embedded HTML or external references is **refused rather than rewritten**, so what's stored is exactly what was checked. Logos are shown only through `<img>` and served from `/brand/asset/{id}` with `Content-Security-Policy: sandbox` and `nosniff`. The icon must be a square PNG or SVG.
- **The one upload:** the no-files guard (`src/proxy.ts`, AC-25) lets multipart files through for exactly `/admin/settings/branding`. The service checks the role, size and type again. Server actions accept bodies up to 2 MB for this page's sake (`next.config.ts`).
- **Public files:** `/brand/*` is open without sign-in, because the sign-in screen and emails show the logo. Asset URLs carry a random id that changes with every upload, so they cache for a year. `/brand/icon` serves the current icon (cached five minutes) or redirects to the default favicon.
- **Accent colour (AC-100):** checked against DRD 3.2 at 4.5:1, for white button text on the accent and for the accent as text on every light-theme background. From the one colour the app derives the hover shade, the soft tint and a dark-theme accent (same hue, lightened until it passes on the dark surfaces). A failing colour is refused on the server with the nearest passing shade named, and the form previews and offers the same shade as you type. **Reset to default** clears it, which brings back the DRD purple. Status colours never change. The CSS override is built only from a checked hex.
- **Where it shows (AC-99):** the sidebar, header, sign-in and public pages, and the footer (read per request, so no redeploy is needed). Emails show the logo above the names when it's a PNG or JPEG (most mail clients won't show SVG), and the button uses the accent. Excel workbooks put the PNG or JPEG logo in the header. Print styles (DRD 6.12) weren't built in Stage 1, so this step adds the base: printed pages use the light theme, hide the navigation, header and footer, and start with the church's logo and names. The rest of 6.12 (reference number in a running header, page numbers, keeping the totals block on one page) comes with the approved-request print layout in Stage 5 hardening.
- **Tests:** e2e tests never save branding, because every page shows it and tests run in parallel against one database. They cover the contrast refusal, a non-image refused through the real upload path, phone width, and AC-101. AC-99 and the save paths are integration tests.

## Stage 2, step 7: email preferences and the accountant's daily digest (FR-21) (2026-10-16)

- **Where:** Account settings → **Email preferences** (account menu → Email preferences), for everyone (`account.email_preferences`). Copies and the digest are shown and saved only for the Accountant and Backup approver (`account.accountant_emails`). Anyone else's values for those stay as they were. Changes are versioned and audited (`user.email_preferences_changed`, before and after). They're stored on `user_preferences` (9.18, migration `0015_email_preferences`), and no row means the defaults: every email, sent straight away.
- **Applied in one place:** `enqueueEmail` routes every email through `src/lib/email/preferences.ts`, so no sender can forget. Each template has a category:
  - **Reminders** (can be turned off): `cycle.reminder`, `cycle.deadline_passed`, `annual.clarification_reminder`, `annual.clarification_backup_reminder`.
  - **Copies** (can be turned off): the accountant's copies of returned, approved, declined and reopened.
  - **Digestible:** `annual.submitted.accountant` and `annual.revised.accountant`. FR-21 says "new submissions and revisions". A clarification answer still goes straight away, because the accountant is waiting on it.
  - **Always:** everything else, including request and decision emails, messages, sign-in codes and access emails, as FR-21 requires. An address without an account always gets the email.
- **Daily digest:** a held email becomes an `email_digest_items` row (never deleted) instead of an outbox row. The nightly `reminders` job (03:15 church time) queues one email per person ("N budget updates to review") and marks each item with the outbox row it went in, in the same transaction, so nothing goes twice. Switching back to instant sends what was waiting at once. The settings page shows how many updates are waiting.
- **Away still applies first:** Away decides who the accountant emails go to, and then each person's preference decides how they arrive.
- **The monthly spending summary** (FR-21) joins the optional emails in Stage 4.
- **Account menu:** "Email preferences" is now a link (it was Coming soon).
- **End-to-end tests** only toggle a requester's reminders. The accountant's copies and digest are integration tests, because other e2e tests count the accountant's emails.

## Analytics & Audit: each role sees its own areas (FR-52) (2026-10-16)

The church asked that staff other than the System Administrator not see sign-ins, access denied, settings and role changes, or failed emails, and that nobody can act as anyone else.

- **No impersonation.** The app has no "act as" or "view as" feature: the viewer is always the signed-in person, with roles read fresh from the database. The Activity filter that was labelled "Acting as" filtered by the role a person used. It's now **Role used**, in the export too.
- **The administration log is the System Administrator's** (`analytics.admin_audit`):
  - The Access and Admin areas are hidden from everyone else, **including their own events** there (sign-ins, Away and email preference changes, exports of the log).
  - "Everyone sees their own actions" now means their own actions in the financial areas.
  - The quick views Failed sign-ins and access denied, Settings and role changes, and Emails that failed are shown to the administrator only, as are the matching kinds of event, the Access and Admin areas, and System Administrator in the Role used list.
  - A hidden filter typed into the address is ignored, so the person sees their usual log.
  - The coming Access tab uses the same action.
- **Per role** (Requirements 3.6):
  - Accountant and backup approver: Annual Budget, Expenses and Spending.
  - Church Administrator: Spending.
  - Board Chair and Vice-Chair: their own expense decisions (Stage 3).
  - The Person filter stays for staff, listing only people in their log (decided 2026-10-16).
- **One scope** (`activityScope`) serves the page, the Excel export and Home's Recent activity.
- **Budget links in the log** open the review screen for an accountant, but the budget page itself when the person leads that department. A leader's draft can't be opened on the review screen.
- **Accessibility:** "Show the details" in the log is now 24 px tall (WCAG 2.5.8 target size). The accountant's new axe check found it.
- **Dev note:** a local `dev:fake` server started before the live-migration watcher must have new migrations applied by hand. The FY2027 submission error seen on 2026-10-16 was migrations 0014 and 0015 missing there, not a code fault.

## Emails can't be turned off (2026-10-16)

This replaces Stage 2 step 7 (PR #34). The church decided that every email is enforced. If people can turn emails off, they miss ones they need, and the church ends up chasing them.

- **Removed:** Account settings → Email preferences (turning off reminders and copies), the accountant's daily digest, and the account menu item. Every email goes to everyone it's meant for, straight away. This departs from FR-21 "Email rules", which allowed opting out, and the requirements and the DRD now say so.
- **Code:**
  - `enqueueEmail` queues every distinct recipient again.
  - Removed: `src/lib/email/preferences.ts`, the digest service and job step, the preferences service, and the `account.email_preferences` and `account.accountant_emails` actions.
- **Data:** migration `0016_remove_email_preferences` drops the preference columns from `user_preferences` and the `email_digest_items` table. The app wasn't live, so only dev and test data held them. `user_preferences` stays for Away. Past `user.email_preferences_changed` audit rows stay in the log.
- **Unchanged:** Away (FR-33) still decides who covers for the accountant, and the monthly spending summary (Stage 4) will always be sent.

## Over-budget expenses: warn, allow, board decides, balance goes negative (FR-43, Stage 3) (2026-10-16)

The church's rule for expenses (built in Stage 3):

- **Requester:** when Remaining after a submission would be below zero, whether or not the department was already over, they see "This takes Media over budget by $X. You can still submit; the Board Chair must approve it." The over-budget explanation is required (FR-40), and submitting stays allowed.
- **Approvers:** the accountant and the Board Chair (or Vice-Chair) both see the overage and the explanation above their decision buttons. The figure is worked out at the moment of each decision, so two pending submissions can't each hide an overage (AC-140).
- **Balance:** the amount is charged at the Board Chair's final approval, matching AC-73. FR-43 had implied the accountant's approval, and that wording is corrected. Remaining then goes below zero, shown as "Over budget by $X" (never a bare minus), the status becomes Over budget, and the FR-28 alerts fire (AC-139).
- **Unchanged:** every expense already needs Board Chair approval at any amount (6B.4), so "subject to board approval" needs no new step.

Updated: requirements 6B.3, 6B.4, FR-43, AC-70, the new AC-139 and AC-140, DRD budget strip and Board Chair review, and the user manual.

## Stage 2: Planning Center team mapping (FR-39) (2026-10-16)

- **Where:** Admin → Departments → a department → **Planning Center mapping** (`admin.pco_mapping`, System Administrator). Pick a Services team, Groups group or group tag. The lists are read live from Planning Center with the church's token, and the app never writes there. Choose **Suggest** (default) or **Automatic**, and optionally **Team leaders count as Group Leaders**. The page shows the last check and has **Sync now**. The department list shows each department's link.
- **One source per department:** a department linked to a team, group or tag no longer matches on the Ministry Department field. The field and its church-wide Off/Suggest/Restrict setting still apply to departments that aren't linked, unchanged. One team, group or tag can be linked to one department only.
- **Suggestions have their own table** (`pco_leader_suggestions`, migration `0017`, never deleted), not `user_departments` rows with `pco_status = 'suggested'`. `user_departments` is read in over a hundred places for access, emails and tasks. Keeping suggestions apart means a suggestion can never give access or receive a department email by mistake. The `suggested` and `ignored` values of `pco_match_status` stay unused. A suggestion is suggested, added, ignored (later syncs leave it ignored) or withdrawn (the person stopped leading before anyone decided).
- **Only people with an account are matched.** FR-39 imports no other Planning Center data, so the app never creates accounts for people who haven't signed in. A team leader who signs in for the first time is matched then:
  - In Automatic mode they land on the department.
  - In Suggest mode the administrator is emailed "Confirm Sam Lee for Media", and the waiting screen says "Your administrator has been asked to confirm you for Media".
- **Automatic mode:** adds leaders as Representatives (with the Group Leader check, unless the toggle is on) and removes Representatives who stop leading at the next sync. A Primary or Backup chosen by a person is flagged "No longer a team leader in Planning Center", never removed (FR-38). Requests always stay with the department (FR-32).
- **Suggest mode:** **Add** as Primary, Backup 1, Backup 2 or Representative, using the same rules as adding any leader, or **Ignore**. People who were added and later stop leading are flagged and keep access until removed.
- **Team leaders count as Group Leaders (AC-124):** at sign-in and in the nightly check, someone the Group Leader field turns down passes if they lead a source linked to a department with this on. Their verification records "Team leader: {source}".
- **When it syncs:** at sign-in, for that person only, and nightly in `pco-verify` for every linked department, each in its own transaction, after the Group Leader checks. A source that's gone or can't be read changes nothing. It's recorded as `admin.pco_mapping_sync_problem` for the coming Access tab (FR-52). The last-sync time isn't an edit, so it doesn't change the department's version.
- **Audited:** mapping changes, suggestions, adds, ignores, withdrawals, automatic joins and removals, flags and sync problems.
- **Directory:** `listSources` and `sourceLeaderIds` are added to the Planning Center client. They cover Services team leaders, Groups memberships with role leader, and tag groups. The fake directory gained a "Media / Production" team, a "Youth Leaders" group and a "Ministry: Youth" tag.

## Stage 2: the Access tab of Analytics & Audit (FR-52) (2026-10-16)

- **Where:** Reports → Analytics & Audit → **Access** (`/reports/analytics/access`), for the System Administrator only (`analytics.admin_audit`). Other staff don't see the tab, and opening the address shows permission denied, which is audited.
- **What it shows (last 7 days, church time):**
  - Sign-ins per day by method (Planning Center or emailed code), with failures.
  - Failed sign-ins: counts for 24 hours and 7 days, the 10 most recent, and a link to the full list in the Activity tab.
  - Access denied attempts with the page refused.
  - Suspended Group Leader checks (link to the person).
  - Active departments without a Backup (link to their leaders).
  - Planning Center mapping problems (FR-39), listed until a later sync succeeds or the department is unlinked (link to its mapping).
- **Tables instead of charts:** each figure is a small count, and a table reads well with a screen reader and on a phone. Tables that scroll sideways on a phone can be focused by keyboard (WCAG 2.1.1).
- **Tabs:** Activity and Access share one tab bar. The Overview tab joins it next.

## Stage 2: the Overview tab of Analytics & Audit (FR-52) (2026-10-16)

- **Where:** Reports → Analytics & Audit → **Overview** (`/reports/analytics/overview`), the first tab. Activity stays at `/reports/analytics`, so existing links and bookmarks keep working.
- **Annual budget figures only, for the people who review them** (`annual.review`: accountant, backup approver, and the System Administrator read-only). Requirements 3.6 gives the Church Administrator spending and payment analytics and the board the expenses they decided, which arrive with Stages 4 and 3. Until then they see a short note instead of figures that aren't theirs.
- **Figures** (one cycle, chosen in the filter bar; the open one by default):
  - Board-approved total against what's approved, with a meter, flagged in the danger colour with "Over…" when exceeded.
  - Requested and approved totals including tax.
  - Average days from submission to the decision.
  - Departments by stage (Not started, Draft, Submitted, In review, Returned, Approved, Declined), each bar linking to the review dashboard filtered to it.
  - Requested against approved by department.
  - The five budgets waiting longest.
- **Same numbers as the dashboard:** the Overview is built on `getReviewDashboard`, so its totals match the review dashboard and the exports to the cent.
- **Charts** follow the dataviz method:
  - Departments by stage is one series of horizontal bars.
  - Requested against approved is a dumbbell with one hue, told apart by shape (ring for requested, filled dot for approved) and a legend.
  - Every chart has a "Show as a table" view, a title that states the takeaway, and a hover title on each mark. Each row is a keyboard-reachable link.
  - They're built in HTML and CSS rather than SVG, so they reflow at 360 px.
  - A new `--chart-1` token (`#2860c0` light, `#3987e5` dark) passes the palette validator on both surfaces. The dark annual blue `#7fb0ff` is right for text but too light for a mark.
- **Export:** "Export to Excel" downloads Summary, By stage and By department sheets, with amounts as numbers in CAD format. It's audited as `annual.overview_exported`.
- **Not yet:** budget vs actual, spending over time, the expense pipeline and payment turnaround. They need Stage 3 and 4 data and will join this tab then. The department, area and date filters come with them.

## A cleaner, Apple-style look for the staff pages (2026-10-16)

The church asked for a cleaner look, with colour to tell cards apart, on these pages: review dashboard, decision release, my department's budget, the Analytics & Audit Overview and Access tabs, budget cycles, settings, notifications & audit, and users & roles.

- **Tokens (small departures from DRD 3.6):**
  - Card corners are 18 px, up from 14. Control corners are 10 px, up from 8. Dialog corners are 22 px.
  - The card shadow is softer and more diffuse, and the card hairline is lighter (`#e8e8ee`).
  - Input borders are unchanged, so form fields keep their 3:1 boundary contrast.
- **Colour per card:**
  - Each card heading leads with an icon on a coloured tile (`IconChip`). The colours come from the area tokens (violet, blue, teal, amber, pink, slate) plus green and red for good and bad states (`src/components/ui/tone.ts`).
  - Colour is never the only cue: every tile has an icon, and every card keeps its title.
  - The area pairs are already contrast-tested. The status tints are kept light (10%) so the strong colour stays readable on them.
- **Headline numbers** use one `StatCard` everywhere: a label, a large figure, a coloured icon tile, and an optional ring for "needs you" or the current filter. They're used on the review dashboard, Overview, and Notifications & Audit.
- **Smaller touches:**
  - Analytics & Audit tabs are a segmented control.
  - Empty states are a soft grey panel instead of a dashed box.
  - Table headers are small capitals, and rows highlight on hover.
  - On wide screens the short settings sit two to a row.
  - Page titles are larger and bolder.
- **Fixed:** an out-of-date note on Notifications & Audit said the activity log "moves … in the next step". It now links to the activity log.

## Stage 3 step 1: the expense data model (6B.10) (2026-10-16)

- **Tables** (migration `0018_expenses`): `expense_submissions`, `expense_items` (purchase requests), `expense_receipt_lines` (claims), `expense_receipt_files`, `expense_revisions`, `expense_decisions`, `expense_payments`, and a first `spending_entries` table (FR-24). Stage 4 builds the ledger screens on it. Amounts are integer cents. A claim stores its total as the subtotal with zero tax, because receipt amounts already include tax (FR-41), and a check constraint enforces it.
- **Additions to 6B.10:**
  - `department_name_snapshot`, `late_claim_explanation` (FR-46), `how_bought` (FR-40), `payee_kind` (self, someone else, church card) and `submitted_at`, `approved_at`, `closed_at` on the submission.
  - `revision_id` on each decision, so it names the version decided on.
  - `remaining_after_cents` on each decision, so the over-budget figure each approver saw is kept (AC-140).
  - `sha256` on receipt files, to spot the same file twice.
  - `difference_note` on payments, for an amount paid that differs from the approved amount.
  - Cheque signers are stored as ids plus names, so a removed signer still shows on past payments (AC-134).
- **`approved_total` holds the current approved amount.** The accountant's approval sets it, and the Board Chair's final approval may lower it. The budget counts it only from final approval on (AC-73). Until then an item awaiting the Board Chair is Pending, at the accountant's amount.
- **Append-only:** revisions, decisions and payments can't be changed or deleted. Receipt files and spending entries can't be deleted; they're marked removed or voided instead. A submission can be deleted only while it's a never-submitted draft. Database triggers enforce all of this, as for Part A.
- **Emails** gain the `board` audience and a link to the expense (`email_outbox.expense_submission_id`).
- **Settings** (6B.10): `claim_deadline_days` (90), `unclaimed_purchase_reminder_days` (60) and `payment_reminder_days` (14). One addition, `board_reminder_days` (7), holds FR-49's "waiting for the Board Chair over 7 days".
- **Budget figures** (`src/domain/expenses/budget.ts`, FR-25):
  - Available is the approved annual total once its decision has reached the department. A held decision (FR-19a) doesn't start expenses yet.
  - Committed is approved purchase requests that are Approved or Processing.
  - Spent is recorded expense entries minus refunds.
  - Remaining is Available − Committed − Spent.
  - Pending is shown but never deducted.
  - Amendments join Available in Stage 4.
- **Permissions** (`authz.ts`):
  - New actions: `expense.view_all`, `expense.review_queue`, `expense.board_queue`, `expense.process_queue`, `expense.cancel` and `expense.export`.
  - No approver decides an expense they submitted (FR-47), as well as one for their own department or that pays them.

## Stage 3 step 2: submitting expenses (6B.3, FR-40 to FR-44) (2026-10-16)

- **Pages:**
  - **New expense** (`/expenses/new`): choose the type, the department and the budget year.
  - **The form** (`/expenses/{id}/edit`): the budget strip, the details, items or receipt lines, how it's bought or who's paid, then a preview and **Confirm submission**.
  - **The expense** (`/expenses/{id}`): the approval tracker, details, totals and next steps.
  - **My expenses** (`/expenses/mine`): every expense of the person's departments, with each department's budget.
- **Which year an expense is charged to.** The requester picks it from the years where the department has an approved budget whose decision has reached it (FR-19a) and whose spending period isn't locked. This calendar year's budget is preselected, otherwise the latest. FR-46 says "the year of the purchase date"; the app doesn't force that, because a December purchase for January's ministry is normal, and the accountant sees the year on every screen. AC-78 holds: with no such budget, nothing can be started or submitted.
- **Drafts are saved with Save draft, not autosaved.** Expense forms are short. Rows are stored in their own tables, so a receipt line with anything typed must have a valid date and amount before it's saved.
- **Who's paid:**
  - **Me** uses the requester's account, with their sign-in email unless they give an e-transfer address.
  - **Someone else** needs a name, and an email for an e-transfer. If that email belongs to an account, the claim records that person as the payee, so they can't approve it (FR-47).
  - **Church card** means nothing is owed.
  - Bank account numbers are never asked for.
- **Late claims (FR-46):** a receipt older than `claim_deadline_days` (90) needs an explanation. A purchase date in the future is refused.
- **Over budget (FR-43):** worked out from the live figures when the form opens and again on the server at submission. A claim linked to a purchase request counts that request's commitment as released.
- **Editing (FR-44):**
  - Any representative of the department can change a Submitted expense, or answer a return. Each change is a new revision.
  - A change that changes nothing is refused.
  - Withdrawing is allowed while Submitted or Returned.
  - Cancelling an approved purchase request needs a reason, and is refused while a claim linked to it is on its way.
- **Not built:** the optional "Expense submitter" permission for someone who isn't a department representative (6B.2). Only representatives submit.
- **Test data:** the fake server now seeds a closed **FY2026** cycle where Media Team's $30,000.00 budget is approved and released, so expenses can be tried locally and in end-to-end tests. Media's FY2027 request is still left to the annual form.

## Stage 3 step 3: receipts on expense claims (6B.9) (2026-10-16)

- **Storage:** Cloudflare R2, as the church chose: a private bucket, reached with signed links that last a few minutes. The links are signed with AWS Signature V4 using `node:crypto` (`src/lib/storage/sigv4.ts`, checked against AWS's published example), so no AWS SDK is added. With fake sign-in on (tests, local), files live in the server's memory behind a test-only route (`/api/test/storage`), which is a 404 anywhere else.
- **Uploads go straight from the browser to R2.** Netlify functions accept at most 6 MB per request, and receipts may be 10 MB.
  1. The browser asks the app for a link (`POST /api/expenses/{id}/receipts`, JSON). The app checks the person, the claim, its status, the count, the size and the type, and answers with a 15-minute upload link and a signed token.
  2. The browser uploads the file to R2.
  3. The browser confirms (`POST …/receipts/confirm`). The app reads the file back, checks its real type from its first bytes (JPG, PNG or PDF), checks its size, records it with its SHA-256, and audits it. A file that fails is deleted from R2.
  - No multipart body ever reaches the app, so the no-uploads rule elsewhere (FR-23) is unchanged.
  - R2 needs a CORS rule letting the app's address `PUT` with a `Content-Type` header (go-live checklist item 7).
- **HEIC photos** (iPhones) are converted to JPG in the browser before upload with `heic2any` (free, MIT, loaded only when a HEIC file is picked). The app stores JPG, PNG and PDF only.
- **No virus scanning.** No free scanner fits Netlify's functions, and the church agreed to go without (2026-10-16). Risk is limited:
  - Files are never served from the app's own address.
  - They open only through short-lived R2 links with the stored content type.
  - Only JPG, PNG and PDF signatures are accepted.
  - The `scan_status` column of 6B.10 isn't kept.
- **Who sees receipts (AC-81):** the claim's department, the accountant and backup approvers, the Church Administrator, the Board Chair and Vice-Chair once the claim reaches them, and the System Administrator. A draft's receipts stay with the department. Every view goes through `/api/expenses/{id}/receipts/{fileId}`, which checks permission, then redirects to a 5-minute link. Refusals are audited.
- **Removing a receipt** marks it removed and keeps the file for the retention period (6 years). It's allowed only while the department can still change the claim.
- **The same file on two claims** (same SHA-256) is flagged to the department and the approvers (FR-47).
- **Phones:** **Take photo** opens the camera. **Choose file** takes several files. On wider screens, files can be dropped on the box.

## Stage 3 step 4: the accountant's first approval (6B.4 level 1) (2026-10-16)

- **Pages:**
  - **Review queue** (`/expenses/review`). Headline figures: waiting, total waiting, over budget, oldest. Filters (department, type, status, over budget only) are kept in the address. Rows show days waiting and flags.
  - **Review screen** (`/expenses/review/{id}`). Details and lines on the left. On the right: receipts, the budget impact (Remaining now, and if approved), warnings, then the decision.
- **Opening a Submitted expense starts the review** (status In Review), as for annual budgets. From then on the department can't edit it (FR-44, AC-71). Only someone who may decide it starts it.
- **Decisions:**
  - **Approve and send to Board Chair.**
  - **Approve a different amount**: one total including tax, with a required reason. For a purchase request the tax is worked out inside it (AC-69); a claim adds none. It can't be **more** than was asked, so an approval never raises what the requester asked for.
  - **Return for clarification**, with a question.
  - **Decline**, with a reason.
  - Every decision is confirmed in a dialog that says what happens next, and is idempotent.
- **Approval doesn't charge the budget** (AC-73). The expense waits at the accountant's amount as Pending, and the Board Chair's final approval charges it.
- **Warnings above the decision:**
  - **Over budget**, worked out now (FR-43, AC-140), with the requester's explanation.
  - **Duplicates** (FR-47): another live claim of the department with the same vendor, date and amount, or the same receipt number, linked.
  - **Late receipts** (FR-46), with the explanation.
  - **No receipt**, with the reason.
  - **A claim above the purchase request it closes** (FR-42).
- **Conflicts (AC-72):** someone who leads the department, submitted the expense or is its payee sees the screen read-only, with the reason. The queue marks those rows. Each decision records the remaining balance at that moment.

## Stage 3 step 5: the Board Chair's final approval, Away and the Vice-Chair (6B.4, 3.3) (2026-10-16)

- **Pages:**
  - **Awaiting my approval** (`/expenses/awaiting-approval`): the same queue layout as the accountant's.
  - **Decision screen** (`/expenses/awaiting-approval/{id}`): the accountant's approved amount and note first, then the same warnings the accountant saw, worked out again now (FR-43, AC-140), then **Give final approval**, **Approve a smaller amount** (including tax, never more than the accountant approved: AC-75), **Return to accountant** (back to In Review) or **Decline**. It works on a phone.
- **Who decides (3.3, AC-112):**
  - **The Board Chair**, unless they lead the department, submitted the expense or are its payee. A Chair who is Away can still decide if they sign in.
  - **The Vice-Chair**, only while no Board Chair can: every Chair is Away or conflicted. Otherwise the Vice-Chair's screen says the Chair gives this approval, and the server refuses.
  - Each decision records the role used (Board Chair or Vice-Chair).
  - The board sees an expense only once it reaches them, and keeps seeing it afterwards. One the accountant declined never reaches them.
- **Away for the board:** Account → Away is now offered to the Board Chair and the Vice-Chair (`account.away`). The Chair's Away hands their queue, emails and tasks to the Vice-Chair (`boardCover` in `src/domain/notifications/recipients.ts`). Never nobody: if everyone is away, those who aren't conflicted.
- **Final approval charges the budget (FR-42, AC-73):**
  - A purchase request becomes Committed.
  - A claim gets its own spending entry (date of its latest receipt, payee, reference) and becomes Spent, so the ledger includes it without re-typing (AC-80).
  - A claim linked to a purchase request closes that request and releases its commitment (AC-67), including one the Church Administrator had started processing.
  - Remaining may go below zero (FR-43, AC-139); the over-budget emails come with step 7.
- **Test data:** two linked board members, Cleo Chair (Board Chair) and Vic Vice (Vice-Chair). End-to-end tests never set Cleo Away, because the board tests share one database; Away is covered by integration tests.

## Stage 3 step 6: processing and payment (6B.5, FR-42) (2026-10-16)

- **Pages:**
  - **Ready to process** (`/expenses/ready`, Church Administrator and accountant; the System Administrator reads only). Approved expenses, oldest final approval first, with payee, amount, days waiting, the requester's payment preference or how it's bought, and status. Each row has **Start processing** and **Record payment**. Above the list: what's waiting, the total, the amount owed to people, and the oldest. Below it: what was paid in the last 30 days.
  - **Record payment** (`/expenses/ready/{id}`). The DRD calls for a dialog. A page is used instead, because the form changes with the method and is long on a phone. The method is preselected from the requester's preference.
- **What each method needs (AC-76):**
  - Cheque: the cheque number and two different signers, both on the active signing-authorities list on the date paid. With fewer than two active, a cheque can't be recorded and the form says why (AC-135). Removed signers aren't offered, and their names stay on past payments (AC-134).
  - Church card: the last 4 digits, the transaction reference and who bought it.
  - Cash: who received it, and "Receipt signed".
  - E-transfer: the reference (the payee's address is shown).
  - Supplier invoice (EFT): the invoice number and the supplier. The supplier is stored in `purchased_by`.
  - Other: what it was.
  - Every method: the date paid (not in the future) and the amount paid. The amount defaults to the approved amount; a different amount needs a note.
  - The confirm button names the amount and method ("Record $168.00 paid by e-transfer").
- **Recording a payment finishes the expense:**
  - A claim becomes **Paid**. A church-card claim, where nothing was owed, becomes **Closed** straight away.
  - A purchase request becomes **Purchased**. Its commitment ends and its own spending entry is made, dated the day paid.
  - A claim's spending entry, made at final approval, gains the method and reference. If the amount paid differs, the entry takes the amount paid, so Spent is what was actually paid. Both changes are audited.
  - An Approved expense is put in Processing first, so **Start processing** is optional.
- **Not processed here:** a purchase request the requester buys themselves ("I'll buy it and submit a claim"). It stays Committed until their linked claim is approved, or until it's cancelled.
- **Nobody records a payment to themselves** (the payee check in `expense.pay`).

## Stage 3 step 7: expense emails, reminders and My tasks (FR-49, FR-37) (2026-10-16)

- **Every FR-49 event emails the people in its row** (`src/domain/expenses/emails.ts`, queued in the same transaction, sent after commit, with the expense linked on each outbox row).
  - "Requester" means the person who submitted it, plus the payee when that's someone else. The department's other leaders aren't copied: expenses are personal claims and purchases, unlike the department's one annual budget. They see them in My expenses.
  - "Board Chair" means whoever gives the final approval now: the Chair, or the Vice-Chair covering, whose email says why they're receiving it. The board's own decisions are copied to the person who made them.
  - The **Church Administrator** gets "Approved, ready for processing", except for a purchase the requester buys themselves, and a notice when an approved purchase request is cancelled.
  - **"Over budget after approval"** goes when the Board Chair's final approval takes the department below zero: a notice to the requester and alerts to the accountant and the Church Administrator. Stage 4 adds the once-per-cycle alerts of FR-28.
  - Amounts use the shared layout. Purchase requests show Subtotal / Sales tax / Total, and Requested against Approved after the final approval. Claims show **Total paid (incl. tax)** with no tax line, a new summary kind in the layout (their receipts include tax). The paid email adds the method, date and reference.
- **Reminders** (the daily `reminders` job):
  - Waiting for the Board Chair more than 7 days (`board_reminder_days`): each Board Chair, or Vice-Chair covering, gets a list of theirs, and the accountant a list of all.
  - Approved but not processed after 14 days: the accountant and the Church Administrator.
  - An approved purchase request the requester buys, not claimed after 60 days: the requester, and the Church Administrator a list.
  - Each repeats at most once a week while still waiting (a weekly dedupe key), so running the job twice sends nothing new.
- **My tasks** (`src/domain/tasks/expenses.ts`):
  - Department: drafts the person started, questions to answer, and approved purchases to buy and claim.
  - Accountant: expenses to review, not their own department, claim or payee.
  - Board: final approvals, the Vice-Chair only while covering.
  - Church Administrator and accountant: payments to record.
  - Each task leaves the list once the step is done (AC-109).

## Stage 3 step 8: the expense workbook (FR-50) (2026-10-16)

- **Where:** Reports → **Expenses and payments** (accountant, backup approver, Church Administrator; the System Administrator exports everything, AC-110). Filters: budget cycle, department, and an optional date range for payments. `GET /api/exports/expenses`, audited as `expenses.exported` with its filters.
- **Sheets:**
  - **Expenses**: one row per submitted expense with the FR-50 columns. Requested and approved subtotal, sales tax and total are separate. There's a Total row.
  - **Lines**: purchase request items and claim receipt lines.
  - **Receipts**: one link per file. The link goes to the app's checked route, never to the file (6B.9).
  - **Payments**: payments in the date range, with a Total row, for bank reconciliation.
  - **Budget**: each department's Available, Committed, Pending, Spent and Remaining for the cycle.
- **Approved amounts** in the export are only final approvals. An expense still waiting for the Board Chair shows its accountant's approval date but no approved total, matching AC-73.
- **Same rules as FR-20:** amounts are numbers in CAD format written from stored values (no formulas). Text that starts like a formula is prefixed with an apostrophe (AC-96). Links are http and https only. The church's logo sits at the top.
- **Budget vs Actual** (FR-20's spending workbook) gains Committed and Pending in Stage 4, with the spending dashboard. Until then, the Budget sheet here gives the same figures for expenses.
- The Reports page's "Coming in Stage 3" placeholder for expenses is replaced by the real card. With two downloads on the page, the annual e2e test now picks its button inside the annual card.

## Stage 3 step 9: finishing Part B (2026-10-16)

- **All expenses** (`/expenses/all`, accountant, backup approver, Church Administrator; the System Administrator reads only): every submitted expense, with search (reference, title, payee, department) and filters (department, type, status) kept in the address (FR-48). The navigation now offers it, and **Ready to process**, to backup approvers too, matching their permissions.
- **Spending ledger, read-only** (`/spending/ledger`): every spending entry of a cycle, including the ones made from approved claims and purchases, linked to their expense (AC-80). Spent leaves out voided entries and subtracts refunds. Recording, refunds, corrections and voids come with Stage 4, which builds on this page.
- **Global search** finds expenses by reference, title or department, each checked with the same rule as its page. A draft stays with its department.
- **Activity log:** every expense event has a plain-language label and group. Approvals, payments and the spending entries they make count as money changes. Each event links to its expense: the review screen for an accountant, the expense page for everyone else. The log's search matches expense references.
- **Help** (FR-36) and the **user manual** describe expenses for each role.
- **Not built in Stage 3:**
  - The Home "At a glance" cards, which are still the placeholder from Stage 1.
  - The Overview tab's expense charts, which join with Stage 4's spending charts.

## Stage 3 summary: acceptance criteria and where they're tested (2026-10-16)

| AC | Integration test | End-to-end test |
|---|---|---|
| AC-65 | expenses.test | expenses.spec |
| AC-66, AC-67 | expense-board.test | — |
| AC-68 | expenses.test | expenses.spec |
| AC-69 | expense-review.test | expense-review.spec |
| AC-70 | expenses.test, expense-review.test | expenses.spec, expense-more.spec |
| AC-71 | expenses.test, expense-review.test | expenses.spec |
| AC-72 | expense-review.test, expense-board.test | expense-review.spec |
| AC-73, AC-74 | expense-review.test, expense-board.test, expense-emails.test | expense-review.spec, expense-board.spec |
| AC-75 | expense-board.test | expense-board.spec |
| AC-76 | expense-payment.test | expense-payment.spec |
| AC-77 | expense-payment.test, expense-emails.test | expense-payment.spec |
| AC-78 | expenses.test | — |
| AC-79 | expense-emails.test | expense-more.spec |
| AC-80 | expense-board.test, expense-payment.test | expense-more.spec |
| AC-81 | expense-receipts.test | expenses.spec |
| AC-109 | expense-emails.test | expense-more.spec |
| AC-111 | expense-review.test, expense-board.test | — |
| AC-112 | expense-board.test | expense-board.spec |
| AC-134, AC-135 | expense-payment.test | admin.spec |
| AC-139 | expense-board.test | — |
| AC-140 | expense-review.test | — |



## Release now after the release time (FR-19a, AC-19) (2026-10-16)

- **Problem found:** once the release time passed, the page stopped offering **Release now** and **Cancel schedule**, but the held decisions weren't sent until the 15-minute `release-decisions` job ran. That job is called only by GitHub Actions, so on a local server it never runs, and in production it can lag by up to 15 minutes. The page listed the held decisions with no way to send them, and the past-time error still said "use Release now".
- **Fix:** Release now works whenever decisions are held, including after the release time. The page says the time has passed and how many haven't been sent, and offers Release now. With nothing held it's still refused. The past-time error now just asks for a future time. The Send immediately hint explains that each decision is emailed as it's confirmed, so there's nothing to release later.

## Department leaders receive every expense email (FR-49, AC-141) (2026-10-16)

- The church asked that every leader of a department (Primary, Backups and other representatives) receive the chain of emails the requester receives, so everyone is aware of purchases. This reverses the Stage 3 step 7 rule that copied only the submitter and the payee.
- "Requester" in FR-49 is now the submitter, the payee if different, and every department leader (`requesterGroup` in `src/domain/expenses/emails.ts`), each address once. It covers the receipt, updates, review started, questions, decisions, processing, payment, the over-budget notice and the unclaimed-purchase reminder.
- Leaders already received the annual budget emails (FR-21), so both parts now behave the same.

## The two expense approvals run side by side (6B.4, FR-45, FR-49; AC-142, AC-143) (2026-10-16)

The church asked that the "approval needed" email go to both approvers at the same time, not one after the other, and that the department and the Church Administrator hear only once both have approved.

- **Either order.** At submission the accountant and the Board Chair (or the Vice-Chair covering, 3.3) are both emailed **Approval needed**. Either may open it (which starts the review, FR-44) and decide first. The first approval moves it to **Awaiting Board Chair** or **Awaiting accountant** (a new status, migration `0019`); the second makes it **Approved** and charges the budget (FR-42, AC-73). One decision service serves both (`src/domain/expenses/approval.ts`).
- **The lower amount wins (AC-143).** Each approver approves as asked or a smaller amount, never more than asked. The Board Chair is no longer capped by the accountant's amount. When the second approval lands, the approved amount is the lower of the two, re-split into subtotal and tax as before (FR-16). Each decision keeps its own amount. The expense's `approved_total` holds the lowest so far, but the budget counts it only from Approved on.
- **Returns go to the department.** Either approver can return it with a question; the earlier approval is cleared, and both approve again after the department answers. "Return to accountant" is gone. Old `expenses.board_returned` events still read correctly in the activity log.
- **Emails.** After one approval only the approver gets a copy; "Approved by the accountant, waiting for the Board Chair" is no longer sent. After both, the department gets "Your expense has been approved", the Church Administrator "Approved, ready for processing", and both approvers a copy. Returns and declines copy both approvers. Updates before review and a withdrawal before review also reach the board.
- **Who sees what.** The board sees an expense from submission (never a draft). My tasks, the queues and the tracker show each level separately: the accountant's queue waits on Submitted, In Review and Awaiting accountant; the board's on Submitted, In Review and Awaiting Board Chair.

## FR-48: search and filters on every expense list (2026-10-16)

- **One filter set** (`src/domain/expenses/list-filters.ts`) for Review queue, Awaiting my approval, All expenses, My expenses and Ready to process: search (reference, title, payee, department), department, type, status, **submitted from/to** and **amount from/to**.
- Dates compare the day submitted in the church's time zone. The amount is the approved amount once there is one, otherwise the amount asked. Amounts are read as cents with `parseCAD`, never floats.
- The form is a plain GET, so filters stay in the address (DRD 6.0) and work without JavaScript. Anything that doesn't parse (a date like 2026-02-31, "abc" as an amount) is ignored rather than refused.

## Expense submitter permission (6B.2) (2026-10-16)

- **Model:** a new `expense_submitters` table (person, department, who added it, when; removals recorded with who and when, never deleted). Not a new role: the person holds the **Requester** role, so they're checked in Planning Center like every requester (Requirements 10.x "including Expense submitters"), and the System Administrator adds departments on their user page. Both changes are audited (`admin.expense_submitter_added`, `admin.expense_submitter_removed`).
- **What they can do:** start and submit expenses for the departments they're given, and see, change, withdraw and answer questions on what **they** submitted, nothing else of the department (no annual budget, no other people's expenses, no cancelling an approved purchase request, no spending). `authz.ts` has one rule, `submitsFor`, for `expense.submit` and `expense.view`.
- **Leaders still see everything** their department submits, and get its emails (AC-141), so a volunteer's claim is never hidden from the department.
- **Access:** being given a department lets a verified person who was waiting for one sign in (FR-01a). Removing the last one puts them back to waiting.
- **The Church Administrator submits on behalf of a department** (6B.2 table; confirmed by the church 2026-10-16) by being made an Expense submitter for it: the Requester role isn't needed for them. New expense and My expenses appear in their navigation. They never record the payment for an expense they submitted (`expense.pay` now refuses the submitter as well as the payee, FR-47); another payer does.

## Home: At a glance (FR-37, DRD 6.0) (2026-10-16)

- One card per role the person holds, each linking to its work (`src/domain/home/glance.ts`):
  - **Department leaders:** each department's budget for its latest year: the approved budget and what's left (or "Over budget by"), linking to My expenses.
  - **Accountant and backup approver:** "Waiting for your review": annual budgets in open cycles (Submitted, Updated, In Review) and expenses they may decide.
  - **Board Chair and Vice-Chair:** "Waiting for your approval": expenses they may decide now.
  - **Church Administrator:** "To pay": what's owed to people, with how many are ready to process.
  - **System Administrator:** proposed departments.
- The cards use the same read models as the screens they link to (the queues, Ready to process, the budget figures), so the numbers agree. Someone with no card-bearing role sees the empty state.

## Daily reminders for approvers after 5 days (FR-49, AC-144) (2026-10-16)

- The church asked that approvers who haven't approved within 5 days get a daily reminder. This replaces the weekly reminder to the Board Chair after 7 days (and its copy to the accountant).
- **Setting:** `approval_reminder_days` (5) replaces `board_reminder_days` (migration `0020`).
- **Who:** for every expense still waiting for an approval (Submitted, In Review, Awaiting Board Chair, Awaiting accountant) more than 5 days after it was last submitted or answered, the accountant gets one list of those waiting on them, and each Board Chair (or the Vice-Chair covering) one list of theirs. An approver who has approved stops getting it. A returned expense waits for the department, so it isn't included.
- **Once a day:** the daily `reminders` job sends them; the outbox dedupe key includes the person and the church-time date, so a second run the same day sends nothing new. The payment and unclaimed-purchase reminders stay weekly.

## Messages on expenses (6B.4) (2026-10-16)

- Each expense has a **Messages** thread on its page, the accountant's review screen and the Board Chair's decision screen, like annual budgets (FR-31): plain text up to 2,000 characters, links shown with their domain, 30 messages per person per day, append-only (`expense_messages`, database triggers), audited (`expenses.message_sent`).
- **Who writes:** the department (its leaders, and the person who submitted it), the accountant and backup approvers, the Board Chair (or Vice-Chair), and the Church Administrator. The System Administrator reads only. Not on a draft.
- **Who is emailed:** every other side, never the writer: the department (submitter, payee and leaders, AC-141), the accountant, the Board Chair (or Vice-Chair covering), and the Church Administrator once the expense is approved or being processed.
- A message never changes the expense; a change is still asked for with Return for clarification.
- **Not built:** unread counts on the lists (the annual thread has them, DRD 6.11a). The emails tell people there's a new message.

## Reopening an approved budget that expenses rely on (FR-18a) (2026-10-16)

- Reopening an approved annual budget takes away the department's Available for expenses until it's approved again (`approvedAnnualBudget` only counts an approved, released budget). So when expenses already rely on it (anything committed, spent, or waiting for approval for that department and year), the reopen dialog shows those amounts and the accountant must tick "I understand the new decision will change the department's available budget."
- The server enforces it: without `confirmExpenses`, `reopenRequest` refuses with the amounts. A declined budget, or one with no expenses, reopens as before.
- Nothing about the expenses changes on reopen: their approvals and spending stay, and the new annual decision sets the new Available. Remaining may then show Over budget, as FR-43 allows.

## Stage 4 steps 1–2: spending foundations and recording spending (FR-24, FR-25, FR-27, FR-28) (2026-10-16)

- **Data (migration `0023`):** `budget_amendments` (9.16: before tax, tax and total in cents, the rate, reason, optional board reference; append-only by trigger; amounts must reconcile and can't be zero). Spending entries gain `budget_line_item_id` (the approved line, FR-25 "General" when empty) and `unbudgeted`.
- **Budget figures:** Available = the approved total + every amendment, each part kept (`approved`, `amendments`, `available`). Percentage used is (Committed + Spent) ÷ Available in tenths of a percent with integer maths, rounded half-up (AC-83: 43.2%).
- **Recording** (Spending → Record spending; Church Administrator and accountant): choose the year and department first (the budget strip shows where it stands), then the FR-24 fields. Amounts are the amount paid including tax; no tax is added.
  - **Date:** within the cycle's spending period, the budget year (Jan 1–Dec 31 of `budget_year`) or to `spending_period_end` if set. The accountant can tick "Allow a date outside the spending period".
  - **Warnings the server raises, each confirmed with a box that appears only then:** a duplicate (same department, amount, date and reference, ignoring case), a department with no approved budget (saved as **Unbudgeted**), and an expense that takes Remaining below zero, which needs an **overspend note** (AC-85).
  - Line items offered are the department's approved lines for the year.
- **Correct and void** (open an entry from the ledger): a correction needs a reason and keeps the previous values in the audit event; a void needs a reason, stays visible as Voided and leaves Spent (AC-87). Nothing is deleted (database trigger). Entries made from approved expenses are changed through the expense, not here.
- **Locked periods (AC-90):** once a cycle's spending is locked, nothing is recorded, corrected or voided, by anyone; the accountant reopens it first (step 6).
- **Alerts (FR-28, AC-85, AC-86):** the first time a department reaches the near-limit threshold, and the first time it goes over budget, in a cycle, the accountant (or covering backup approvers) and the Church Administrator are emailed. "First" is the outbox's dedupe key per cycle, department and kind, so later entries never repeat it, and the emails are the notification log. Going over counts as reaching the limit (one email, not two). An expense's final approval checks near-limit only, since its own over-budget alert (FR-49) already goes out; a payment checks both.

## Stage 4 steps 3–4: spending dashboard, Budget vs actual and amendments (FR-25 to FR-27) (2026-10-16)

- **Spending dashboard** (`/spending`, accountant, backup approver, Church Administrator) and **Budget vs actual** (`/spending/budget-vs-actual`, the same view read-only for the Board Chair, Vice-Chair and System Administrator): totals (Available with Approved and Amendments, Spent with Committed, Remaining, Used), a warning line for each department nearing its limit or over budget (text and icon, never colour alone), and a table per department with approved, amendments, available, committed, spent, remaining ("Over budget by $X"), a used bar with its percentage, status and last entry date. Unbudgeted spending shows as a badge. Every figure is `budgetFigures`, so the dashboard, the export (step 7) and the Overview tab (step 8) agree.
- **Department drill-down** (`/spending/departments/{id}?cycle=`): the budget, the amendments with who and when, spending by approved line ("General" for unlinked entries), and a link to the department's ledger. Per-line approved amounts aren't shown: the stored line totals are before tax while spending includes it, so side by side they'd mislead.
- **Ledger filters (FR-26):** search (payee, description, reference), department, payment method, type, status, entered by, and a paid-from/to range, kept in the address. Refunds show an undo icon and −$X; voided entries are muted with the amount struck through (DRD 6.8).
- **Amendments (FR-27, DRD 6.9):** on the drill-down, accountant and backup approver only. Increase or Reduction, one amount including tax (the tax inside it is worked out at the request's snapshotted rate, as FR-16), a required reason and optional board reference, confirmed in a dialog that says the department will be emailed. A reduction that takes Remaining below zero needs a box ticked. Each amendment is a permanent record (`spending.budget_amended` audited with before and after); the approved total never changes (AC-84). The department's leaders are emailed the new available budget.
- **Not built:** the live "Remaining: before → after" line on the Record spending form (DRD 6.8). The server works it out on save and asks for the overspend note if needed.

## Stage 4 step 5: My department budget for requesters (FR-28, AC-89, DRD 6.2a) (2026-10-17)

- **Where:** `/spending/my-department` (every entry, with a Budget year picker) and a panel per department on the requester's `/annual` dashboard (the latest five entries, linking to the full page), as DRD 6.2 lists it. Both use the same component and `myDepartmentSpending`.
- **What:** for each department the person leads (Primary, Backup or Representative), the `budgetFigures` the dashboard uses: approved, amendments, available, committed, spent and remaining ("Over budget by $X"), the used bar with its status in words, and the entries: date, payee, description and amount. Refunds show −$X with a Refund badge; voided entries stay, struck through, with a Voided badge.
- **Hidden from requesters:** payment method, reference numbers, notes and who entered it are never selected by the query, so they can't reach the page. Departments the person doesn't lead are filtered on the server (AC-89).
- **Who:** the requester role only. Accountants, the board and the System Administrator use the dashboard or Budget vs actual; for them the page shows permission denied.
- **Empty state:** a department with no approved budget and no spending shows "Your budget will appear here once it's approved." One with Unbudgeted spending still shows its figures and entries.

## Stage 4 step 6: the year-end lock and carry-over (FR-29, FR-46, AC-90) (2026-10-17)

- **Where:** Spending dashboard → **Year-end** (`/spending/year-end?cycle=`), for the accountant and backup approvers (`spending.lock`). Anyone else gets permission denied. It opens on last year by default, since that's the year usually being closed.
- **Lock is refused until the year has settled.** Expenses still waiting for a decision (Submitted, In review, Returned, Awaiting either approver) and ones approved but not paid or bought (claims Approved or Processing, purchase requests Processing) are listed, and **Lock spending** only appears when both lists are empty; the server refuses too. Approving a claim or recording a payment adds to that year's ledger, which a lock must stop, so they have to be finished first. This choice keeps a locked year's money from changing behind the accountant's back.
- **Defence in depth:** a claim's final approval and a payment both check the lock before they write a spending entry (`assertSpendingOpen`), so a year locked by any route can't gain spending.
- **Locking** sets `spending_locked_at` and who did it, with the cycle's `version` checked; it's audited (`spending.period_locked`, listing the open purchase requests) and the Church Administrators are emailed. **Reopening** needs a reason, is audited with it (`spending.period_reopened`) and emails them too. New expenses for a locked year were already refused (Stage 3).
- **Carry-over (FR-46, migration `0024`):** after the lock, each approved purchase request not yet bought is listed to **cancel** (the existing cancel, on the expense page) or **carry into** next year with a required reason. Carrying over moves the expense's `budget_cycle_id` to next year's cycle and keeps `carried_over_from_cycle_id`, `carry_over_reason` and `carried_over_at`, so its commitment leaves the old year and counts against the new one. It stays Approved and keeps its EXP reference (the reference is from the year it was submitted). It needs the locked year, a cycle for the next budget year that isn't locked, and the department's approved, released budget in it, so the commitment never lands on a budget that doesn't exist. Audited (`expenses.carried_over`, before and after cycle, the amount); the department's leaders and the Church Administrators are emailed. The next year's Year-end page lists what was carried in, with the reasons.
- **E2E:** the shared FY2026 cycle is never locked in e2e (other tests record spending in it), so lock, reopen and carry-over are integration tests; e2e opens the page, checks axe at 360 and 1440 px, and that the Board Chair is refused.

## Stage 4 step 7: the spending workbook (FR-26 Export, AC-91) (2026-10-17)

- **Where:** **Export to Excel** on the Spending dashboard and Budget vs actual (the year shown), and a **Spending and budget vs actual** card on Reports (year and one department or all), replacing the "Coming in Stage 4" placeholder. `GET /api/exports/spending?cycle=&department=`, ids only. Who: `spending.export` (accountant, backup approvers, Church Administrator, System Administrator), as DRD 6.10 says the Church Administrator sees spending reports. The Board Chair and Vice-Chair read Budget vs actual on screen but don't export, as before.
- **One workbook, three sheets,** rather than a report-type picker: **Budget vs Actual** (approved, amendments, available, committed, spent, remaining, used, status, unbudgeted, last entry, and a Total row), **Ledger** (every entry with method and reference; refunds negative; voided entries listed with their amount but left out of the total, labelled so) and **Amendments** (before tax, tax, total, rate, reason, board reference, who).
- **To the cent (AC-91):** the rows and totals are `spendingDashboard`'s own, and the ledger is `getLedger` (with a new `all` option: the screen shows the latest 1,000, an export takes every row). One department's totals are summed in cents from its row. Values are written as numbers, never formulas; text goes through the formula guard (AC-96). Each export is audited (`spending.exported`) with its filters and row counts.

## Stage 4 step 8: spending and expense analytics on the Overview (FR-52, AC-127) (2026-10-17)

- **Who sees what (Requirements 3.6):** the Overview now has two halves under one Budget cycle filter. **Annual budgets** stays for those who review them (`annual.review`). **Spending and expenses** is for everyone who follows spending (`spending.view` without a department: accountant, backup approvers, Church Administrator, Board Chair, Vice-Chair, System Administrator). A requester still can't open Analytics & Audit (AC-128). Someone with neither half sees the note.
- **Headlines:** Available (with approved and amendments), Spent (with committed), Remaining ("Over budget by $X" when negative) and used, and Expenses waiting: for a decision (each counted once), for the accountant, for the Board Chair (both are asked at submission, so a new expense counts for each), for the requester, and to be paid or bought, with the average days from final approval to the payment date.
- **Same figures as the dashboard (AC-127):** budget figures are `spendingDashboard`'s own rows and totals, so the Overview, the Spending dashboard and the Budget vs Actual export agree to the cent (tested together).
- **Charts** (dataviz method, the existing `--chart-1` hue, no new palette):
  - **Budget used by department:** one series of bars. Over budget turns the bar to the danger colour *and* adds an icon and "Over by $X", never colour alone. Departments with no budget and no spending are left out. Each bar opens the department's spending page.
  - **Spending by month:** this year's net spending (refunds subtract, voids don't count) as columns, and last year's as a tick in ink, told apart by shape with a legend. Each month opens the ledger filtered to it.
  - **Expense pipeline:** count and amount at each status (drafts left out). Each row opens All expenses filtered to that status for those who can open it (not the board, which has no expense list).
  - Every chart has a "Show as a table" view and hover titles.
- **Export:** "Export spending to Excel" downloads the spending workbook (step 7) for those with `spending.export`; the board reads but doesn't export, as on Budget vs actual. A separate label from the annual "Export to Excel".
- **Not built:** the department, area and date-range filters FR-52 lists (one cycle filter covers the page), and turnaround by approval level with the slowest items for expenses (the annual list of budgets waiting longest stays).

## One annual budget per department: where an existing one opens (2026-10-17)

The church asked that once a department has a budget for the year, its other leaders can't submit another, only work on that one while it can change, and that picking a department with a budget already submitted leads them to it.

- **Already enforced** (rule 1, FR-32): one request per department per cycle, by the service and a unique index; **Submit annual budget** appears only for a department without one; a leader of several departments can start one for each that has none.
- **New: where it opens.** Picking a department that already has a budget on the start form says what that budget allows and opens it there: a **draft** or a **returned** budget opens in the editor (**Continue it**); a **submitted, updated or in-review** budget opens on its page (**Open it**), to review before using one of its two shared edits (Edit is one click away while edits are left); an **approved, declined or closed** budget opens on its page to view only. Opening a submitted budget on its page rather than in the editor keeps people from spending an edit by accident.
- The note on the form names the status and the edits left, or says a decided budget can't be changed.
- Picking a department still makes the person one of its leaders (FR-03, FR-38), so they can review it, as before.

## Expense form: longer reasons, attachments on purchase requests, a clearer layout (2026-10-17)

- **Why it's needed** on expenses now allows **4,000** characters (was 2,000). The column is unlimited text, so the only effect is longer review screens and emails, which wrap. The annual budget's justification is unchanged.
- **Attachments on purchase requests** (the church's decision): an optional quote, invoice or photo of what's being bought, through the same pipeline as claim receipts: private R2 storage behind a signed upload link, the file's real type read from its first bytes (JPG, PNG or PDF; HEIC converted in the browser), 10 MB each, up to 5, audited, never deleted (removed files are kept). Hard constraint 5 in CLAUDE.md now names them. They show on the expense page, the review screens and the Board Chair's screen when there are any; a claim always shows its receipts section.
- **Duplicate check (FR-47)** compares a claim's receipts with other **claims** only, so a purchase request's quote coming back as its claim's receipt isn't flagged.
- **Layout (DRD 6.9a):** the form is now numbered section cards, each with a coloured icon tile: 1 What and why, 2 Items or Receipts, 3 How it will be bought or Who gets paid, 4 Attachments or Receipt files; items and receipt lines are tinted, numbered cards; the actions sit on their own card; the summary card has an accent top edge and a larger total. The **budget strip** (also on My expenses, the expense page, review and Record spending) is now a card of coloured figure tiles with a usage bar; "Remaining after this" is outlined, red when over. Colour is never the only cue: every tile has its label, and over budget still reads "Over budget by $X".

## A hosted demo site for training (2026-10-17)

The church wants people to see how the app works, as each kind of staff and as a requester, without touching real budgets, while production runs. Decided: a hosted demo on free tiers (docs/demo-site.md).

- **Separate site, separate data:** a second Netlify site from this repository, its own Neon branch as the database, its own secrets, optionally its own R2 bucket. Email and Planning Center are the fakes the tests use, so nothing real is sent or read.
- **Sign-in as made-up people** reuses the test-only sign-in, which was refused on every deployed site. It's allowed on the demo only when all three hold: `DEMO_MODE=1`, "demo" as a word in the site's host, and the database carrying the `demo_instance` marker that only `scripts/demo-reset.mjs` writes. The marker is checked at every sign-in, so a stray `DEMO_MODE` on production still lets nobody in. Only the listed people can be chosen. On the demo, Planning Center and emailed-code sign-in are hidden.
- **Nightly reset** (`.github/workflows/demo-reset.yml`, 03:30 Winnipeg): wipe, migrate, seed, mark, then rebuild through a Netlify build hook so the demo follows `main` without spending build minutes on every push. The script refuses any database with data and no marker.
- **Banner:** "Demo site: made-up people and data, reset every night. No real emails are sent." on every page.
- **Locally:** `npm.cmd run dev:demo` runs the same thing at demo.localhost:3000.
- The fake identities and Planning Center directory are now imported as modules rather than read from disk, so a deployed build includes them.
- **Also fixed:** a requester's sidebar showed two items both called "My department's budget"; the Spending one is now **My department's spending**.
- **Test note:** with the demo banner in the app layout, Next.js sometimes streams the not-found page's `noindex` tag twice under the full e2e run (never alone, and not from the banner's own output, which is empty off the demo). Two identical tags still mean "don't index", so the test now checks that the tag is there rather than that there's exactly one.
