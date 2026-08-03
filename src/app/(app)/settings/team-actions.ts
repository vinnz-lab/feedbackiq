"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/guard";
import { createSupabaseAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { authMode } from "@/lib/supabase/env";
import type { RoleT } from "@/db/schema";

export type CreateUserState = { error?: string; ok?: string };

const ROLES = ["owner", "contributor", "executive", "engineer"];

/**
 * Creates a teammate account.
 *
 * Two records are needed: a Supabase identity (so they can authenticate) and a
 * row in our users table (which is what actually grants access and carries the
 * role). The account is created pre-confirmed so an invited colleague can sign
 * in immediately rather than waiting on a confirmation email.
 */
export async function createTeamMember(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  try {
    const actor = await requireUser();
    if (actor.role !== "owner") return { error: "Only the workspace owner can add people." };

    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const role = String(formData.get("role") ?? "contributor");
    const password = String(formData.get("password") ?? "");

    if (!name || !email) return { error: "Name and email are required." };
    if (!ROLES.includes(role)) return { error: "Pick a valid role." };
    if (password.length < 10) return { error: "Use a password of at least 10 characters." };

    const db = await getDb();
    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) = lower(${email})`)
      .limit(1);
    if (existing) return { error: "Someone with that email is already in this workspace." };

    if (authMode() === "supabase") {
      if (!isAdminConfigured()) {
        return { error: "Adding people needs SUPABASE_SERVICE_ROLE_KEY to be configured." };
      }
      const admin = createSupabaseAdminClient();
      const { error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // invited by the owner; no confirmation email needed
        user_metadata: { name },
      });
      if (error) return { error: `Could not create the sign-in account: ${error.message}` };
    }

    // Teammates join the inviter's tenant.
    await db.insert(schema.users).values({
      tenantId: actor.tenantId,
      name,
      email,
      role: role as RoleT,
    });

    revalidatePath("/settings");
    return { ok: `${name} can now sign in with ${email}.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
