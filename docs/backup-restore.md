# Backups and restoring

Every night the database is backed up, encrypted and stored in the church's Google Drive (Requirements 10.6, AC-107). This page explains how it works, how to set it up once, and how to restore.

## How it works

`.github/workflows/backup.yml` runs at about 04:00 (Winnipeg) every night:

1. **Dump** the production database with `pg_dump` (custom format).
2. **Test the restore:** load the dump into a throwaway Postgres inside the same job and compare the number of users, budgets, expenses and spending entries with production. If they differ, the job fails, so a backup that wouldn't restore is noticed the same night.
3. **Encrypt** it with [age](https://age-encryption.org). Only the church's private key, kept offline, can open it.
4. **Upload** it to the Drive folder as `ifc-budget-YYYY-MM-DD.dump.age`, then **prune**:
   - every nightly backup is kept for **35 days**;
   - the backup from the **1st of each month** is kept for **6 years** (the period CRA generally asks charities to keep financial records).

If the job fails, GitHub emails the repository's owner. Check **Actions → Nightly backup** for the reason. Until the secrets below are set, the job skips itself and says what's missing.

Receipt and attachment files live in Cloudflare R2, which keeps them durably; they aren't part of this backup. The database holds their names and storage keys.

## Set it up once (about 30 minutes)

You need the church Google account (go-live checklist items 1, 5 and 8).

1. **Encryption key.** On a trusted computer, install age and run `age-keygen -o ifc-budget-backup-key.txt`.
   - It prints a public key starting with `age1…`. Save it as the GitHub secret `BACKUP_AGE_RECIPIENT`.
   - The file holds the **private key**. Keep two copies offline (for example two USB drives held by two administrators). **Without it, no backup can be opened.** Never upload it anywhere.
2. **Drive folder.** In the church Google account, create a private folder "IFC Budget Backups". Its ID is the last part of its address (`drive.google.com/drive/folders/<ID>`). Save it as `GDRIVE_FOLDER_ID`.
3. **Google OAuth client** (go-live item 5). In the Google Cloud project: APIs & Services → enable the **Google Drive API**, then Credentials → Create OAuth client → **Web application**, with `https://developers.google.com/oauthplayground` as a redirect URI. Save the client ID and secret as `GDRIVE_CLIENT_ID` and `GDRIVE_CLIENT_SECRET`.
   - Publish the consent screen (**In production**), or the token below stops working after 7 days.
4. **Refresh token.** Open the [OAuth Playground](https://developers.google.com/oauthplayground), click the gear icon, tick "Use your own OAuth credentials" and paste the client ID and secret. Authorize the scope `https://www.googleapis.com/auth/drive.file` signed in as the church account, then exchange the code for tokens. Save the **refresh token** as `GDRIVE_REFRESH_TOKEN`.
   - `drive.file` only lets the job see files it created, so it can't read anything else in the church's Drive.
5. **Database.** Save production's direct (not pooled) Neon connection string as the GitHub secret `DATABASE_URL`.
6. **Try it.** Actions → Nightly backup → Run workflow. A file `ifc-budget-<today>.dump.age` appears in the folder.

## Restore (and the yearly restore test)

Do this for real after a disaster, and once a year as practice, into a **new Neon branch**, never over production.

1. Download the backup you want from the Drive folder.
2. Decrypt it on the trusted computer: `age --decrypt --identity ifc-budget-backup-key.txt --output backup.dump ifc-budget-2027-03-15.dump.age`
3. In Neon, create a new **empty** branch (or a new database) and copy its direct connection string.
4. Restore with the Postgres 17 tools: `pg_restore --no-owner --no-acl --exit-on-error --dbname="<connection string>" backup.dump`
5. Check it: run the app locally against it (`DATABASE_URL=<connection string> npm run dev`) and sign in, or count rows with `psql` (`select count(*) from budget_requests;`).
6. **To replace production after a disaster:** point Netlify's `DATABASE_URL` at the restored branch, redeploy, and tell the staff what time the backup was from. Anything entered after that time must be entered again.
7. Delete the decrypted `backup.dump` when you're done.

Record each practice restore (date, which backup, who, result) in `docs/decisions.md` so AC-107 has its evidence.
