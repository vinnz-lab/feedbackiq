"use server";

import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { GEMINI_MODEL } from "@/lib/ai/gemini";
import { logAudit } from "@/lib/guard";
import { canEncrypt, encryptSecret } from "@/lib/secret-box";
import { requireWorkspace } from "@/lib/workspace";

export type AiKeyState = { error?: string; ok?: string };

/** Asks Google whether the key works for the model the app uses. Costs nothing. */
async function checkWithGoogle(key: string): Promise<string | null> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`, {
      headers: { "x-goog-api-key": key },
      cache: "no-store",
    });
    if (res.ok) return null;
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return "Google didn't accept this key. Check you copied all of it, from Google AI Studio → API keys.";
    }
    if (res.status === 404) return `This key can't use the AI model the app needs (${GEMINI_MODEL}).`;
    if (res.status === 429) return "Google says this key is over its limit right now. Try again in a minute.";
    return `Google couldn't check the key (error ${res.status}). Try again shortly.`;
  } catch {
    return "Couldn't reach Google to check the key. Try again shortly.";
  }
}

/** Saves the workspace's OWN Gemini key, after checking it works. Owner only. */
export async function saveAiKey(_prev: AiKeyState, formData: FormData): Promise<AiKeyState> {
  try {
    const ctx = await requireWorkspace();
    if (ctx.role !== "owner") return { error: "Only the workspace owner can change its AI key." };
    if (!canEncrypt()) {
      return { error: "Saving keys isn't switched on yet (the platform owner needs to set AI_KEYS_SECRET)." };
    }
    const key = String(formData.get("apiKey") ?? "").trim();
    if (!key) return { error: "Paste your Gemini API key." };
    if (/\s/.test(key) || key.length < 20 || key.length > 200) return { error: "That doesn't look like a Gemini API key." };
    if (key === process.env.GEMINI_API_KEY) {
      return { error: "That's the platform's own key. Use a key from your own Google account." };
    }

    const problem = await checkWithGoogle(key);
    if (problem) return { error: problem };

    const db = await getDb();
    const values = {
      workspaceId: ctx.workspace.id,
      encryptedKey: encryptSecret(key),
      keyLast4: key.slice(-4),
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    };
    await db
      .insert(schema.workspaceAiSettings)
      .values(values)
      .onConflictDoUpdate({
        target: schema.workspaceAiSettings.workspaceId,
        set: { encryptedKey: values.encryptedKey, keyLast4: values.keyLast4, updatedBy: values.updatedBy, updatedAt: values.updatedAt },
      });
    // Never the key itself — only that it changed, and its last 4 characters.
    await logAudit({
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      actorLabel: ctx.user.name,
      action: "ai.key_set",
      entityType: "workspace",
      entityId: ctx.workspace.id,
      after: { last4: values.keyLast4 },
    });
    revalidatePath("/settings");
    revalidatePath("/integrations");
    return { ok: `Saved. AI in this workspace now uses your key (…${values.keyLast4}).` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Removes the workspace's own key; it goes back to the platform key if allowed. Owner only. */
export async function removeAiKey(_prev: AiKeyState, _formData: FormData): Promise<AiKeyState> {
  try {
    const ctx = await requireWorkspace();
    if (ctx.role !== "owner") return { error: "Only the workspace owner can change its AI key." };
    const db = await getDb();
    await db
      .insert(schema.workspaceAiSettings)
      .values({ workspaceId: ctx.workspace.id, encryptedKey: null, keyLast4: null, updatedBy: ctx.user.id })
      .onConflictDoUpdate({
        target: schema.workspaceAiSettings.workspaceId,
        set: { encryptedKey: null, keyLast4: null, updatedBy: ctx.user.id, updatedAt: new Date() },
      });
    await logAudit({
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      actorLabel: ctx.user.name,
      action: "ai.key_removed",
      entityType: "workspace",
      entityId: ctx.workspace.id,
    });
    revalidatePath("/settings");
    revalidatePath("/integrations");
    return { ok: "Your key was removed." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
