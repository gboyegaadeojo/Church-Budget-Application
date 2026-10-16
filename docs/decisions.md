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
