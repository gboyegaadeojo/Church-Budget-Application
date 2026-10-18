import { describe, expect, it } from "vitest";
import { backupName, backupsToDelete } from "../../scripts/backup-retention.mjs";

/** Which nightly backups the Drive folder keeps (Requirements 10.6, docs/backup-restore.md). */

const NOW = new Date("2027-03-15T09:00:00Z");
const made = (iso: string) => ({ id: iso, name: `ifc-budget-${iso}.dump.age`, createdTime: iso });

describe("backup retention", () => {
  it("keeps every backup from the last 35 days", () => {
    const files = [made("2027-03-14T09:00:00Z"), made("2027-02-09T09:00:00Z")];
    expect(backupsToDelete(files, NOW)).toEqual([]);
  });

  it("removes older daily backups but keeps the 1st of each month for 6 years", () => {
    const old = made("2027-01-20T09:00:00Z");
    const monthly = made("2023-06-01T09:00:00Z");
    const tooOld = made("2021-02-01T09:00:00Z");
    expect(backupsToDelete([old, monthly, tooOld], NOW)).toEqual([old, tooOld]);
  });

  it("never deletes something it can't date", () => {
    expect(backupsToDelete([{ id: "x", name: "x", createdTime: "nonsense" }], NOW)).toEqual([]);
  });

  it("names backups by date only", () => {
    expect(backupName(NOW)).toBe("ifc-budget-2027-03-15.dump.age");
  });
});
