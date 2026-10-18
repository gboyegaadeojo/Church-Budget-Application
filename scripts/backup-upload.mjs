/**
 * Uploads tonight's encrypted backup to the church's Google Drive folder and prunes old
 * ones (docs/backup-restore.md). Run by .github/workflows/backup.yml:
 *
 *   node scripts/backup-upload.mjs path/to/backup.dump.age
 *
 * Needs GDRIVE_FOLDER_ID, GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET and GDRIVE_REFRESH_TOKEN
 * (the drive.file scope, so the job only sees files it created). The file is already
 * encrypted with age; Drive never holds a readable copy.
 */
import { readFile, stat } from "node:fs/promises";
import { backupName, backupsToDelete } from "./backup-retention.mjs";

const { GDRIVE_FOLDER_ID, GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN } =
  process.env;
const file = process.argv[2];
if (
  !file ||
  !GDRIVE_FOLDER_ID ||
  !GDRIVE_CLIENT_ID ||
  !GDRIVE_CLIENT_SECRET ||
  !GDRIVE_REFRESH_TOKEN
) {
  console.error("Usage: node scripts/backup-upload.mjs <file>, with the GDRIVE_* variables set.");
  process.exit(1);
}

async function accessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GDRIVE_CLIENT_ID,
      client_secret: GDRIVE_CLIENT_SECRET,
      refresh_token: GDRIVE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(`Google sign-in failed: ${response.status}`);
  return (await response.json()).access_token;
}

async function drive(token, url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`Drive ${init.method ?? "GET"} failed: ${response.status}`);
  return response;
}

const now = new Date();
const token = await accessToken();
const bytes = await readFile(file);
const { size } = await stat(file);

// A resumable upload, so a large database still goes up in one request.
const start = await drive(
  token,
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "application/octet-stream",
      "X-Upload-Content-Length": String(size),
    },
    body: JSON.stringify({ name: backupName(now), parents: [GDRIVE_FOLDER_ID] }),
  },
);
const location = start.headers.get("location");
if (!location) throw new Error("Drive didn't return an upload address.");
const uploaded = await (
  await drive(token, location, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: bytes,
  })
).json();
console.log(`Uploaded ${uploaded.name} (${Math.round(size / 1024)} KB).`);

// Prune: only this job's backups in this folder are listed (drive.file scope).
const query = encodeURIComponent(
  `'${GDRIVE_FOLDER_ID}' in parents and name contains 'ifc-budget-' and trashed = false`,
);
const listed = await (
  await drive(
    token,
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,createdTime)&pageSize=1000`,
  )
).json();
const old = backupsToDelete(listed.files ?? [], now);
for (const f of old) {
  await drive(token, `https://www.googleapis.com/drive/v3/files/${f.id}`, { method: "DELETE" });
}
console.log(`Kept ${(listed.files ?? []).length - old.length} backups; removed ${old.length}.`);
