/**
 * Supabase Auth configuration.
 *
 * Auth is optional at build time on purpose: local development runs against
 * PGlite with no Supabase project at all, and the test suite has to be able to
 * sign in without one. Production supplies the real values.
 */

/** Supabase renamed `anon` → `publishable`; both still work, so accept either. */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export function isSupabaseAuthConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLIC_KEY);
}

export type AuthMode = "supabase" | "dev" | "unconfigured";

/**
 * Which sign-in method is active.
 *
 * Real auth wins whenever it is configured. The dev profile picker requires an
 * explicit opt-in flag rather than merely "not production", so a deployment
 * that is missing its Supabase settings fails CLOSED instead of silently
 * falling back to a passwordless picker on a public URL.
 */
export function authMode(): AuthMode {
  if (isSupabaseAuthConfigured()) return "supabase";
  if (process.env.ALLOW_DEV_LOGIN === "true") return "dev";
  return "unconfigured";
}
