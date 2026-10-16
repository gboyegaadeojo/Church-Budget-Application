import { describe, expect, it } from "vitest";
import { isAccessDeniedReason } from "@/domain/users/access";
import { fakeSignInEnabled } from "@/lib/auth-mode";
import { isAuthorizedJobRequest } from "@/lib/jobs";
import { isPublicPath } from "@/proxy";

describe("fake sign-in can never reach a real site", () => {
  const local = { AUTH_FAKE_PROVIDERS: "1", AUTH_URL: "http://localhost:3100" };

  it("turns on only with the flag and a local AUTH_URL", () => {
    expect(fakeSignInEnabled(local)).toBe(true);
    expect(fakeSignInEnabled({ ...local, AUTH_URL: "http://127.0.0.1:3000" })).toBe(true);
  });

  it.each([
    [{ AUTH_URL: "http://localhost:3100" }],
    [{ ...local, AUTH_FAKE_PROVIDERS: "true" }],
    [{ ...local, AUTH_URL: "https://ifc-budget.netlify.app" }],
    [{ ...local, AUTH_URL: "http://localhost.evil.example" }],
    [{ ...local, AUTH_URL: undefined }],
    [{ ...local, NETLIFY: "true" }],
    [{ ...local, CONTEXT: "production" }],
    [{ ...local, CONTEXT: "deploy-preview" }],
  ])("stays off for %o", (env) => {
    expect(fakeSignInEnabled(env)).toBe(false);
  });
});

describe("proxy public paths", () => {
  it.each([
    "/sign-in",
    "/access-denied/waiting",
    "/api/auth/callback/planningcenter",
    "/api/jobs/pco-verify",
  ])("%s is open", (path) => expect(isPublicPath(path)).toBe(true));

  it.each(["/", "/annual", "/sign-in-later", "/api/other", "/access-deniedx"])(
    "%s needs a session",
    (path) => expect(isPublicPath(path)).toBe(false),
  );
});

describe("job requests", () => {
  const secret = "a-long-jobs-secret-value";
  const request = (authorization?: string) =>
    new Request("https://example.org/api/jobs/pco-verify", {
      method: "POST",
      headers: authorization ? { authorization } : {},
    });

  it("accepts the right bearer token", () => {
    expect(isAuthorizedJobRequest(request(`Bearer ${secret}`), secret)).toBe(true);
  });

  it.each([undefined, "Bearer wrong", `Basic ${secret}`, `Bearer ${secret}x`, `bearer ${secret}`])(
    "refuses %j",
    (header) => expect(isAuthorizedJobRequest(request(header), secret)).toBe(false),
  );

  it("refuses everything when no secret or a short one is configured", () => {
    expect(isAuthorizedJobRequest(request("Bearer "), undefined)).toBe(false);
    expect(isAuthorizedJobRequest(request("Bearer short"), "short")).toBe(false);
  });
});

describe("access-denied reasons", () => {
  it("knows the DRD 6.1a variants only", () => {
    expect(isAccessDeniedReason("waiting")).toBe(true);
    expect(isAccessDeniedReason("../admin")).toBe(false);
  });
});
