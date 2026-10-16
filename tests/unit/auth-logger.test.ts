import { afterEach, describe, expect, it, vi } from "vitest";
import { authLogger } from "@/lib/auth-logger";

const authError = (type: string, cause?: unknown) =>
  Object.assign(new Error("Read more at https://errors.authjs.dev"), { type, cause });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Auth.js logger", () => {
  it("treats an unreadable session cookie as signed out, with one quiet line", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    authLogger.error(
      authError("JWTSessionError", { err: new Error("no matching decryption secret") }),
    );
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("signed out");
  });

  it("logs every other error in full, with its cause", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("callback failed");
    authLogger.error(authError("CallbackRouteError", { err: cause }));
    expect(error).toHaveBeenCalledWith(expect.stringContaining("CallbackRouteError"), cause);
  });
});
