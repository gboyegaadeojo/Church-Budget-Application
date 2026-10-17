import "server-only";
import { fakeSignInEnabled } from "./auth-mode";
import {
  FakePlanningCenterDirectory,
  HttpPlanningCenterDirectory,
  type FakeDirectoryData,
  type PlanningCenterDirectory,
} from "./pco";
// Bundled with the app, so the hosted demo has it too (docs/demo-site.md).
import fakeDirectory from "../../tests/fixtures/pco-directory.json";

/**
 * The Planning Center directory the app uses: the fake fixture when fake sign-in is on
 * (tests, local development, the demo site), otherwise the real API with the church's Personal Access
 * Token. Null when no token is configured; sign-in then treats Planning Center as down.
 */
export function getPlanningCenterDirectory(): PlanningCenterDirectory | null {
  if (fakeSignInEnabled()) {
    return new FakePlanningCenterDirectory(fakeDirectory as FakeDirectoryData);
  }
  const appId = process.env.PCO_APP_ID;
  const secret = process.env.PCO_PAT_SECRET;
  return appId && secret ? new HttpPlanningCenterDirectory({ appId, secret }) : null;
}
