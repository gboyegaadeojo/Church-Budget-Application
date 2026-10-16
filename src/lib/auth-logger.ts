/**
 * Auth.js error logging. A session cookie that can't be decrypted is an expected case,
 * not a fault: it happens after AUTH_SECRET changes (a rotation in production, or every
 * restart of the fake server, which makes a new secret) and Auth.js already treats the
 * visitor as signed out. It gets one quiet line instead of three error entries, which
 * the Next.js dev overlay would show as errors. Every other error is logged in full.
 */

type LoggedError = Error & { type?: string; cause?: unknown };

const UNREADABLE_SESSION = "JWTSessionError";

export const authLogger = {
  error(error: LoggedError) {
    const type = error.type ?? error.name;
    if (type === UNREADABLE_SESSION) {
      console.warn("[auth] A session cookie couldn't be read; treating the visitor as signed out.");
      return;
    }
    const cause = error.cause as { err?: unknown } | undefined;
    console.error(`[auth][error] ${type}: ${error.message}`, cause?.err ?? cause ?? "");
  },
};
