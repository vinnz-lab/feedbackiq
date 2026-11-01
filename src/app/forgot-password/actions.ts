"use server";

import { headers } from "next/headers";
import { authMode } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ForgotState = { sent?: boolean; error?: string };

/**
 * Sends a password-reset link.
 *
 * Always gives the same answer whether or not the email has an account, so
 * this page can't be used to find out who uses Insight Hub.
 */
export async function requestPasswordReset(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  if (authMode() !== "supabase") return { error: "Password reset needs real sign-in (Supabase) to be switched on." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter the email address you sign in with." };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  // Supabase only honours this if it's on the project's allowed redirect list.
  const redirectTo = `${proto}://${host}/auth/confirm?next=/reset-password`;

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      // A project-wide limit says nothing about whether THIS email exists, so it's safe to say.
      if (/rate limit/i.test(error.message) || (error as { status?: number }).status === 429) {
        return { error: "Too many reset emails have been sent recently. Please try again in an hour." };
      }
      console.error("password reset email failed:", error.message);
    }
  } catch (e) {
    console.error("password reset email failed:", (e as Error).message);
  }
  return { sent: true };
}
