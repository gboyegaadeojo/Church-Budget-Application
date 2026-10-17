# Demo site

A second, hosted copy of the app where anyone with the link can try it as a department leader, the accountant, the Board Chair, the Church Administrator or the System Administrator, without touching the real budgets. It runs alongside production on free tiers.

## What it is

- **Same code, separate everything else.** A second Netlify site built from this repository, with its own database (a Neon branch), its own secrets and, optionally, its own file bucket. It never connects to production's database, Planning Center or email.
- **Made-up people.** The sign-in page lists the test people (Gina Admin, Sam Lee, Accountant Pat, Cleo Chair and others). Pick one to see the app as they would; sign out from the account menu to switch.
- **Nothing real goes out.** Emails are kept in a fake outbox, and Planning Center is the fake directory. A band on every page says it's the demo.
- **Fresh every night.** At 03:30 (Winnipeg) a GitHub Action wipes the demo database, migrates it, seeds it again and, if a build hook is set, rebuilds the demo from `main`.

## Why it can't affect production

Three locks, all needed before anyone can sign in as a made-up person:

1. `DEMO_MODE=1` is set on the demo site only.
2. The site's address must name it a demo (`demo` as a word in the host, such as `demo-ifc-budget.netlify.app`). Production's address doesn't.
3. The database must carry the demo marker (`demo_instance` in app settings), which only `scripts/demo-reset.mjs` writes. Production's database never has it, so even if `DEMO_MODE` were set there by mistake, demo sign-in would refuse. The reset script also refuses any database that has data but no marker, so it can't wipe production either.

Only the listed made-up people can be signed in as; nothing typed into the form is accepted.

## Set it up (about 20 minutes, all free)

1. **Database: a Neon branch.** In the Neon project, create a branch named `demo` from `main` (Branches → New branch). Copy its connection string (the direct one, not the pooled one). Neon's free plan includes branches; the demo's compute suspends when idle.
2. **Fill the database once.** Add the connection string as a GitHub secret named `DEMO_DATABASE_URL`, then run **Actions → Demo site reset → Run workflow**. It wipes the branch's copy of production data, seeds the made-up people and marks it as the demo.
   - The branch starts as a copy of production; the reset removes that copy. Run it before anyone opens the demo.
3. **Site: a second Netlify site.** Add new site → Import from GitHub → this repository → name it `demo-ifc-budget` (the name must contain `demo` as a word). Environment variables:

   | Name | Value |
   |---|---|
   | `DEMO_MODE` | `1` |
   | `DATABASE_URL` | the demo branch's connection string (pooled is fine here) |
   | `AUTH_URL` | `https://demo-ifc-budget.netlify.app` |
   | `AUTH_SECRET` | a new random value (`openssl rand -base64 32`), never production's |
   | `JOBS_SECRET` | a new random value |
   | `APP_TIMEZONE` | `America/Winnipeg` |
   | `R2_*` (optional) | a separate demo bucket's keys, so receipts and attachments can be tried. Without them, uploads say storage isn't set up. Never production's bucket. |

   Don't set any Planning Center, Resend or Google Drive variables on the demo.
4. **Save build minutes.** Netlify's free plan has 300 build minutes a month, shared by both sites. On the demo site, turn off automatic builds (Site configuration → Build & deploy → Stop builds), create a build hook (Build hooks → Add), and save its URL as the GitHub secret `NETLIFY_DEMO_BUILD_HOOK`. The nightly reset then rebuilds the demo once a day from `main`.
5. **Try it.** Open the demo address: the sign-in page shows **Try the app as someone** and the demo band. If it shows the normal sign-in instead, the database isn't marked: run the reset workflow again.

## Use it for training

A suggested walk-through, each step as a different person:

1. **Sam Lee** (department leader): Home, My department's budget, start an expense, see the budget strip.
2. **Accountant Pat**: Review dashboard, decide Sam's expense, Spending dashboard.
3. **Cleo Chair** (Board Chair): Awaiting my approval, give the second approval; Budget vs actual.
4. **Gina Admin** (every role): Ready to process, record the payment; Reports; Admin.

Anything people create stays until the nightly reset.

## On your own computer

`npm.cmd run dev:demo` runs the same demo locally at <http://demo.localhost:3000>, with an in-memory database that starts fresh each time. Use it to check the demo before deploying, or to present without internet.
