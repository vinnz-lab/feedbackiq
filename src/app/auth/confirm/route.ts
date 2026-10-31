import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { issueRecoveryToken, RECOVERY_COOKIE, RECOVERY_TTL_SECONDS, safeRecoveryNext } from "@/lib/recovery";

/**
 * Where the emailed reset link lands.
 *
 * Supports both link styles Supabase can send:
 *  - token_hash + type (recommended: works even if the email is opened in a
 *    different browser or on a phone);
 *  - code (Supabase's default; only works in the browser that asked for it).
 * Once Supabase has verified the link, this browser is given short-lived proof
 * that it came through a real reset link, then sent to /reset-password.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  const next = safeRecoveryNext(url.searchParams.get("next"));

  const fail = () => NextResponse.redirect(new URL("/forgot-password?error=link", url.origin));

  try {
    const supabase = await createSupabaseServerClient();
    let userId: string | null = null;

    if (tokenHash && type === "recovery") {
      const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (error) return fail();
      userId = data.user?.id ?? null;
    } else if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return fail();
      userId = data.user?.id ?? null;
    } else {
      return fail();
    }

    const token = userId ? issueRecoveryToken(userId) : null;
    if (!token) return fail();

    const res = NextResponse.redirect(new URL(next, url.origin));
    res.cookies.set(RECOVERY_COOKIE, token, {
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: RECOVERY_TTL_SECONDS,
    });
    return res;
  } catch {
    return fail();
  }
}
