import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Proof that this browser arrived through a genuine password-reset link.
 *
 * The reset page sets a password WITHOUT asking for the current one. Without
 * this proof, anyone at a computer left signed in could open /reset-password
 * and take the account over — the exact thing the "current password" check in
 * Settings exists to stop. Only /auth/confirm, after Supabase has verified the
 * emailed link, can issue it.
 *
 * Signed with a server-only secret so it can't be forged in the browser, tied
 * to one user, and valid for 15 minutes.
 */
export const RECOVERY_COOKIE = "fiq_recovery";
export const RECOVERY_TTL_SECONDS = 15 * 60;

function secret(): string | null {
  return process.env.RECOVERY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || null;
}
const sign = (key: string, payload: string) => createHmac("sha256", key).update(`fiq-recovery:${payload}`).digest("hex");

/** Returns the cookie value, or null if no server secret is configured (fail closed). */
export function issueRecoveryToken(userId: string, now = Date.now()): string | null {
  const key = secret();
  if (!key) return null;
  const exp = Math.floor(now / 1000) + RECOVERY_TTL_SECONDS;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(key, payload)}`;
}

/** True only if the token is genuine, unexpired, and for THIS user. */
export function verifyRecoveryToken(token: string | undefined, userId: string | null | undefined, now = Date.now()): boolean {
  const key = secret();
  if (!key || !token || !userId) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [uid, expStr, mac] = parts;
  if (uid !== userId) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  const expected = Buffer.from(sign(key, `${uid}.${expStr}`), "hex");
  const given = Buffer.from(mac, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Where a reset link may send someone afterwards. Only our own reset page — never an outside URL. */
export function safeRecoveryNext(next: string | null): string {
  return next === "/reset-password" ? "/reset-password" : "/reset-password";
}
