"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { logAudit } from "@/lib/guard";
import { isPlatformAdmin } from "@/lib/platform";
import { requireWorkspace } from "@/lib/workspace";
import { deleteWorkspaceCompletely } from "@/lib/workspace-delete";
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
        await tx.insert(schema.workspaceAiSettings).values({
          workspaceId: ws.id,
          allowPlatformKey: formData.get("allowPlatformKey") === "on",
          updatedBy: ctx.user.id,
        });
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

export type RemoveProvisionedState = { error?: string; ok?: string };

/**
 * Removes a workspace the platform owner set up for someone else — WITHOUT
 * opening it. Only workspaces this person set up (recorded when they did) can
 * be removed this way, and the exact name must be typed.
 *
 * Optionally also removes the sign-ins of people left with no workspace at
 * all, so a finished tester doesn't keep a login that leads nowhere. Anyone
 * who still belongs to another workspace keeps their account.
 */
export async function removeProvisionedWorkspace(
  _prev: RemoveProvisionedState,
  formData: FormData,
): Promise<RemoveProvisionedState> {
  try {
    const ctx = await requireWorkspace();
    if (!isPlatformAdmin(ctx.user.email)) return { error: "Only the platform owner can do this." };

    const workspaceId = String(formData.get("workspaceId") ?? "");
    const confirmName = String(formData.get("confirmName") ?? "").trim();
    const removeSignins = formData.get("removeSignins") === "on";
    if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) return { error: "No workspace selected." };

    const db = await getDb();
    // Only ones THIS person set up.
    const [setUp] = await db
      .select({ id: schema.auditEvents.id })
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.workspaceId, workspaceId),
          eq(schema.auditEvents.action, "workspace.provisioned"),
          eq(schema.auditEvents.actorId, ctx.user.id),
        ),
      )
      .limit(1);
    if (!setUp) return { error: "You can only remove workspaces you set up." };
    if (workspaceId === ctx.workspace.id) return { error: "Switch to another workspace first." };

    const [ws] = await db
      .select({ id: schema.workspaces.id, name: schema.workspaces.name })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, workspaceId))
      .limit(1);
    if (!ws) return { error: "That workspace no longer exists." };
    if (confirmName !== ws.name) return { error: `Type the workspace name exactly — “${ws.name}” — to confirm.` };

    // Who is in it, before it goes.
    const memberRows = await db
      .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
      .from(schema.workspaceMembers)
      .innerJoin(schema.users, eq(schema.workspaceMembers.userId, schema.users.id))
      .where(eq(schema.workspaceMembers.workspaceId, workspaceId));

    const removed = await deleteWorkspaceCompletely(workspaceId);

    // People now in NO workspace. Never the person doing this.
    const orphans: typeof memberRows = [];
    for (const m of memberRows) {
      if (m.id === ctx.user.id) continue;
      const [{ n }] = await db
        .select({ n: count() })
        .from(schema.workspaceMembers)
        .where(eq(schema.workspaceMembers.userId, m.id));
      if (Number(n) === 0) orphans.push(m);
    }

    let signinNote = "";
    const removedSignins: string[] = [];
    if (removeSignins && orphans.length) {
      for (const o of orphans) {
        if (authMode() === "supabase" && isAdminConfigured()) {
          try {
            const admin = createSupabaseAdminClient();
            const { data } = await admin.auth.admin.listUsers();
            const match = data?.users?.find((u) => (u.email ?? "").toLowerCase() === o.email.toLowerCase());
            if (match) await admin.auth.admin.deleteUser(match.id);
          } catch (e) {
            signinNote = ` (some sign-ins may still exist: ${(e as Error).message})`;
          }
        }
        await db.delete(schema.users).where(eq(schema.users.id, o.id));
        removedSignins.push(o.name);
      }
    }

    await logAudit({
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      actorLabel: ctx.user.name,
      action: "workspace.removed",
      entityType: "workspace",
      entityId: workspaceId,
      after: { name: ws.name, ...removed, removedSignins },
    });

    revalidatePath("/settings");
    const keptCount = memberRows.length - removedSignins.length;
    return {
      ok:
        `Removed “${ws.name}”.` +
        (removedSignins.length ? ` Sign-ins removed: ${removedSignins.join(", ")}.` : "") +
        (keptCount > 0 && removeSignins ? ` ${keptCount} ${keptCount === 1 ? "person keeps" : "people keep"} their account (they belong to another workspace).` : "") +
        (!removeSignins && orphans.length ? ` ${orphans.length} ${orphans.length === 1 ? "person now has" : "people now have"} no workspace; their sign-in still exists.` : "") +
        signinNote,
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * Whether a workspace you set up may use YOUR AI key. Platform owner only, and
 * only for workspaces they set up. Turning it off means that workspace's AI
 * stops until its owner adds their own key (they're told so in Settings).
 */
export async function setPlatformKeyAllowed(workspaceId: string, allowed: boolean): Promise<{ error?: string }> {
  try {
    const ctx = await requireWorkspace();
    if (!isPlatformAdmin(ctx.user.email)) return { error: "Only the platform owner can do this." };
    if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) return { error: "No workspace selected." };
    const db = await getDb();
    const [setUp] = await db
      .select({ id: schema.auditEvents.id })
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.workspaceId, workspaceId),
          eq(schema.auditEvents.action, "workspace.provisioned"),
          eq(schema.auditEvents.actorId, ctx.user.id),
        ),
      )
      .limit(1);
    if (!setUp) return { error: "You can only change workspaces you set up." };
    await db
      .insert(schema.workspaceAiSettings)
      .values({ workspaceId, allowPlatformKey: Boolean(allowed), updatedBy: ctx.user.id })
      .onConflictDoUpdate({
        target: schema.workspaceAiSettings.workspaceId,
        set: { allowPlatformKey: Boolean(allowed), updatedBy: ctx.user.id, updatedAt: new Date() },
      });
    await logAudit({
      workspaceId,
      actorId: ctx.user.id,
      actorLabel: ctx.user.name,
      action: allowed ? "ai.platform_key_allowed" : "ai.platform_key_blocked",
      entityType: "workspace",
      entityId: workspaceId,
    });
    revalidatePath("/settings");
    return {};
  } catch (e) {
    return { error: (e as Error).message };
  }
}
