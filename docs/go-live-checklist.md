# Go-Live Checklist

**Organization:** Immanuel Fellowship Church (IFC)
**Companion documents:** [Requirements](church-media-budget-requirements.md) (Section 21) · [User manual](user-manual.md) · [README](../README.md) · [Build guide](../CLAUDE.md)
**Rule:** free tiers only (Requirements 20.3). Free-tier limits change; confirm each one when signing up.

Everything below is created **under the church-owned Google account**, never a personal one (Requirements 20.5). Keep at least two people with access to each account, and store the logins in the church's password manager.

### What "church-owned Google account" means

It is one Google account that belongs to the church, not to a person, used only to own the app's services. If a volunteer leaves, the church still owns the hosting, database, email and code.

1. Create a new free Google account, for example `ifc.budgetapp@gmail.com` (or, if the church gets Google Workspace for Nonprofits, an address on the church domain).
2. Use it to sign up for GitHub, Netlify, Neon, Cloudflare and Google Cloud ("Sign in with Google"), and as the address the app sends email from.
3. Turn on 2-Step Verification with a church phone, and add two trusted people (for example G and the church administrator) as recovery contacts.
4. Keep the password and recovery codes in a shared church password manager or a sealed envelope in the church office.

This account is **not** used to sign in to the budget app itself. People sign in with their own Google, Planning Center or email address.

## 1. Accounts, tools and integrations

| # | Tool or account | Needed for | What to set up | Environment variables or secrets it feeds |
|---|---|---|---|---|
| 1 | **Church Google account** (Google Workspace for Nonprofits if the church is eligible, otherwise a regular Gmail account) | Owner of every other account; the address emails are sent from | Turn on 2-Step Verification. Pick the sender address (for example `budget@…` or the church Gmail). | `GMAIL_SENDER` |
| 2 | **GitHub** (private repository, Actions, secrets) | Code, CI on every PR, nightly backup job | Transfer the repository to a church-owned account or organization when ready. Add the secrets below under Settings → Secrets and variables → Actions. Turn on branch protection for `main` (CI must pass). | `JOBS_SECRET`, `APP_URL`, `DATABASE_URL` (backup), backup secrets (item 8) |
| 3 | **Netlify** (free plan) | Hosting the app | Import the GitHub repository; Next.js is detected automatically. Choose the site name (for example `ifc-budget.netlify.app`). Add every app environment variable. Create a second site or a branch deploy for **staging**. | All variables in CLAUDE.md; `AUTH_URL` = the site's https address |
| 4 | **Neon Postgres** (free plan) | Database | Create the project in the region closest to the church. Create a `staging` branch and use separate branches for CI tests. Use the pooled connection string for the app. | `DATABASE_URL` |
| 5 | **Google Cloud project** (free) | "Continue with Google" sign-in, and sending email through the Gmail API | (a) OAuth consent screen: **Internal** if using Workspace, otherwise **External** and then **Publish app (In production)**. Apps left in "Testing" lose their Gmail refresh token after 7 days. (b) OAuth client "Web application" with redirect URI `https://<site>/api/auth/callback/google` (add the staging address too). (c) Enable the **Gmail API**, then sign in once as the sender account to get a refresh token for the `gmail.send` scope. | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` |
| 6 | **Planning Center** (the church's existing account, free API) | "Continue with Planning Center" sign-in, the Group Leader check (FR-01a), and team mapping (FR-39) | G can create these. A Planning Center administrator: (a) at api.planningcenteronline.com → **OAuth applications**, registers the app with redirect URI `https://<site>/api/auth/callback/planningcenter` and the `people` scope; (b) on the same page creates a **Personal Access Token** from a church admin login that can see People, Services teams and Groups (the token acts as that person); (c) confirms the custom field and value (default "Ministry Leader" = "Yes", a Yes/No field; changeable in Settings → Planning Center); (d) notes which Services team, group or tag matches each department. | `PCO_CLIENT_ID`, `PCO_CLIENT_SECRET`, `PCO_APP_ID`, `PCO_PAT_SECRET` |
| 7 | **Cloudflare R2** (free tier, about 10 GB) | Receipt files on expense claims and the logo | Create a private bucket and an API token limited to that bucket. **Decide:** Cloudflare asks for a payment card on file to turn on R2, even though usage within the free tier costs nothing. If the church will not keep a card on file, record that in `docs/decisions.md` before Stage 3 so another free option can be chosen. | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` |
| 8 | **Google Drive folder** (in the church Google account) + an **encryption key** | Nightly encrypted database backups | Create a private folder "IFC Budget Backups". Create an encryption key pair (for example with `age`); put the public key in GitHub secrets and keep the private key offline with two administrators. Grant the backup job access with a refresh token for the `drive.file` scope. | Suggested names: `BACKUP_AGE_RECIPIENT`, `GDRIVE_FOLDER_ID`, `GDRIVE_REFRESH_TOKEN` (reuse `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET`) |
| 9 | **Brevo** (free, optional) | Email fallback if Gmail sending fails | Only if wanted: create an account with the church address and an SMTP key. | `BREVO_SMTP_USER`, `BREVO_SMTP_KEY` |
| 10 | **Scheduled jobs** | Sending the email outbox, decision release, reminders, nightly Planning Center check | See the warning below about GitHub Actions minutes. | `JOBS_SECRET` (shared by the scheduler and the app) |
| 11 | **Web address** (optional) | A friendlier address than `*.netlify.app` | Free: keep the Netlify subdomain. A custom domain costs about $15/year, so it needs the church's approval because of the free-tier rule. | `AUTH_URL`, `APP_URL` |
| 12 | **Uptime check** (optional, free) | An email to the administrators if the app is down | For example a free UptimeRobot monitor on the sign-in page. | None |

Also set in Netlify: `AUTH_SECRET` (a long random value) and `APP_TIMEZONE=America/Vancouver`.

### Warning: scheduled jobs and free GitHub Actions minutes

Private repositories get about 2,000 free Actions minutes a month, and every run counts as at least one minute. A job every 15 minutes uses about 2,900 minutes a month on its own, before CI and backups. Before launch, pick one:

- **Recommended:** run the 15-minute jobs as **Netlify Scheduled Functions** (included in the free plan) that call the same `/api/jobs/<name>` endpoints, and keep GitHub Actions for CI and the nightly backup.
- Or run the GitHub Actions schedule every 30 minutes and accept slower email retries and decision release.

Record the choice in `docs/decisions.md`.

## 2. Information the church provides

- [x] Department list (18 departments, Requirements FR-03). Representatives are **not** pre-loaded; leaders join by signing in and picking their department, or through Planning Center mapping
- [ ] For each department, the Planning Center team, group or tag it maps to, if any (FR-39)
- [x] The Planning Center custom field and accepted value for Group Leader: **"Ministry Leader" = "Yes"** (confirmed by G, 2026-10-15)
- [ ] Email addresses for the accountant, backup approver, Board Chair, Vice-Chair, Church Administrator, and two System Administrators. **Any email address works** (FR-01b); they sign in with Google, Planning Center, or an emailed code plus an authenticator app
- [ ] Cheque signing authorities' names (G). They are entered in Admin → Settings → Signing authorities and can be added or removed later (FR-53)
- [ ] Logo (PNG or SVG) and brand colour. G can change them any time in Admin → Settings → Branding (FR-30)
- [ ] FY2027 budget year dates, the first submission deadline, and the board-approved church total. The deadline can be changed later or extended for one department (Requirements 4.3)
- [ ] Privacy contact person for the privacy notice (FR-36)

## 3. Launch steps

1. [ ] All stage acceptance criteria pass in CI (Requirements Section 14), including axe accessibility checks.
2. [ ] Staging site works end to end with test data: sign in both ways, submit, approve, expense, pay, export.
3. [ ] Send a test email from the app and confirm it arrives in Gmail, Outlook and Apple Mail inboxes, not spam.
4. [ ] In Settings → Planning Center, **Test a person** for one Group Leader and one non-leader; run **Sync now** on one mapped department.
5. [ ] Run the backup job, then **restore it into a Neon branch** and open the app against it (AC-107).
6. [ ] Create the two System Administrators, then staff users and roles, paste the 18 departments, add signing authorities, create the FY2027 cycle, and set the tax rate (12%), branding, and email settings.
7. [ ] Pilot for one or two weeks with the accountant, Board Chair, Church Administrator and two departments; fix what they find.
8. [ ] Check the [user manual](user-manual.md) against the built app and link it from the Help page.
9. [ ] Open the budget cycle; the app emails every department representative.
10. [ ] After launch, check Reports → Analytics & Audit → Access weekly for failed sign-ins, departments without a backup, and mapping problems.

## 4. Who keeps what running

| Task | How often | Who |
|---|---|---|
| Check failed emails and retry | Weekly | System Administrator (Admin → Notifications & Audit) |
| Check backups arrived in Drive | Monthly | System Administrator |
| Test a restore | Once a year, before the budget cycle opens | System Administrator with the developer |
| Review users, roles, and Primary/Backup requesters | Before each budget cycle | System Administrator |
| Renew the Planning Center token if the person who created it leaves | When it happens | Planning Center administrator |
