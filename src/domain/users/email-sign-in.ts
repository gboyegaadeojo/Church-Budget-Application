import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, exists, gt, inArray, max, ne, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { emailCopy } from "@/copy/email";
import { emailLoginCodes, userRoles, users } from "@/db/schema";
import type { Tx } from "@/db/types";
import { emailBrand, queueNotice } from "@/domain/notifications/notice";
import { getChurchTimeZone, getSignInSettings } from "@/domain/settings";
import { writeAudit } from "@/lib/audit";
import { appUrl } from "@/lib/email/layout";
import { EMAIL_SIGN_IN_ROLES } from "@/lib/roles";
import { formatDateTime } from "@/lib/time-zone";

/**
 * Sign-in with an emailed code (FR-01b, AC-132, AC-133). Anyone can type any address, so
 * the answer never says whether it has an account: every request writes a code row and
 * counts towards the same limits, but only the address of a Church Administrator or System
 * Administrator account is emailed (EMAIL_SIGN_IN_ROLES); everyone else uses Planning Center. The
 * code itself is stored only as a keyed hash.
 *
 * Checking the code runs in its own transaction, before Auth.js signs the person in,
 * so a wrong try is counted even though the sign-in fails. `resolveSignIn` then decides
 * what the account may do, exactly as for Planning Center.
 */

export const CODE_LIFETIME_MS = 10 * 60_000;
export const MAX_REQUESTS_PER_HOUR = 5;
/** Codes asked for from one network in an hour, whatever the addresses. */
export const MAX_REQUESTS_PER_IP_PER_HOUR = 20;
export const MAX_WRONG_CODES = 5;
export const LOCK_MS = 15 * 60_000;
const HOUR_MS = 60 * 60_000;

export type EmailCodeDeps = {
  now: Date;
  /** AUTH_SECRET: keys the code hash, so a database copy can't be used to find codes. */
  secret: string;
  requestIpHash?: string;
  /** Tests pass a fixed code; otherwise six random digits. */
  generateCode?: () => string;
  /** FIRST_ADMIN_EMAIL: who becomes the first System Administrator of an empty app. */
  firstAdminEmail?: string;
  /** FIRST_ADMIN_NAME: their name, if their account is created (else the address's first part). */
  firstAdminName?: string;
};

export type CodeRequestResult =
  | { ok: true; email: string }
  | { ok: false; reason: "disabled" | "invalid_email" }
  | { ok: false; reason: "too_many"; retryAt: Date };

export type CodeCheckResult =
  | { ok: true; email: string }
  | { ok: false; reason: "disabled" | "expired" }
  | { ok: false; reason: "wrong"; triesLeft: number }
  | { ok: false; reason: "locked"; retryAt: Date };

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** The address as stored and compared: trimmed and lower case, or null if not an email. */
export function normalizeEmail(value: string): string | null {
  const parsed = emailSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** "123 456", "123-456" and "123456" are the same code; anything else isn't one. */
export function normalizeCode(value: string): string | null {
  const digits = value.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

function hashCode(secret: string, id: string, code: string): string {
  return createHmac("sha256", secret).update(`${id}:${code}`).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

const sixDigits = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** The end of the address's 15-minute lock after 5 wrong codes, if it's still running. */
async function lockedUntil(tx: Tx, email: string, now: Date): Promise<Date | null> {
  const [row] = await tx
    .select({ until: max(emailLoginCodes.lockedUntil) })
    .from(emailLoginCodes)
    .where(and(eq(emailLoginCodes.email, email), gt(emailLoginCodes.lockedUntil, now)));
  return row?.until ?? null;
}

/** When the next request is allowed, if `limit` were already used in the last hour. */
async function hourlyLimit(tx: Tx, where: SQL, limit: number, now: Date): Promise<Date | null> {
  const recent = await tx
    .select({ at: emailLoginCodes.createdAt })
    .from(emailLoginCodes)
    .where(and(where, gt(emailLoginCodes.createdAt, new Date(now.getTime() - HOUR_MS))))
    .orderBy(asc(emailLoginCodes.createdAt));
  if (recent.length < limit) return null;
  return new Date(recent[recent.length - limit].at.getTime() + HOUR_MS);
}

/** The account a code may be emailed to: active, not deactivated, and an administrator role. */
async function allowlistedAccount(tx: Tx, email: string) {
  const [row] = await tx
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(
      and(
        sql`lower(${users.email}) = ${email}`,
        eq(users.active, true),
        ne(users.accessStatus, "inactive"),
        exists(
          tx
            .select()
            .from(userRoles)
            .where(
              and(
                eq(userRoles.userId, users.id),
                inArray(userRoles.role, [...EMAIL_SIGN_IN_ROLES]),
              ),
            ),
        ),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * The first System Administrator (go-live checklist, launch step 6). A new database has
 * no accounts, and emailed codes only go to administrators, so nobody could sign in.
 * While no active System Administrator exists, the address in FIRST_ADMIN_EMAIL becomes
 * one when it asks for a code: its account is created, or an existing one is given the
 * role. Once any System Administrator exists this does nothing, so the variable can stay
 * set. Audited.
 */
export async function ensureFirstAdministrator(
  tx: Tx,
  email: string,
  first: { email?: string; name?: string },
  now: Date,
): Promise<boolean> {
  const allowed = first.email ? normalizeEmail(first.email) : null;
  if (!allowed || allowed !== email) return false;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('first-administrator'))`);
  const [existing] = await tx
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(
      and(
        eq(userRoles.role, "system_admin"),
        eq(users.active, true),
        ne(users.accessStatus, "inactive"),
      ),
    )
    .limit(1);
  if (existing) return false;

  const [account] = await tx
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  const userId = account
    ? account.id
    : (
        await tx
          .insert(users)
          .values({
            email,
            displayName: first.name?.trim().slice(0, 100) || email.split("@")[0],
            accessStatus: "active",
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: users.id })
      )[0].id;
  if (account) {
    await tx
      .update(users)
      .set({ active: true, accessStatus: "active", updatedAt: now })
      .where(eq(users.id, userId));
  }
  await tx.insert(userRoles).values({ userId, role: "system_admin" }).onConflictDoNothing();
  await writeAudit(tx, {
    actor: { kind: "system" },
    area: "access",
    eventType: "access.first_admin_created",
    entity: { type: "user", id: userId },
    details: { email, newAccount: !account },
  });
  return true;
}

export async function requestEmailCode(
  tx: Tx,
  deps: EmailCodeDeps,
  input: { email: string },
): Promise<CodeRequestResult> {
  const settings = await getSignInSettings(tx);
  if (!settings.emailEnabled) return { ok: false, reason: "disabled" };
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, reason: "invalid_email" };
  const { now } = deps;

  // Serialize requests for one address, so two at once can't both slip under the limit.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`email-code:${email}`}))`);

  const waits = [
    await lockedUntil(tx, email, now),
    await hourlyLimit(tx, eq(emailLoginCodes.email, email), MAX_REQUESTS_PER_HOUR, now),
    deps.requestIpHash
      ? await hourlyLimit(
          tx,
          eq(emailLoginCodes.requestIpHash, deps.requestIpHash),
          MAX_REQUESTS_PER_IP_PER_HOUR,
          now,
        )
      : null,
  ].filter((d): d is Date => d !== null);
  if (waits.length > 0) {
    const retryAt = new Date(Math.max(...waits.map((d) => d.getTime())));
    await writeAudit(tx, {
      actor: { kind: "system" },
      area: "access",
      eventType: "access.sign_in_code_limited",
      entity: { type: "user" },
      details: { method: "email", email, retryAt: retryAt.toISOString() },
      requestIpHash: deps.requestIpHash,
    });
    return { ok: false, reason: "too_many", retryAt };
  }

  await ensureFirstAdministrator(
    tx,
    email,
    { email: deps.firstAdminEmail, name: deps.firstAdminName },
    now,
  );
  const account = await allowlistedAccount(tx, email);
  const id = randomUUID();
  const code = (deps.generateCode ?? sixDigits)();
  const expiresAt = new Date(now.getTime() + CODE_LIFETIME_MS);
  await tx.insert(emailLoginCodes).values({
    id,
    email,
    userId: account?.id ?? null,
    codeHash: hashCode(deps.secret, id, code),
    expiresAt,
    requestIpHash: deps.requestIpHash ?? null,
    createdAt: now,
  });

  if (account) {
    const brand = await emailBrand(tx);
    const m = emailCopy.access.signInCode;
    await queueNotice(tx, {
      template: "access.sign_in_code",
      audience: "person",
      to: [{ email: account.email, userId: account.id }],
      content: {
        subject: m.subject(brand.appName),
        heading: m.heading,
        status: emailCopy.statuses.actionNeeded,
        paragraphs: [m.intro(brand.appName)],
        facts: [
          { label: m.codeLabel, value: code },
          { label: m.expiresLabel, value: formatDateTime(expiresAt, await getChurchTimeZone(tx)) },
        ],
        action: m.action,
        button: { label: emailCopy.buttons.signIn, href: appUrl("/sign-in") },
      },
      expiresAt,
      sensitive: true,
      now,
    });
  }

  await writeAudit(tx, {
    actor: account ? { kind: "user", userId: account.id } : { kind: "system" },
    area: "access",
    eventType: "access.sign_in_code_requested",
    entity: { type: "user", id: account?.id },
    // Whether a code went out is for the administrator; the person is never told.
    details: { method: "email", email, sent: account !== null },
    requestIpHash: deps.requestIpHash,
  });
  return { ok: true, email };
}

/**
 * Checks a code against the address's latest one. A right code is used up; the 5th wrong
 * code locks the address for 15 minutes. Only the newest code counts, so asking for a new
 * one replaces the old.
 */
export async function checkEmailCode(
  tx: Tx,
  deps: Omit<EmailCodeDeps, "generateCode">,
  input: { email: string; code: string },
): Promise<CodeCheckResult> {
  const settings = await getSignInSettings(tx);
  if (!settings.emailEnabled) return { ok: false, reason: "disabled" };
  const email = normalizeEmail(input.email);
  const code = normalizeCode(input.code);
  const { now } = deps;
  if (!email) return { ok: false, reason: "expired" };

  const locked = await lockedUntil(tx, email, now);
  if (locked) return { ok: false, reason: "locked", retryAt: locked };

  const [latest] = await tx
    .select()
    .from(emailLoginCodes)
    .where(eq(emailLoginCodes.email, email))
    .orderBy(desc(emailLoginCodes.createdAt))
    .limit(1)
    .for("update");
  if (!latest || latest.usedAt || latest.expiresAt <= now) return { ok: false, reason: "expired" };

  const audit = (eventType: string, details: Record<string, unknown>) =>
    writeAudit(tx, {
      actor: latest.userId ? { kind: "user", userId: latest.userId } : { kind: "system" },
      area: "access",
      eventType,
      entity: { type: "user", id: latest.userId ?? undefined },
      details: { method: "email", email, ...details },
      requestIpHash: deps.requestIpHash,
    });

  if (code && sameHash(hashCode(deps.secret, latest.id, code), latest.codeHash)) {
    await tx.update(emailLoginCodes).set({ usedAt: now }).where(eq(emailLoginCodes.id, latest.id));
    return { ok: true, email };
  }

  const attempts = latest.attempts + 1;
  if (attempts >= MAX_WRONG_CODES) {
    const retryAt = new Date(now.getTime() + LOCK_MS);
    await tx
      .update(emailLoginCodes)
      .set({ attempts, lockedUntil: retryAt })
      .where(eq(emailLoginCodes.id, latest.id));
    await audit("access.sign_in_code_locked", { attempts, lockedUntil: retryAt.toISOString() });
    return { ok: false, reason: "locked", retryAt };
  }
  await tx.update(emailLoginCodes).set({ attempts }).where(eq(emailLoginCodes.id, latest.id));
  await audit("access.sign_in_code_wrong", { attempts });
  return { ok: false, reason: "wrong", triesLeft: MAX_WRONG_CODES - attempts };
}
