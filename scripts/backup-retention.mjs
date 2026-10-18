/**
 * Which backups to keep in the Drive folder (Requirements 10.6). Every nightly backup is
 * kept for 35 days; the one made on the 1st of each month is kept for 6 years, the period
 * CRA generally asks charities to keep financial records. Pure, so it's unit-tested.
 *
 * @param {{ id: string; name: string; createdTime: string }[]} files backups in the folder
 * @param {Date} now
 * @returns {{ id: string; name: string; createdTime: string }[]} the ones to delete
 */
export function backupsToDelete(files, now) {
  const DAY = 86_400_000;
  const dailyCutoff = now.getTime() - 35 * DAY;
  const monthly = new Date(now);
  monthly.setUTCFullYear(monthly.getUTCFullYear() - 6);
  return files.filter((file) => {
    const made = new Date(file.createdTime);
    if (Number.isNaN(made.getTime())) return false;
    if (made.getTime() >= dailyCutoff) return false;
    const firstOfMonth = made.getUTCDate() === 1;
    return !firstOfMonth || made.getTime() < monthly.getTime();
  });
}

/** The backup's file name: sortable, and never anything but the date. */
export function backupName(now) {
  return `ifc-budget-${now.toISOString().slice(0, 10)}.dump.age`;
}
