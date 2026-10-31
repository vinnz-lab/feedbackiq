"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkResetPassword } from "@/lib/password";
import { RECOVERY_COOKIE, verifyRecoveryToken } from "@/lib/recovery";
import { authMode } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ResetState = { error?: string };

/** Sets a new password. Only works straight after a genuine reset link. */
export async function completePasswordReset(_prev: ResetState, formData: FormData): Promise<ResetState> {
  if (authMode() !== "supabase") return { error: "Password reset needs real sign-in (Supabase)." };
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const jar = await cookies();
  // The proof must be genuine, unexpired, and for the account that's signed in.
  if (!verifyRecoveryToken(jar.get(RECOVERY_COOKIE)?.value, data.user?.id)) {
    return { error: "This reset link has expired. Request a new one from the sign-in page." };
  }
  const invalid = checkResetPassword(next, confirm);
  if (invalid) return { error: invalid };

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: `Couldn't set the password: ${error.message}` };

  // One use only, and sign out anywhere else the account was open.
  jar.delete(RECOVERY_COOKIE);
  await supabase.auth.signOut({ scope: "others" }).catch(() => {});
  redirect("/dashboard");
}
