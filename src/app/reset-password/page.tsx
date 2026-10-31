import Link from "next/link";
import { cookies } from "next/headers";
import { RECOVERY_COOKIE, verifyRecoveryToken } from "@/lib/recovery";
import { authMode } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ResetForm } from "./reset-form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  let email: string | null = null;
  let valid = false;
  if (authMode() === "supabase") {
    try {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase.auth.getUser();
      email = data.user?.email ?? null;
      valid = verifyRecoveryToken((await cookies()).get(RECOVERY_COOKIE)?.value, data.user?.id);
    } catch {
      valid = false;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md">
        <div className="mb-7 flex items-center justify-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ background: "linear-gradient(135deg,#4F46E5,#7C3AED)" }}>✦</div>
          <span className="text-[22px] font-extrabold tracking-tight">FeedbackIQ</span>
        </div>
        {valid && email ? (
          <ResetForm email={email} />
        ) : (
          <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow)]">
            <h1 className="text-[17px] font-semibold">This link has expired</h1>
            <p className="mt-1 text-[13px] text-muted">
              Password reset links work once, for 15 minutes, in the browser where you opened them. Request a new one
              and use it straight away.
            </p>
            <p className="mt-4 text-[12.5px]">
              <Link href="/forgot-password" className="font-semibold text-indigo">Send me a new link →</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
