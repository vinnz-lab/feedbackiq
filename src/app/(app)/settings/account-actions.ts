"use server";

import { logAudit } from "@/lib/guard";
import { performPasswordChange, type AuthLike } from "@/lib/password";
import { authMode } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace";

export type PasswordState = { error?: string; ok?: string };

/**
 * Changes the signed-in person's OWN password.
 *
 * There is one account per email, however many workspaces it belongs to, so
 * this one password is the one used everywhere.
 *
 * The current password is checked first: a session left open on a shared
 * computer must not be enough to take over the account. Afterwards every
 * other device is signed out, so an old session can't keep working.
 */
export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  try {
    const ctx = await requireWorkspace();
    const email = ctx.user.email;

    if (authMode() !== "supabase") {
      return { error: "Passwords are only used with real sign-in (Supabase). This local copy uses the developer sign-in." };
    }

    const supabase = await createSupabaseServerClient();
    const r = await performPasswordChange(
      supabase.auth as unknown as AuthLike,
      email,
      String(formData.get("current") ?? ""),
      String(formData.get("next") ?? ""),
      String(formData.get("confirm") ?? ""),
    );
    if (!r.ok) return { error: r.error };

    await logAudit({
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      actorLabel: ctx.user.name,
      action: "account.password_changed",
      entityType: "user",
      entityId: ctx.user.id,
    }).catch(() => {});

    return { ok: "Password changed. Use it next time you sign in. Any other devices have been signed out." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
