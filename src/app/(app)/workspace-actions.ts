"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
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
