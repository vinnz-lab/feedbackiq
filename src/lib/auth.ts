import { cache } from "react";
import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { authMode } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const COOKIE = "fiq_uid";

export const ROLE_LABEL: Record<string, string> = {
  owner: "Product Owner",
  contributor: "Contributor",
  executive: "Executive",
  engineer: "Engineer",
};

export type AppUser = typeof schema.users.$inferSelect;

export async function listUsers() {
  const db = await getDb();
  return db.select().from(schema.users).orderBy(schema.users.createdAt);
}

/** Case-insensitive lookup — Supabase normalises emails, our seed may not. */
async function findUserByEmail(email: string): Promise<AppUser | null> {
  const db = await getDb();
  const [u] = await db
    .select()
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = lower(${email})`)
    .limit(1);
  return u ?? null;
}

/**
 * Solves the first-account problem: only an owner can add people, so without
 * this nobody could ever sign in to a freshly configured deployment.
 *
 * Naming one email in BOOTSTRAP_OWNER_EMAIL lets that person through the first
 * time they sign in, creating their owner record. It is not a backdoor — they
 * must already have authenticated against Supabase, and with public sign-up
 * disabled the only accounts that exist are ones the owner created. It also
 * self-retires: once the row exists, this never runs again.
 */
async function bootstrapOwnerIfNeeded(email: string): Promise<AppUser | null> {
  const allowed = (process.env.BOOTSTRAP_OWNER_EMAIL ?? "").trim().toLowerCase();
  if (!allowed || allowed !== email.trim().toLowerCase()) return null;

  const db = await getDb();
  const [tenant] = await db.select().from(schema.tenants).limit(1);
  if (!tenant) return null;

  const [created] = await db
    .insert(schema.users)
    .values({
      tenantId: tenant.id,
      email: email.toLowerCase(),
      name: email.split("@")[0],
      role: "owner",
    })
    .onConflictDoNothing()
    .returning();

  return created ?? (await findUserByEmail(email));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The legacy profile picker, kept for local development and the test suite. */
async function getDevUser(): Promise<AppUser | null> {
  const jar = await cookies();
  const uid = jar.get(COOKIE)?.value;

  // A stale or tampered cookie must fail closed (→ /login), never crash the
  // request. Postgres rejects a non-UUID literal, which would otherwise 500
  // every gated page for that browser until the cookie was cleared by hand.
  if (!uid || !UUID_RE.test(uid)) return null;

  try {
    const db = await getDb();
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, uid)).limit(1);
    return u ?? null;
  } catch {
    return null;
  }
}

/**
 * The signed-in user, or null.
 *
 * Wrapped in cache() so it runs ONCE per request no matter how many components
 * ask: the layout and the page both need the current user, and without this
 * each call repeated the token check and the database lookup.
 *
 * Supabase establishes WHO you are; a matching row in our users table is what
 * grants access. That is what keeps the app invite-only, and linking by email
 * is why adopting auth needed no database migration.
 */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const mode = authMode();

  if (mode === "supabase") {
    try {
      const supabase = await createSupabaseServerClient();

      // getClaims verifies the JWT locally against a cached key set, so it
      // costs no network round-trip. getUser asks the Auth server on every
      // call, which on a page that renders several components meant several
      // cross-region requests before anything could be displayed. Falls back
      // to getUser if the token can't be verified locally.
      let email: string | null = null;
      try {
        const { data } = await supabase.auth.getClaims();
        const claims = (data as { claims?: Record<string, unknown> } | null)?.claims;
        if (typeof claims?.email === "string") email = claims.email;
      } catch {
        // fall through to the authoritative check
      }

      if (!email) {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data?.user?.email) return null;
        email = data.user.email;
      }

      return (await findUserByEmail(email)) ?? (await bootstrapOwnerIfNeeded(email));
    } catch {
      return null;
    }
  }

  if (mode === "dev") return getDevUser();

  return null; // unconfigured: fail closed
});

export function initials(name: string) {
  return name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("");
}
