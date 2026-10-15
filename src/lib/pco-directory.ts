import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fakeSignInEnabled } from "./auth-mode";
import {
  FakePlanningCenterDirectory,
  HttpPlanningCenterDirectory,
  type FakeDirectoryData,
  type PlanningCenterDirectory,
} from "./pco";

const FAKE_DIRECTORY_FILE = "tests/fixtures/pco-directory.json";

/**
 * The Planning Center directory the app uses: the fake fixture when fake sign-in is on
 * (tests, local development), otherwise the real API with the church's Personal Access
 * Token. Null when no token is configured; sign-in then treats Planning Center as down.
 */
export function getPlanningCenterDirectory(): PlanningCenterDirectory | null {
  if (fakeSignInEnabled()) {
    const file = path.resolve(process.cwd(), FAKE_DIRECTORY_FILE);
    return new FakePlanningCenterDirectory(
      JSON.parse(readFileSync(file, "utf8")) as FakeDirectoryData,
    );
  }
  const appId = process.env.PCO_APP_ID;
  const secret = process.env.PCO_PAT_SECRET;
  return appId && secret ? new HttpPlanningCenterDirectory({ appId, secret }) : null;
}
