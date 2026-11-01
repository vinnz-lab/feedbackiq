"use server";

import { redirect } from "next/navigation";
import { checkResetPassword } from "@/lib/password";
import { clearMustChangePassword } from "@/lib/password-admin";
import { authMode } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ChooseState = { error?: string };

/** Replaces a temporary password with the person's own, then lets them in. */
export async function chooseOwnPassword(_prev: ChooseState, formData: FormData): Promise<ChooseState> {
  if (authMode() !== "supabase") return { error: "This needs real sign-in (Supabase)." };
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) redirect("/login");
  // Only for accounts that really were given a temporary password.
  if ((user.app_metadata as { must_change_password?: unknown } | undefined)?.must_change_password !== true) {
    redirect("/dashboard");
  }
  const invalid = checkResetPassword(next, confirm);
  if (invalid) return { error: invalid };

  // The temporary password must not be "chosen" as their own.
  const { error: same } = await supabase.auth.signInWithPassword({ email: user.email ?? "", password: next });
  if (!same) return { error: "Choose a password that's different from the temporary one." };

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: `Couldn't set the password: ${error.message}` };
  await clearMustChangePassword(user.id);
  // Get a fresh session so the cleared flag takes effect straight away.
  await supabase.auth.refreshSession().catch(() => {});
  await supabase.auth.signOut({ scope: "others" }).catch(() => {});
  redirect("/dashboard");
}
