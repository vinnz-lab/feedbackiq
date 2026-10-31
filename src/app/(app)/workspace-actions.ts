"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { logAudit } from "@/lib/guard";
import { isPlatformAdmin } from "@/lib/platform";
import { requireWorkspace, WS_COOKIE } from "@/lib/workspace";

const MAX_WS_NAME = 60; // "use server" files may only export async functions
const COOKIE_OPTS = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 365 };

function tidy(raw: unknown) {
  return String(raw ?? "").replace(/\s+/g, " ").trim();
}

/** Opens another workspace. Only ones the user is a member of. */
export async function switchWorkspace(workspaceId: string): Promise<{ error?: string }> {
  const ctx = await requireWorkspace();
  const target = ctx.memberships.find((m) => m.workspace.id === workspaceId);
  if (!target) return { error: "You aren't a member of that workspace." };
  (await cookies()).set(WS_COOKIE, workspaceId, COOKIE_OPTS);
  revalidatePath("/", "layout");
  // Back to the dashboard: whatever page was open belonged to the old workspace.
  redirect("/dashboard");
}

export type CreateWorkspaceState = { error?: string };

/** Creates an empty workspace owned by the creator, then opens it. Platform owner only. */
export async function createWorkspace(
  _prev: CreateWorkspaceState,
  formData: FormData,
): Promise<CreateWorkspaceState> {
  const ctx = await requireWorkspace();
  if (!isPlatformAdmin(ctx.user.email)) {
    return { error: "Only the platform owner can create workspaces." };
  }
  const name = tidy(formData.get("name"));
  const description = tidy(formData.get("description")).slice(0, 120) || null;
  if (!name) return { error: "Give the workspace a name." };
  if (name.length > MAX_WS_NAME) return { error: `Keep the name under ${MAX_WS_NAME} characters.` };
  if (ctx.memberships.some((m) => m.workspace.name.toLowerCase() === name.toLowerCase())) {
    return { error: `You already have a workspace called “${name}”.` };
  }

  const db = await getDb();
  let newId = "";
  await db.transaction(async (tx) => {
    // Same organisation as the workspace you're in: these are your own products.
    const [ws] = await tx
      .insert(schema.workspaces)
      .values({ tenantId: ctx.workspace.tenantId, name, description })
      .returning({ id: schema.workspaces.id });
    await tx.insert(schema.workspaceMembers).values({ workspaceId: ws.id, userId: ctx.user.id, role: "owner" });
    newId = ws.id;
  });

  await logAudit({
    workspaceId: newId,
    actorId: ctx.user.id,
    actorLabel: ctx.user.name,
    action: "workspace.created",
    entityType: "workspace",
    entityId: newId,
    after: { name },
  });

  (await cookies()).set(WS_COOKIE, newId, COOKIE_OPTS);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export type UpdateWorkspaceState = { error?: string; ok?: string };

/** Renames the CURRENT workspace. Its owner only. */
export async function updateWorkspace(
  _prev: UpdateWorkspaceState,
  formData: FormData,
): Promise<UpdateWorkspaceState> {
  const ctx = await requireWorkspace();
  if (ctx.role !== "owner") return { error: "Only the workspace owner can rename it." };
  const name = tidy(formData.get("name"));
  const description = tidy(formData.get("description")).slice(0, 120) || null;
  if (!name) return { error: "The workspace needs a name." };
  if (name.length > MAX_WS_NAME) return { error: `Keep the name under ${MAX_WS_NAME} characters.` };
  if (
    ctx.memberships.some(
      (m) => m.workspace.id !== ctx.workspace.id && m.workspace.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    return { error: `You already have another workspace called “${name}”.` };
  }

  const db = await getDb();
  await db
    .update(schema.workspaces)
    .set({ name, description })
    .where(eq(schema.workspaces.id, ctx.workspace.id));
  await logAudit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    actorLabel: ctx.user.name,
    action: "workspace.renamed",
    entityType: "workspace",
    entityId: ctx.workspace.id,
    after: { from: ctx.workspace.name, to: name },
  });
  revalidatePath("/", "layout");
  return { ok: "Saved." };
}

export type DeleteWorkspaceState = { error?: string };

/**
 * Permanently deletes the CURRENT workspace and everything in it.
 *
 * Guards, all checked here on the server (the form's checks are only a convenience):
 *  - only its owner may delete it;
 *  - never your last workspace (you'd be left with nothing to sign in to);
 *  - the exact workspace name must be typed, and a backup acknowledged.
 * Everything goes in one transaction, so it is all deleted or none of it is.
 * Other members lose access (their accounts stay; anyone with no other
 * workspace sees "No workspace yet"). The record of the deletion is written to
 * the workspace you land in, since the deleted one's audit trail goes with it.
 */
export async function deleteWorkspace(
  _prev: DeleteWorkspaceState,
  formData: FormData,
): Promise<DeleteWorkspaceState> {
  const ctx = await requireWorkspace();
  const ws = ctx.workspace;
  if (ctx.role !== "owner") return { error: "Only the workspace owner can delete it." };

  const next = ctx.memberships.find((m) => m.workspace.id !== ws.id);
  if (!next) return { error: "This is your only workspace, so it can't be deleted." };

  if (String(formData.get("confirmName") ?? "").trim() !== ws.name) {
    return { error: `Type the workspace name exactly — “${ws.name}” — to confirm.` };
  }
  if (formData.get("backupDone") !== "on") {
    return { error: "Download a backup first, then tick the box to confirm." };
  }

  const db = await getDb();
  const n = async (t: { workspaceId: unknown }) =>
    Number(
      (
        await db
          .select({ n: count() })
          .from(t as typeof schema.themes)
          .where(eq((t as typeof schema.themes).workspaceId, ws.id))
      )[0].n,
    );
  const removed = {
    feedbackItems: await n(schema.feedbackItems as never),
    themes: await n(schema.themes as never),
    sources: await n(schema.sources as never),
    roadmapItems: await n(schema.enhancements as never),
    digests: await n(schema.digests as never),
    members: await n(schema.workspaceMembers as never),
  };

  await db.transaction(async (tx) => {
    // Children first, so nothing depends on cascade behaviour.
    await tx.delete(schema.digests).where(eq(schema.digests.workspaceId, ws.id));
    await tx.delete(schema.enhancements).where(eq(schema.enhancements.workspaceId, ws.id)); // evidence links cascade
    await tx.delete(schema.feedbackItems).where(eq(schema.feedbackItems.workspaceId, ws.id));
    await tx.delete(schema.sources).where(eq(schema.sources.workspaceId, ws.id));
    await tx.delete(schema.themes).where(eq(schema.themes.workspaceId, ws.id));
    await tx.delete(schema.productAreas).where(eq(schema.productAreas.workspaceId, ws.id));
    await tx.delete(schema.trackerConnections).where(eq(schema.trackerConnections.workspaceId, ws.id));
    await tx.delete(schema.aiConfigs).where(eq(schema.aiConfigs.workspaceId, ws.id));
    await tx.delete(schema.auditEvents).where(eq(schema.auditEvents.workspaceId, ws.id));
    await tx.delete(schema.workspaceMembers).where(eq(schema.workspaceMembers.workspaceId, ws.id));
    const gone = await tx
      .delete(schema.workspaces)
      .where(eq(schema.workspaces.id, ws.id))
      .returning({ id: schema.workspaces.id });
    if (gone.length !== 1) throw new Error("The workspace could not be deleted. Nothing was changed.");
  });

  await logAudit({
    workspaceId: next.workspace.id,
    actorId: ctx.user.id,
    actorLabel: ctx.user.name,
    action: "workspace.deleted",
    entityType: "workspace",
    entityId: ws.id,
    after: { name: ws.name, ...removed },
  });

  (await cookies()).set(WS_COOKIE, next.workspace.id, COOKIE_OPTS);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
