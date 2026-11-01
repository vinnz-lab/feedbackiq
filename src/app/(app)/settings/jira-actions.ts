"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { checkJiraConnection, NAME_MODES, normalizeJiraSite, type NameMode } from "@/lib/jira";
import { getJiraConnection, isConnected } from "@/lib/jira-workspace";
import { logAudit } from "@/lib/guard";
import { canEncrypt, decryptSecret, encryptSecret } from "@/lib/secret-box";
import { requireWorkspace } from "@/lib/workspace";

export type JiraSaveState = { error?: string; ok?: string };

/**
 * Connects (or updates) this workspace's Jira. Owner only. Everything is
 * checked with Jira first; nothing is saved if the details don't work. Leave
 * the token blank to keep the saved one (e.g. to change only the name setting).
 */
export async function saveJiraConnection(_prev: JiraSaveState, formData: FormData): Promise<JiraSaveState> {
  try {
    const ctx = await requireWorkspace();
    if (ctx.role !== "owner") return { error: "Only the workspace owner can connect Jira." };
    if (!canEncrypt()) return { error: "Saving connections isn't switched on yet (AI_KEYS_SECRET isn't set)." };

    const site = normalizeJiraSite(String(formData.get("site") ?? ""));
    if (!site.ok) return { error: site.error };
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter the email of the Atlassian account the token belongs to." };
    const projectKey = String(formData.get("projectKey") ?? "").trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,9}$/.test(projectKey)) return { error: "Enter the project key — the short code at the start of its tickets, e.g. FIQ in FIQ-12." };
    const issueTypeIn = String(formData.get("issueType") ?? "").trim() || "Story";
    const nameMode = String(formData.get("nameMode") ?? "include") as NameMode;
    if (!NAME_MODES.includes(nameMode)) return { error: "Choose how customer names appear in tickets." };

    // Token: a new one, or keep the saved one if it's for the same site and account.
    let token = String(formData.get("token") ?? "").trim();
    const existing = await getJiraConnection(ctx.workspace.id);
    if (!token) {
      if (isConnected(existing) && existing.siteUrl === site.site && existing.authEmail === email) {
        try {
          token = decryptSecret(existing.encryptedToken);
        } catch {
          return { error: "The saved token can't be read. Paste the API token again." };
        }
      } else {
        return { error: "Paste a Jira API token." };
      }
    }
    if (/\s/.test(token) || token.length < 10 || token.length > 1000) return { error: "That doesn't look like a Jira API token." };

    const check = await checkJiraConnection({ site: site.site, email, token }, projectKey, issueTypeIn);
    if (!check.ok) return { error: check.error };

    const db = await getDb();
    const values = {
      workspaceId: ctx.workspace.id,
      provider: "jira",
      siteUrl: site.site,
      authEmail: email,
      encryptedToken: encryptSecret(token),
      tokenLast4: token.slice(-4),
      projectKey,
      issueType: check.issueType,
      nameMode,
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    };
    const { workspaceId: _w, ...update } = values;
    void _w;
    await db
      .insert(schema.trackerConnections)
      .values(values)
      .onConflictDoUpdate({ target: schema.trackerConnections.workspaceId, set: update });

    await logAudit({
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      actorLabel: ctx.user.name,
      action: "jira.connected",
      entityType: "workspace",
      entityId: ctx.workspace.id,
      after: { site: site.site, projectKey, issueType: check.issueType, nameMode },
    });
    revalidatePath("/settings");
    revalidatePath("/integrations");
    revalidatePath("/roadmap");
    return { ok: `Connected to ${check.projectName} (${projectKey}) as ${check.who}.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Disconnects Jira. Existing ticket links on the roadmap stay. Owner only. */
export async function disconnectJira(_prev: JiraSaveState, _fd: FormData): Promise<JiraSaveState> {
  try {
    const ctx = await requireWorkspace();
    if (ctx.role !== "owner") return { error: "Only the workspace owner can disconnect Jira." };
    const db = await getDb();
    await db.delete(schema.trackerConnections).where(eq(schema.trackerConnections.workspaceId, ctx.workspace.id));
    await logAudit({
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      actorLabel: ctx.user.name,
      action: "jira.disconnected",
      entityType: "workspace",
      entityId: ctx.workspace.id,
    });
    revalidatePath("/settings");
    revalidatePath("/integrations");
    revalidatePath("/roadmap");
    return { ok: "Jira disconnected. Existing ticket links on the roadmap are kept." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
