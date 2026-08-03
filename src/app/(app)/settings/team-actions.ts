"use server";

import { revalidatePath } from "next/cache";
import { count, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/guard";
import { createSupabaseAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { authMode } from "@/lib/supabase/env";
import type { RoleT } from "@/db/schema";

export type CreateUserState = {
  error?: string;
  ok?: string;
  /** Returned on success so the owner can hand them straight to the tester. */
  credentials?: { email: string; password: string };
};

export type RemoveUserState = { error?: string; ok?: string };

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
    return {
      ok: `${name} can now sign in.`,
      credentials: { email, password },
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * Revokes someone's access.
 *
 * Removes both records: the Supabase identity (so the password stops working
 * everywhere) and our users row (which is what actually authorises them).
 * Deleting only ours would leave a usable login for a workspace they can no
 * longer enter; deleting only theirs would leave a dangling member.
 *
 * Guards against the two ways this could lock the workspace: you cannot remove
 * yourself, and you cannot remove the last owner.
 */
export async function removeTeamMember(
  _prev: RemoveUserState,
  formData: FormData,
): Promise<RemoveUserState> {
  try {
    const actor = await requireUser();
    if (actor.role !== "owner") return { error: "Only the workspace owner can remove people." };

    const id = String(formData.get("id") ?? "");
    if (!id) return { error: "No person selected." };
    if (id === actor.id) return { error: "You can't remove your own access." };

    const db = await getDb();
    const [target] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);
    if (!target) return { error: "That person is no longer in this workspace." };

    if (target.role === "owner") {
      const [{ n }] = await db
        .select({ n: count() })
        .from(schema.users)
        .where(eq(schema.users.role, "owner"));
      if (Number(n) <= 1) return { error: "You can't remove the last owner." };
    }

    // Best-effort on the Supabase side: if the identity is already gone, the
    // workspace row should still be removed rather than leaving a ghost member.
    let authNote = "";
    if (authMode() === "supabase" && isAdminConfigured() && target.email) {
      try {
        const admin = createSupabaseAdminClient();
        const { data } = await admin.auth.admin.listUsers();
        const match = data?.users?.find(
          (u) => (u.email ?? "").toLowerCase() === target.email.toLowerCase(),
        );
        if (match) await admin.auth.admin.deleteUser(match.id);
      } catch (e) {
        authNote = ` (their sign-in may still exist: ${(e as Error).message})`;
      }
    }

    await db.delete(schema.users).where(eq(schema.users.id, id));

    revalidatePath("/settings");
    return { ok: `Removed ${target.name}.${authNote}` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
