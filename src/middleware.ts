import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "@/lib/supabase/env";

/**
 * Refreshes the Supabase session on every request.
 *
 * This is not optional: Server Components cannot write cookies, so the
 * middleware is the only place a rotated access token can be written back to
 * both the forwarded request (so the page sees it) and the response (so the
 * browser stores it). Without it, sessions silently expire.
 *
 * Route protection still lives in the app layout — this only keeps tokens
 * fresh, so a misconfigured matcher can never accidentally expose a page.
 */
export async function middleware(request: NextRequest) {
  // No Supabase configured (local dev against PGlite) — nothing to refresh.
  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Triggers the refresh. Nothing may run between client creation and this call.
  await supabase.auth.getUser();

  return response;
}

// api/hooks: the incoming webhook has no session (the secret address is the
// permission), so skip the Supabase round trip for every delivery.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/hooks/).*)"],
};
