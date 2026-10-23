# Hosting on Vercel

The app runs on Netlify or Vercel from the same code. This page moves a site from Netlify to Vercel. Nothing else changes: the same Neon database, Resend, R2, Planning Center, backups and GitHub nightly jobs.

## Before you start: is the free plan allowed?

Vercel's free **Hobby** plan is for "non-commercial personal use only" ([fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage)). Commercial use means making money from the site (payments, ads, being paid to build or host it). The church budget app does none of that, but it is used by an organisation rather than one person, so it is a grey area. **Ask Vercel support before moving the live site** (vercel.com/help), and keep their answer with the church's records. If they say it needs **Pro** (about US$20 a month), that is a paid service and needs the church's approval first (CLAUDE.md, constraint 1).

Other Hobby limits that matter here, all comfortably above what the church uses: 1,000,000 function calls and 4 hours of active CPU a month, one server region, and scheduled jobs at most once a day (the hourly jobs run from GitHub instead, below).

## What the code already does for Vercel

- **`vercel.json`**: builds with `npm run build`, then brings the database up to date on **production** deploys only (`scripts/migrate.mjs --production-only`). A failed migration fails the deploy, so the previous version stays live. Only the `main` branch builds (`ignoreCommand`), so every merged pull request goes live on its own; every other branch and pull request is skipped, so nothing else builds against the live database. Keep Branch Tracking (step 2) on `main` to match.
- **Server region `cle1` (Cleveland)**: next to the Neon database in AWS US East (Ohio). Vercel's default is Washington, which is slower to the database.
- **Node 22** from `package.json` `engines`.
- **Hourly jobs** (decision release, email outbox, phone alerts): `.github/workflows/hourly.yml`, switched on by a repository variable. On Netlify, `netlify/functions/send-outbox.mts` does this instead and Vercel ignores it.
- **Fake sign-in refuses to run on Vercel** (`VERCEL` is set on every Vercel build), as it already did on Netlify.

## Moving a site, step by step

Do **staging** first, try it, then the live site. Each step is in the Vercel or GitHub dashboard; nothing needs installing.

1. **Create the project.** vercel.com → sign in with the church's GitHub account → **Add New → Project** → import `Church-Budget-Application`. Framework: Next.js (detected). Leave the build settings alone: they come from `vercel.json`.
2. **Production branch.** Project → **Settings → Environments → Production** → Branch Tracking: `main`. Merging a pull request is what puts it live (docs/decisions.md, 2026-10-23).
3. **Environment variables.** Settings → **Environment Variables**, scoped to **Production** only. Copy every value from the Netlify site (Site configuration → Environment variables): `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, `AUTH_URL`, `PCO_CLIENT_ID`, `PCO_CLIENT_SECRET`, `PCO_APP_ID`, `PCO_PAT_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `JOBS_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `APP_TIMEZONE`, and `TWILIO_*` once texts are on. Mark the keys and secrets **Sensitive**. Keep the same `AUTH_SECRET`, `JOBS_SECRET` and VAPID keys, so nobody is signed out and phone alerts keep working.
4. **Deploy.** Deployments → **Redeploy** the latest `main` build (or merge a pull request). The build log ends with "Database is up to date".
5. **Try it on the Vercel address** (`<project>.vercel.app`): for this test only, set `AUTH_URL` to that address and add `https://<project>.vercel.app/api/auth/callback/planningcenter` to the Planning Center OAuth app's redirect URIs. Sign in both ways, open a receipt, and check Admin → Settings → Texts and alerts shows **Alert keys: Set up**.
6. **Receipts (R2 CORS).** In Cloudflare R2 → the bucket → Settings → CORS, add the Vercel address beside the existing ones so receipt uploads work during the test.
7. **Move the web address.** Vercel → Settings → **Domains** → add `budget.ifcwpg.com`. Vercel shows the DNS record to set; at Squarespace (where the church's DNS is), change the `budget` CNAME from `ifc-budget.netlify.app` to the value Vercel gives (usually `cname.vercel-dns.com`). Vercel issues the certificate itself. Then set `AUTH_URL` back to `https://budget.ifcwpg.com` and redeploy.
8. **Hourly jobs.** GitHub → the repository → Settings → Secrets and variables → Actions → **Variables** → New variable `HOURLY_JOBS_FROM_GITHUB` = `true`. Then Actions → **Hourly jobs** → Run workflow once to check it's green. `APP_URL` stays `https://budget.ifcwpg.com`.
9. **Turn Netlify off** once the address points to Vercel: on the Netlify site, **Site configuration → Build & deploy → Stop builds**, and delete its scheduled function by deleting the site when you're sure (its hourly job would otherwise keep calling the app). Remove the Netlify address from R2 CORS and the Planning Center redirect URIs.
10. **Demo site (optional).** A Vercel **Deploy Hook** (Settings → Git → Deploy Hooks) replaces the Netlify build hook: save its URL as the GitHub secret `DEMO_BUILD_HOOK`.

## Going back

Point the `budget` CNAME back at Netlify, start Netlify's builds again and set `HOURLY_JOBS_FROM_GITHUB` to `false`. Both hosts use the same database, so nothing is lost either way.
