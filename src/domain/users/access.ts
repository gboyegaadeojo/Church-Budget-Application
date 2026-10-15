/** Access-denied screen variants (DRD 6.1a). The page lives at /access-denied/{reason}. */
export const ACCESS_DENIED_REASONS = [
  /** Google sign-in with no matching Planning Center person. */
  "not-found",
  /** Planning Center profile isn't marked as a Group Leader. */
  "not-leader",
  /** Was a Group Leader; Planning Center no longer confirms it. Drafts are kept. */
  "suspended",
  /** Verified, but no department assigned yet. Information, not an error. */
  "waiting",
  /** Planning Center can't be reached and the 72-hour grace period has passed. */
  "unavailable",
  /** Not on the allowlist, deactivated, or that sign-in method is turned off. */
  "not-allowed",
  /** A Planning Center account whose email belongs to an account it isn't linked to yet. */
  "link-required",
] as const;

export type AccessDeniedReason = (typeof ACCESS_DENIED_REASONS)[number];

export function isAccessDeniedReason(value: string): value is AccessDeniedReason {
  return (ACCESS_DENIED_REASONS as readonly string[]).includes(value);
}

/** How long a past verification stands in while Planning Center is down (FR-01a). */
export const PCO_GRACE_MS = 72 * 60 * 60 * 1000;
