"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { logAudit } from "@/lib/guard";
import { appOrigin } from "@/lib/jira-workspace";
import { generateWebhookToken, hashWebhookToken } from "@/lib/webhook";
import { requireWorkspace } from "@/lib/workspace";

export type WebhookState = { error?: string; ok?: string; url?: string };

async function owner() {
  const ctx = await requireWorkspace();
  if (ctx.role !== "owner") throw new Error("Only the workspace owner can manage the webhook.");
  return ctx;
}

/**
 * Creates the workspace's webhook address, or replaces it (the old address
 * stops working at once). The full address is returned ONCE — only a hash is kept.
 */
export async function createOrRegenerateWebhook(_prev: WebhookState, _fd: FormData): Promise<WebhookState> {
  try {
    const ctx = await owner();
    const token = generateWebhookToken();
    const db = await getDb();
    const [existing] = await db
      .select({ id: schema.incomingWebhooks.id })
      .from(schema.incomingWebhooks)
      .where(eq(schema.incomingWebhooks.workspaceId, ctx.workspace.id))
      .limit(1);
    const values = { tokenHash: hashWebhookToken(token), tokenHint: token.slice(-4), enabled: true, createdBy: ctx.user.id, createdAt: new Date() };
    if (existing) {
      await db.update(schema.incomingWebhooks).set(values).where(eq(schema.incomingWebhooks.workspaceId, ctx.workspace.id));
    } else {
      await db.insert(schema.incomingWebhooks).values({ workspaceId: ctx.workspace.id, ...values });
    }
    await logAudit({
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      actorLabel: ctx.user.name,
      action: existing ? "webhook.regenerated" : "webhook.created",
      entityType: "workspace",
      entityId: ctx.workspace.id,
      after: { hint: values.tokenHint },
    });
    revalidatePath("/integrations");
    return {
      ok: existing ? "New address created — the old one has stopped working." : "Webhook address created.",
      url: `${await appOrigin()}/api/hooks/feedback/${token}`,
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Switches the address off or back on, without changing it. */
export async function setWebhookEnabled(_prev: WebhookState, fd: FormData): Promise<WebhookState> {
  try {
    const ctx = await owner();
    const enabled = fd.get("enabled") === "true";
    const db = await getDb();
    await db.update(schema.incomingWebhooks).set({ enabled }).where(eq(schema.incomingWebhooks.workspaceId, ctx.workspace.id));
    await logAudit({
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      actorLabel: ctx.user.name,
      action: enabled ? "webhook.enabled" : "webhook.disabled",
      entityType: "workspace",
      entityId: ctx.workspace.id,
    });
    revalidatePath("/integrations");
    return { ok: enabled ? "Switched back on." : "Switched off — anything sent to it is now refused." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
