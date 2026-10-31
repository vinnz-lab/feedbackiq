/** Rules for a new password. Returns an error message, or null when it's fine. */
export const MIN_PASSWORD = 10;

export function checkNewPassword(current: string, next: string, confirm: string): string | null {
  if (!current) return "Enter your current password.";
  if (next.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters for the new password.`;
  if (next.length > 72) return "Keep the password under 72 characters.";
  if (next !== confirm) return "The two new passwords don't match.";
  if (next === current) return "The new password must be different from the current one.";
  if (/^\s|\s$/.test(next)) return "The password can't start or end with a space.";
  return null;
}

/** The few Supabase calls a password change needs (so it can be tested without Supabase). */
export type AuthLike = {
  signInWithPassword(c: { email: string; password: string }): Promise<{ error: { message: string } | null }>;
  updateUser(u: { password: string }): Promise<{ error: { message: string } | null }>;
  signOut(o: { scope: "others" }): Promise<unknown>;
};

/**
 * The password change itself, in order:
 *  1. check the new password's rules (nothing is sent anywhere if they fail);
 *  2. prove the CURRENT password is right;
 *  3. only then set the new one;
 *  4. sign every other device out.
 */
export async function performPasswordChange(
  auth: AuthLike,
  email: string,
  current: string,
  next: string,
  confirm: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const invalid = checkNewPassword(current, next, confirm);
  if (invalid) return { ok: false, error: invalid };
  const { error: wrong } = await auth.signInWithPassword({ email, password: current });
  if (wrong) return { ok: false, error: "Your current password isn't right." };
  const { error } = await auth.updateUser({ password: next });
  if (error) return { ok: false, error: `Couldn't change the password: ${error.message}` };
  await auth.signOut({ scope: "others" }).catch(() => {});
  return { ok: true };
}

/** Rules for a new password set from a reset link (no current password to compare). */
export function checkResetPassword(next: string, confirm: string): string | null {
  if (next.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (next.length > 72) return "Keep the password under 72 characters.";
  if (next !== confirm) return "The two passwords don't match.";
  if (/^\s|\s$/.test(next)) return "The password can't start or end with a space.";
  return null;
}

