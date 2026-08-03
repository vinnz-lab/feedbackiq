import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

/**
 * Privileged client for creating teammate accounts.
 *
 * Uses the secret key, which must NEVER reach the browser — hence no
 * NEXT_PUBLIC_ prefix on the env var. Server-side use only.
 */
export function createSupabaseAdminClient() {
  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? "";
  if (!SUPABASE_URL || !secret) {
    throw new Error(
      "Creating accounts needs SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL) to be set.",
    );
  }
  return createClient(SUPABASE_URL, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function isAdminConfigured() {
  return Boolean(
    SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY),
  );
}
