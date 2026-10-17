import { describe, expect, it } from "vitest";
import { isAccessDeniedReason } from "@/domain/users/access";
import { demoMode, fakeSignInEnabled } from "@/lib/auth-mode";
import { isAuthorizedJobRequest } from "@/lib/jobs";
import { isPublicPath, refusesFiles } from "@/proxy";

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

describe("the hosted demo (docs/demo-site.md)", () => {
  const demo = { DEMO_MODE: "1", AUTH_URL: "https://demo-ifc-budget.netlify.app", NETLIFY: "true" };

  it("turns on with DEMO_MODE=1 and a host that names the demo", () => {
    expect(demoMode(demo)).toBe(true);
    expect(fakeSignInEnabled(demo)).toBe(true);
    expect(demoMode({ ...demo, AUTH_URL: "https://ifc-budget-demo.netlify.app" })).toBe(true);
  });

  it.each([
    [{ ...demo, DEMO_MODE: "true" }],
    [{ ...demo, DEMO_MODE: undefined }],
    [{ ...demo, AUTH_URL: "https://ifc-budget.netlify.app" }],
    [{ ...demo, AUTH_URL: "https://demonstration.example.org" }],
    [{ ...demo, AUTH_URL: undefined }],
  ])("stays off for %o", (env) => {
    expect(demoMode(env)).toBe(false);
    expect(fakeSignInEnabled(env)).toBe(false);
  });
});

describe("proxy public paths", () => {
  it.each([
    "/sign-in",
    "/access-denied/waiting",
    "/privacy",
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

describe("no file uploads (FR-23, AC-25)", () => {
  const multipart = (path: string, parts: (form: FormData) => void) => {
    const form = new FormData();
    parts(form);
    return new Request(`http://localhost${path}`, { method: "POST", body: form });
  };

  it("AC-25 refuses a file in a form post, and any multipart body to an API route", async () => {
    expect(
      await refusesFiles(
        multipart("/annual/new", (f) => f.append("receipt", new Blob(["x"]), "receipt.pdf")),
      ),
    ).toBe(true);
    expect(await refusesFiles(multipart("/api/exports/annual", (f) => f.append("a", "b")))).toBe(
      true,
    );
  });

  it("FR-30 lets the logo through on Settings → Branding only", async () => {
    const logo = (path: string) =>
      multipart(path, (f) => f.append("logo", new Blob(["x"]), "logo.png"));
    expect(await refusesFiles(logo("/admin/settings/branding"))).toBe(false);
    expect(await refusesFiles(logo("/admin/settings"))).toBe(true);
    expect(await refusesFiles(logo("/admin/settings/branding/x"))).toBe(true);
  });

  it("lets ordinary forms and reads through", async () => {
    expect(await refusesFiles(multipart("/annual/new", (f) => f.append("title", "Mics")))).toBe(
      false,
    );
    expect(await refusesFiles(new Request("http://localhost/api/exports/annual"))).toBe(false);
    expect(
      await refusesFiles(
        new Request("http://localhost/x", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: "a=b",
        }),
      ),
    ).toBe(false);
  });
});
