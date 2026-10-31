"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { COOKIE } from "@/lib/auth";
import { WS_COOKIE } from "@/lib/workspace";
import { authMode } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Dev profile picker. Only reachable when real auth isn't configured. */
export async function signInAs(userId: string) {
  if (authMode() !== "dev") throw new Error("Profile sign-in is disabled.");
  const jar = await cookies();
  jar.set(COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/dashboard");
}

export type SignInState = { error?: string };

export async function signInWithPassword(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  // Supabase deliberately returns one generic message so an attacker can't
  // discover which emails exist. Keep it that way.
  if (error) return { error: "That email and password combination didn't work." };

  // Authenticating proves identity; a row in our users table grants access.
  const db = await getDb();
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = lower(${email})`)
    .limit(1);

  // The named bootstrap owner is allowed through on first sign-in; their record
  // is created by getCurrentUser.
  const isBootstrapOwner =
    (process.env.BOOTSTRAP_OWNER_EMAIL ?? "").trim().toLowerCase() === email.toLowerCase();

  if (!row && !isBootstrapOwner) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: "That account isn't set up for this workspace. Ask the owner for an invite." };
  }

  redirect("/dashboard");
}

export async function signOut() {
  if (authMode() === "supabase") {
    const supabase = await createSupabaseServerClient();
    // Local scope: sign out of this browser only, not every device.
    await supabase.auth.signOut({ scope: "local" });
  }
  const jar = await cookies();
  jar.delete(COOKIE);
  jar.delete(WS_COOKIE);
  redirect("/login");
}
