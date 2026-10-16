import NextAuth, { CredentialsSignin, type NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import { getDb } from "@/db";
import { checkEmailCode, type CodeCheckResult } from "@/domain/users/email-sign-in";
import { resolveSignIn, type ExternalIdentity } from "@/domain/users/sign-in";
import { authLogger } from "@/lib/auth-logger";
import { sendOutboxAfterResponse } from "@/lib/email";
import { trackQueuedEmails } from "@/lib/email/outbox";
import { writeAudit } from "@/lib/audit";
import { fakeSignInEnabled } from "@/lib/auth-mode";
import { rememberDeniedEmail } from "@/lib/denied-email";
import { getPlanningCenterDirectory } from "@/lib/pco-directory";
import { requestIpHash } from "@/lib/request-ip";

/**
 * One sign-in for every role (FR-01, FR-01a, FR-01b, FR-37): Planning Center for
 * everyone, and an emailed code for the Church Administrator and System Administrators,
 * who may not be in the church's Planning Center. There is no Google sign-in (decided
 * 2026-10-15, docs/decisions.md). Auth.js verifies Planning Center's signed ID token
 * (issuer, audience, signature, expiry: Requirements 10.1); then
 * `resolveSignIn` decides who gets in. The session is a signed, encrypted cookie that
 * holds only our user id; roles are read from the database on every request.
 */

declare module "next-auth" {
  interface Session {
    user: { id: string };
  }
  interface User {
    /** Our users.id, set once resolveSignIn accepts the identity. */
    appUserId?: string;
  }
}

/** Planning Center's OpenID Connect provider ("Log in with Planning Center"). */
function PlanningCenter(clientId: string, clientSecret: string): Provider {
  return {
    id: "planningcenter",
    name: "Planning Center",
    type: "oidc",
    issuer: "https://api.planningcenteronline.com",
    clientId,
    clientSecret,
    client: { token_endpoint_auth_method: "client_secret_post" },
    authorization: { params: { scope: "openid people" } },
    checks: ["pkce", "state", "nonce"],
    profile(profile) {
      return {
        id: String(profile.sub),
        name: typeof profile.name === "string" ? profile.name : null,
        email: typeof profile.email === "string" ? profile.email : null,
      };
    },
  };
}

/** Test-only sign-in as any identity (see src/lib/auth-mode.ts). */
const FakeProvider = Credentials({
  id: "fake",
  name: "Test sign-in",
  credentials: {
    provider: {},
    subject: {},
    email: {},
    name: {},
    organizationId: {},
  },
  authorize: async (c) => {
    const subject = typeof c.subject === "string" ? c.subject : "";
    if (!subject) return null;
    return { id: `fake-${subject}`, email: String(c.email ?? ""), name: String(c.name ?? "") };
  },
});

/** Why an emailed code didn't sign the person in, for the sign-in form to explain. */
export class EmailCodeError extends CredentialsSignin {
  constructor(readonly result: Exclude<CodeCheckResult, { ok: true }>) {
    super();
    this.code = result.reason;
  }
}

/**
 * "Continue with email" (FR-01b). The code is checked, and a wrong try counted, in its
 * own transaction; the signIn callback then treats the proved address like any sign-in.
 */
const EmailCodeProvider = Credentials({
  id: "email-code",
  name: "Email code",
  credentials: { email: {}, code: {} },
  authorize: async (c) => {
    const secret = process.env.AUTH_SECRET;
    if (!secret) return null;
    const deps = { now: new Date(), secret, requestIpHash: await requestIpHash() };
    const input = { email: String(c.email ?? ""), code: String(c.code ?? "") };
    const result = await getDb().transaction((tx) => checkEmailCode(tx, deps, input));
    if (!result.ok) throw new EmailCodeError(result);
    return { id: `email:${result.email}`, email: result.email };
  },
});

function providers(): Provider[] {
  const list: Provider[] = [];
  if (process.env.PCO_CLIENT_ID && process.env.PCO_CLIENT_SECRET) {
    list.push(PlanningCenter(process.env.PCO_CLIENT_ID, process.env.PCO_CLIENT_SECRET));
  }
  // Always present; "Allow email sign-in" in Settings decides whether it's used.
  list.push(EmailCodeProvider);
  if (fakeSignInEnabled()) list.push(FakeProvider);
  return list;
}

/** Turns what the provider returned into the identity resolveSignIn checks. */
function toIdentity(params: {
  account?: { provider: string; providerAccountId: string } | null;
  profile?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  user?: { email?: string | null };
}): ExternalIdentity | null {
  const { account, profile, credentials, user } = params;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  if (account?.provider === "planningcenter" && profile) {
    return {
      provider: "planningcenter",
      subject: String(profile.sub ?? account.providerAccountId),
      email: str(profile.email),
      // Planning Center emails are self-edited, so they never link accounts (sign-in.ts).
      emailVerified: false,
      name: str(profile.name),
      organizationId: profile.organization_id == null ? null : String(profile.organization_id),
    };
  }
  // The address comes from authorize (the code was right), never from the posted form.
  if (account?.provider === "email-code" && user?.email) {
    return {
      provider: "email",
      subject: user.email,
      email: user.email,
      emailVerified: true,
      name: null,
    };
  }
  if (account?.provider === "fake" && credentials && fakeSignInEnabled()) {
    // Stands in for Planning Center, or for an emailed code that was already checked.
    const provider = credentials.provider === "email" ? "email" : "planningcenter";
    return {
      provider,
      subject: str(credentials.subject) ?? "",
      email: str(credentials.email),
      emailVerified: provider === "email",
      name: str(credentials.name),
      organizationId: str(credentials.organizationId),
    };
  }
  return null;
}

export const authConfig: NextAuthConfig = {
  providers: providers(),
  trustHost: true,
  session: { strategy: "jwt", maxAge: 12 * 60 * 60, updateAge: 60 * 60 },
  pages: { signIn: "/sign-in", error: "/sign-in" },
  logger: authLogger,
  callbacks: {
    async signIn({ user, account, profile, credentials }) {
      const identity = toIdentity({ account, profile, credentials, user });
      if (!identity?.subject) {
        await rememberDeniedEmail(null);
        return "/access-denied/not-allowed";
      }
      const ipHash = await requestIpHash();
      const { result, queued } = await trackQueuedEmails(() =>
        getDb().transaction((tx) =>
          resolveSignIn(
            tx,
            { directory: getPlanningCenterDirectory(), now: new Date(), requestIpHash: ipHash },
            identity,
          ),
        ),
      );
      // Access requests and leader notices go after the sign-in commits.
      if (queued > 0) sendOutboxAfterResponse();
      if (!result.ok) {
        await rememberDeniedEmail(result.email ?? identity.email);
        return `/access-denied/${result.reason}`;
      }
      await rememberDeniedEmail(null);
      user.appUserId = result.userId;
      return true;
    },
    async jwt({ token, user }) {
      // On sign-in keep only our id; no name, email or picture in the cookie.
      if (user?.appUserId) return { sub: user.appUserId };
      return token;
    },
    async session({ session, token }) {
      return { expires: session.expires, user: { id: token.sub ?? "" } } as typeof session;
    },
  },
  events: {
    async signOut(message) {
      const userId = "token" in message ? message.token?.sub : undefined;
      if (!userId) return;
      await writeAudit(getDb(), {
        actor: { kind: "user", userId },
        area: "access",
        eventType: "access.signed_out",
        entity: { type: "user", id: userId },
      });
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
