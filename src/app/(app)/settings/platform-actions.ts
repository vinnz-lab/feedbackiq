"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { logAudit } from "@/lib/guard";
import { isPlatformAdmin } from "@/lib/platform";
import { requireWorkspace } from "@/lib/workspace";
import { createSupabaseAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { authMode } from "@/lib/supabase/env";

export type ProvisionState = {
  error?: string;
  ok?: string;
  /** Shown once so the platform owner can hand them over. */
  credentials?: { email: string; password: string; workspace: string };
};

const tidy = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

/**
 * Gives someone their OWN workspace: a new organisation, a new empty workspace,
 * and them as its owner. Platform owner only.
 *
 * The platform owner is deliberately NOT added to it. Testers (and later
 * clients) must be able to trust that nobody else can read their feedback —
 * including whoever runs the platform.
 */
export async function provisionWorkspace(
  _prev: ProvisionState,
  formData: FormData,
): Promise<ProvisionState> {
  try {
    const ctx = await requireWorkspace();
    if (!isPlatformAdmin(ctx.user.email)) return { error: "Only the platform owner can do this." };

    const name = tidy(formData.get("name"));
    const email = tidy(formData.get("email")).toLowerCase();
    const password = String(formData.get("password") ?? "");
    const wsName = tidy(formData.get("workspace")) || (name ? `${name.split(" ")[0]}'s workspace` : "");

    if (!name || !email) return { error: "Name and email are required." };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email doesn't look right." };
    if (wsName.length > 60) return { error: "Keep the workspace name under 60 characters." };
    if (email === ctx.user.email.toLowerCase()) {
      return { error: "That's your own email. Use “New workspace” in the sidebar for your own workspaces." };
    }

    const db = await getDb();
    const [existing] = await db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) = lower(${email})`)
      .limit(1);

    // A brand-new person needs a password and a sign-in.
    let createdAuthId: string | null = null;
    if (!existing) {
      if (password.length < 10) return { error: "Use a password of at least 10 characters." };
      if (authMode() === "supabase") {
        if (!isAdminConfigured()) return { error: "This needs SUPABASE_SERVICE_ROLE_KEY to be configured." };
        const admin = createSupabaseAdminClient();
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name },
        });
        if (error) return { error: `Could not create the sign-in: ${error.message}` };
        createdAuthId = data.user?.id ?? null;
      }
    }

    let workspaceId = "";
    try {
      await db.transaction(async (tx) => {
        // Their own organisation — not the platform owner's.
        const [tenant] = await tx
          .insert(schema.tenants)
          .values({ name: wsName })
          .returning({ id: schema.tenants.id });
        const [ws] = await tx
          .insert(schema.workspaces)
          .values({ tenantId: tenant.id, name: wsName, description: `Set up for ${name}` })
          .returning({ id: schema.workspaces.id });
        const userId =
          existing?.id ??
          (
            await tx
              .insert(schema.users)
              .values({ tenantId: tenant.id, name, email, role: "owner" })
              .returning({ id: schema.users.id })
          )[0].id;
        await tx.insert(schema.workspaceMembers).values({ workspaceId: ws.id, userId, role: "owner" });
        workspaceId = ws.id;
      });
    } catch (e) {
      // Don't leave a sign-in behind that points at nothing.
      if (createdAuthId) {
        try {
          await createSupabaseAdminClient().auth.admin.deleteUser(createdAuthId);
        } catch {
          /* best effort */
        }
      }
      throw e;
    }

    // Recorded in THEIR workspace (so they can see who set it up). This is also
    // how the platform owner's list finds it — names and dates only, never content.
    await logAudit({
      workspaceId,
      actorId: ctx.user.id,
      actorLabel: ctx.user.name,
      action: "workspace.provisioned",
      entityType: "workspace",
      entityId: workspaceId,
      after: { name: wsName, owner: email },
    });

    revalidatePath("/settings");
    if (existing) {
      return {
        ok: `${existing.name} already had an account, so “${wsName}” was added to it. They sign in with their existing password and will find it in their workspace list.`,
      };
    }
    return {
      ok: `Created “${wsName}” for ${name}.`,
      credentials: { email, password, workspace: wsName },
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
