# Go-Live Checklist

**Organization:** Immanuel Fellowship Church (IFC)
**Companion documents:** [Requirements](church-media-budget-requirements.md) (Section 21) · [User manual](user-manual.md) · [README](../README.md) · [Build guide](../CLAUDE.md)
**Rule:** free tiers only (Requirements 20.3). Free-tier limits change; confirm each one when signing up.

Everything below is created **under the church-owned Google account**, never a personal one (Requirements 20.5). Keep at least two people with access to each account, and store the logins in the church's password manager.

### What "church-owned Google account" means

It is one Google account that belongs to the church, not to a person, used only to own the app's services. If a volunteer leaves, the church still owns the hosting, database, email and code.

1. Create a new free Google account, for example `ifc.budgetapp@gmail.com` (or, if the church gets Google Workspace for Nonprofits, an address on the church domain).
2. Use it to sign up for GitHub, Netlify, Neon, Cloudflare and Google Cloud ("Sign in with Google"), and to own the backup folder in Drive. Email is sent through the church's existing Resend account (item 9).
3. Turn on 2-Step Verification with a church phone, and add two trusted people (for example G and the church administrator) as recovery contacts.
4. Keep the password and recovery codes in a shared church password manager or a sealed envelope in the church office.

This account is **not** used to sign in to the budget app itself. People sign in with their own Planning Center login; the Church Administrator and System Administrators can also use an emailed code.

## 1. Accounts, tools and integrations

| # | Tool or account | Needed for | What to set up | Environment variables or secrets it feeds |
|---|---|---|---|---|
| 1 | **Church Google account** (Google Workspace for Nonprofits if the church is eligible, otherwise a regular Gmail account) | Owner of every other account and of the backup folder | Turn on 2-Step Verification. | None |
| 2 | **GitHub** (public repository, Actions, secrets) | Code, CI on every PR, nightly backup job | The repository is public (decided 2026-10-18), which keeps Actions minutes free; no secrets are in the code. Transfer it to a church-owned account or organization when ready. Add the secrets below under Settings → Secrets and variables → Actions. Turn on branch protection for `main` (CI must pass). | `JOBS_SECRET`, `APP_URL`, `DATABASE_URL` (backup), backup secrets (item 8) |
| 3 | **Netlify** (free plan), or **Vercel** ([docs/vercel.md](vercel.md)) | Hosting the app | Import the GitHub repository; Next.js is detected automatically. Choose the site name (for example `ifc-budget.netlify.app`). Add every app environment variable. Create a second site or a branch deploy for **staging**. The build settings come from `netlify.toml`: production deploys migrate the database after building. Scope `DATABASE_URL` to the **Production** context, and give deploy previews and branch deploys the staging branch's address (or turn deploy previews off), so a preview never touches real data. | All variables in CLAUDE.md; `AUTH_URL` = the site's https address; `DATABASE_URL_UNPOOLED` (Neon's direct connection, optional, for migrations); `FIRST_ADMIN_EMAIL` (launch step 6) |
| 4 | **Neon Postgres** (free plan) | Database | Create the project in **AWS US East (Ohio)**, the same region as Netlify's default server region, so the database is close to the app. Set compute autoscaling to a maximum of **0.25 CU** (Branches → main → Computes → Edit) so the free plan's compute hours last the month. Create a `staging` branch and use separate branches for CI tests. Use the pooled connection string for the app. | `DATABASE_URL` |
| 5 | **Google Cloud project** (free) | Drive access for the nightly backup only. The app has no Google sign-in (decided 2026-10-15). | (a) OAuth consent screen: **Internal** if using Workspace, otherwise **External** and then **Publish app (In production)**. Apps left in "Testing" lose their refresh tokens after 7 days, which would stop the backups. (b) An OAuth client for the backup job (item 8). | `GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET` |
| 6 | **Planning Center** (the church's existing account, free API) | "Continue with Planning Center" sign-in, the Group Leader check (FR-01a), and team mapping (FR-39) | G can create these. A Planning Center administrator: (a) at api.planningcenteronline.com → **OAuth applications**, registers the app with redirect URI `https://<site>/api/auth/callback/planningcenter` and the `people` scope; (b) on the same page creates a **Personal Access Token** from a church admin login that can see People, Services teams and Groups (the token acts as that person); (c) confirms the custom field and value (default "Ministry Leader" = "Yes", a Yes/No field; changeable in Settings → Planning Center); (d) notes which Services team, group or tag matches each department. | `PCO_CLIENT_ID`, `PCO_CLIENT_SECRET`, `PCO_APP_ID`, `PCO_PAT_SECRET` |
| 7 | **Cloudflare R2** (free tier, about 10 GB) | Receipt files on expense claims and attachments on purchase requests (the logo is kept in the database) | Create a private bucket and an API token limited to that bucket (Object Read & Write). Add a CORS rule to the bucket allowing the app's address (e.g. `https://budget.example.org`) to `PUT` and `GET` with the `Content-Type` header: receipts upload straight from the browser. **Payment card:** Cloudflare asks for a card on file to turn on R2, even though usage within the free tier costs nothing. The app stores receipts in R2, so the church needs to agree to keep a card on file. | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` |
| 8 | **Google Drive folder** (in the church Google account) + an **encryption key** | Nightly encrypted database backups | Create a private folder "IFC Budget Backups". Create an encryption key pair (for example with `age`); put the public key in GitHub secrets and keep the private key offline with two administrators. Grant the backup job access: sign in once as the church Google account with the backup OAuth client (item 5) to get a refresh token for the `drive.file` scope. Step-by-step: [backup-restore.md](backup-restore.md). | Suggested names: `BACKUP_AGE_RECIPIENT`, `GDRIVE_FOLDER_ID`, `GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET`, `GDRIVE_REFRESH_TOKEN` |
| 9 | **Resend** (free; the church's existing account) | Sending every email the app sends | In the church's existing Resend account, reuse its verified domain (the free plan allows one) or verify one, then create an API key with **Sending access** only for this app. Choose a From address on that domain with a name, for example `IFC Budget <budget@<church-domain>>`. Turn off click and open tracking for the domain. The free plan's 3,000 emails a month and 100 a day are shared with the church's other Resend apps. Then run the [deliverability test](email-deliverability.md). | `RESEND_API_KEY`, `RESEND_FROM` |
| 10 | **Scheduled jobs** | Sending the email outbox, decision release, reminders, nightly Planning Center check | See the warning below about GitHub Actions minutes. | `JOBS_SECRET` (shared by the scheduler and the app) |
| 11 | **Web address** (recommended) | A friendlier address than `*.netlify.app` | Free: a **subdomain of the church's own domain**, for example `budget.ifcwpg.com` (and `budget-staging.ifcwpg.com` for staging). Whoever manages the church domain's DNS adds a `CNAME` record from `budget` to the Netlify site's `*.netlify.app` address; then add it in Netlify → Domain management, which turns on HTTPS by itself. Only buying a new domain costs money (about $15/year). After the change, update `AUTH_URL` and `APP_URL`, the Planning Center redirect URI (item 6) and the R2 CORS rule (item 7). | `AUTH_URL`, `APP_URL` |
| 11a | **Phone alerts** (web push, free, no account) | The installed app's alerts on phones and computers (docs/decisions.md 2026-10-22) | Run `npx web-push generate-vapid-keys` once and add the two keys to Netlify, one pair per site (staging and live). Set `VAPID_SUBJECT` to `mailto:` plus the church's contact address. Keep the private key secret; changing the keys later means everyone turns alerts on again. Without them the app still installs and the Get the app page says alerts aren't set up. | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| 12 | **Uptime check** (optional, free) | An email to the administrators if the app is down | For example a free UptimeRobot monitor on the sign-in page. | None |
| 13 | **Twilio** (pay-as-you-go, **paid**: about CA$5-8 a month for 300 texts; approved 2026-10-18) | Reminder texts beside the deadline, approval, payment and unclaimed-purchase reminder emails | Create a Twilio account in the church's name, upgrade from the trial (a trial only texts numbers verified by hand), add a payment method and turn on low-balance auto-recharge or an alert. Buy one **Canadian local number** (Manitoba area code; Canadian long codes need no US A2P 10DLC registration) with SMS. Under Messaging → Settings → Geo permissions, allow only Canada and the United States. Leave Twilio's built-in STOP handling on. In the app, Admin → Settings → Reminder texts shows **Connected** and the monthly limit (default 300). Ask leaders to keep their mobile number in Planning Center up to date. | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (the number, e.g. `+12045550000`) |

Also set in Netlify: `AUTH_SECRET` (a long random value) and `APP_TIMEZONE=America/Winnipeg`.

### Scheduled jobs and GitHub Actions minutes

Private repositories get about 2,000 free Actions minutes a month, and a job every 15 minutes would use about 2,900 on its own. Two decisions keep this free:

- The frequent job runs **hourly** as a **Netlify Scheduled Function** (included in the free plan), not in GitHub Actions. It was every 15 minutes until 2026-10-20; hourly keeps the database's free compute allowance safe (docs/decisions.md).
- The repository is **public** (2026-10-18): public repositories get unlimited free minutes for CI and the nightly jobs. If it is ever made private again, CI (about 5 minutes per pull request) and the three nightly workflows fit within 2,000 minutes only with care.

**Chosen (step 7a): Netlify Scheduled Functions.** `netlify/functions/send-outbox.mts` runs every hour on the free plan (it also sends reminder texts held overnight, from 9:00 a.m.). It needs `JOBS_SECRET` set in Netlify; Netlify provides `URL` itself. GitHub Actions runs only the nightly jobs (Planning Center check, deadline reminders and the failed-email digest, and an outbox backstop), which need the `APP_URL` and `JOBS_SECRET` repository secrets.

## 2. Information the church provides

- [x] Department list (18 departments, Requirements FR-03). Representatives are **not** pre-loaded; leaders join by signing in and picking their department, or through Planning Center mapping
- [ ] For each department, the Planning Center team, group or tag it maps to, if any (FR-39)
- [x] The Planning Center custom field and accepted value for Group Leader: **"Ministry Leader" = "Yes"** (confirmed by G, 2026-10-15)
- [ ] A **"Ministry Department"** People custom field in Planning Center, ideally checkboxes whose options match the app's department names (a different name can be set per department in Admin → Departments → Planning Center value). Choose Suggest or Restrict in Settings → Planning Center
- [ ] Who holds each staff role: accountant, backup approver, Board Chair, Vice-Chair, Church Administrator, and two System Administrators. Add staff from Admin → Users & Roles → Add a staff member → Find them in Planning Center, which links them so they can sign in straight away; staff who sign in first wait under Needs attention for their roles. Someone not in Planning Center is added by email and signs in with an emailed code (FR-01b)
- [x] Cheque signing authorities' names (G). They are entered in Admin → Settings → Signing authorities and can be added or removed later (FR-53)
- [x] Logo (PNG or SVG) and brand colour. G can change them any time in Admin → Settings → Branding (FR-30)
- [ ] FY2027 budget year dates, the first submission deadline, and the board-approved church total. The deadline can be changed later or extended for one department (Requirements 4.3)
- [ ] Privacy contact person for the privacy notice (FR-36). Their address goes in Admin → Settings → "Contact email on access screens", which the notice shows
- [ ] **The church reviews the privacy notice** (`/privacy`, text in `src/copy/help.ts`) before launch: retention (at least six years, per CRA), the service providers named and where they store data, and the 30-day reply to access requests. It was written from what the app stores, not by a lawyer

## 3. Launch steps

1. [ ] All stage acceptance criteria pass in CI (Requirements Section 14), including axe accessibility checks.
2. [ ] Staging site works end to end with test data: sign in both ways, submit, approve, expense, pay, export.
3. [ ] Run the [email deliverability test](email-deliverability.md): Admin → Notifications & Audit → **Send a test email** to Gmail, Outlook and Apple Mail addresses and to mail-tester.com, and confirm each lands in the inbox, not spam.
   - [ ] Run the [phone check](phone-check.md) on one iPhone and one Android phone.
4. [ ] In Settings → Planning Center, **Test a person** for one Group Leader and one non-leader; run **Sync now** on one mapped department.
5. [ ] Run the backup job (Actions → Nightly backup), then **restore it into a Neon branch** and open the app against it (AC-107), following [backup-restore.md](backup-restore.md).
6. [ ] **The first System Administrator:** set `FIRST_ADMIN_EMAIL` in Netlify to their address (and `FIRST_ADMIN_NAME` to their name as it should show in the app) and redeploy. On the sign-in page they choose **Continue with email** and enter that address; while the app has no System Administrator, that makes them one and emails the code. Once any System Administrator exists, the variable does nothing (it can stay set). Then create the second System Administrator in Admin → Users & Roles, then staff users and roles, choose the Primary accountant (Settings → Accountants), paste the 18 departments, add at least two signing authorities, create the FY2027 cycle, and set the tax rate (12%), branding, and email settings.
7. [ ] Pilot for one or two weeks on staging with the accountant, Board Chair, Church Administrator and two departments; fix what they find. The scenarios, how to record findings and when it's finished are in the [pilot plan](pilot-plan.md).
8. [x] Check the [user manual](user-manual.md) against the built app and link it from the Help page (done 2026-10-18; check again after the pilot's fixes).
9. [ ] Open the budget cycle; the app emails every department representative.
10. [ ] Optional: set up the [demo site](demo-site.md) for training (a Neon branch, a second Netlify site with `DEMO_MODE=1`, and the GitHub secrets `DEMO_DATABASE_URL` and `NETLIFY_DEMO_BUILD_HOOK`).
11. [ ] After launch, check Reports → Analytics & Audit → Access weekly for failed sign-ins, departments without a backup, and mapping problems.

## 4. Who keeps what running

| Task | How often | Who |
|---|---|---|
| Check failed emails and retry | Weekly | System Administrator (Admin → Notifications & Audit) |
| Check backups arrived in Drive | Monthly | System Administrator |
| Check the Twilio balance and the texts sent this month (Admin → Settings → Reminder texts) | Monthly | System Administrator |
| Send a test email to a Gmail and an Outlook address and check it lands in the inbox | Before each budget cycle opens | System Administrator |
| Test a restore | Once a year, before the budget cycle opens | System Administrator with the developer |
| Review users, roles, and Primary/Backup requesters | Before each budget cycle | System Administrator |
| Renew the Planning Center token if the person who created it leaves | When it happens | Planning Center administrator |
