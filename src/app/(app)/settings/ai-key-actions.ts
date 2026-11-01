"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { aiJsonWith, AiRateLimitError } from "@/lib/ai/client";
import { cleanModel, guessProvider, isProvider, PROVIDERS, type ProviderId } from "@/lib/ai/providers";
import { logAudit } from "@/lib/guard";
import { canEncrypt, decryptSecret, encryptSecret } from "@/lib/secret-box";
import { requireWorkspace } from "@/lib/workspace";

export type AiKeyState = { error?: string; ok?: string };

/** Asks the provider whether the key can use the model. Costs nothing. */
async function checkModel(provider: ProviderId, model: string, key: string): Promise<string | null> {
  const p = PROVIDERS[provider];
  const m = encodeURIComponent(model);
  const req: { url: string; headers: Record<string, string> } =
    provider === "openai"
      ? { url: `https://api.openai.com/v1/models/${m}`, headers: { Authorization: `Bearer ${key}` } }
      : provider === "anthropic"
        ? { url: `https://api.anthropic.com/v1/models/${m}`, headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } }
        : { url: `https://generativelanguage.googleapis.com/v1beta/models/${m}`, headers: { "x-goog-api-key": key } };
  try {
    const res = await fetch(req.url, { headers: req.headers, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (res.ok) return null;
    if (res.status === 401 || res.status === 403 || (provider === "gemini" && res.status === 400)) {
      return `${p.company} didn't accept this key. Check you copied all of it, from ${p.keyWhere}.`;
    }
    if (res.status === 404) return `This key can't use the model “${model}”. Pick another model, or check the name.`;
    if (res.status === 429) return `${p.company} says this key is over its limit right now. Try again in a minute.`;
    return `${p.company} couldn't check the key (error ${res.status}). Try again shortly.`;
  } catch {
    return `Couldn't reach ${p.company} to check the key. Try again shortly.`;
  }
}

/** One tiny real request, so a key with no API credit (or a model that needs other settings) is caught now. */
async function tryIt(provider: ProviderId, model: string, key: string): Promise<string | null> {
  const p = PROVIDERS[provider];
  try {
    await aiJsonWith({ key, source: "workspace", provider, model }, 'Reply with this JSON object exactly: {"ok": true}');
    return null;
  } catch (e) {
    if (e instanceof AiRateLimitError) {
      if (e.scope === "credit") return `The key works, but the ${p.company} account has no API credit. ${p.billingNote}`;
      return `The key works, but ${p.company} is rate limiting it right now. Try again in a minute.`;
    }
    const msg = (e as Error).message ?? "";
    if (/credit|billing|quota/i.test(msg)) return `The key works, but the ${p.company} account has no API credit. ${p.billingNote}`;
    return `The key was accepted, but a test request with “${model}” failed: ${msg.replace(/sk-[A-Za-z0-9_-]+|AIza[0-9A-Za-z_-]+/g, "[key]").slice(0, 220)}`;
  }
}

/**
 * Saves the workspace's OWN AI key — provider, model and key — after checking
 * it works. Owner only. Leaving the key blank keeps the saved key and just
 * changes the model (same provider only).
 */
export async function saveAiKey(_prev: AiKeyState, formData: FormData): Promise<AiKeyState> {
  try {
    const ctx = await requireWorkspace();
    if (ctx.role !== "owner") return { error: "Only the workspace owner can change its AI key." };
    if (!canEncrypt()) {
      return { error: "Saving keys isn't switched on yet (the platform owner needs to set AI_KEYS_SECRET)." };
    }
    const providerRaw = String(formData.get("provider") ?? "gemini");
    if (!isProvider(providerRaw)) return { error: "Pick an AI provider." };
    const provider = providerRaw;
    const p = PROVIDERS[provider];
    const modelChoice = String(formData.get("model") ?? "");
    const model = cleanModel(modelChoice === "__other" ? formData.get("customModel") : modelChoice || p.defaultModel);
    if (!model) return { error: "Type a valid model name (letters, numbers, dots and dashes)." };

    const db = await getDb();
    const [existing] = await db
      .select()
      .from(schema.workspaceAiSettings)
      .where(eq(schema.workspaceAiSettings.workspaceId, ctx.workspace.id))
      .limit(1);

    let key = String(formData.get("apiKey") ?? "").trim();
    let keptKey = false;
    if (!key) {
      if (existing?.encryptedKey && (existing.provider ?? "gemini") === provider) {
        try {
          key = decryptSecret(existing.encryptedKey);
          keptKey = true;
        } catch {
          return { error: "The saved key can't be read any more. Paste the key again." };
        }
      } else {
        return { error: `Paste your ${p.name} API key.` };
      }
    }
    if (/\s/.test(key) || key.length < 20 || key.length > 300) return { error: `That doesn't look like a ${p.name} API key.` };
    const looksLike = guessProvider(key);
    if (looksLike && looksLike !== provider) {
      return { error: `That key looks like it's from ${PROVIDERS[looksLike].name}, not ${p.name}. Pick ${PROVIDERS[looksLike].name} above, or paste a key from ${p.company}.` };
    }
    if (provider === "gemini" && key === process.env.GEMINI_API_KEY) {
      return { error: "That's the platform's own key. Use a key from your own Google account." };
    }

    const problem = (await checkModel(provider, model, key)) ?? (await tryIt(provider, model, key));
    if (problem) return { error: problem };

    const last4 = key.slice(-4);
    const set = {
      provider,
      model,
      encryptedKey: keptKey ? existing!.encryptedKey : encryptSecret(key),
      keyLast4: last4,
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    };
    await db
      .insert(schema.workspaceAiSettings)
      .values({ workspaceId: ctx.workspace.id, ...set })
      .onConflictDoUpdate({ target: schema.workspaceAiSettings.workspaceId, set });
    // Never the key itself — only that it changed, and its last 4 characters.
    await logAudit({
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      actorLabel: ctx.user.name,
      action: "ai.key_set",
      entityType: "workspace",
      entityId: ctx.workspace.id,
      after: { last4, provider, model, keptKey },
    });
    revalidatePath("/settings");
    revalidatePath("/integrations");
    return {
      ok: keptKey
        ? `Saved. AI in this workspace now uses ${p.name} with ${model}.`
        : `Checked and saved. AI in this workspace now uses your ${p.name} key (…${last4}) with ${model}.`,
    };
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
    const cleared = { encryptedKey: null, keyLast4: null, provider: "gemini", model: null, updatedBy: ctx.user.id, updatedAt: new Date() };
    await db
      .insert(schema.workspaceAiSettings)
      .values({ workspaceId: ctx.workspace.id, ...cleared })
      .onConflictDoUpdate({ target: schema.workspaceAiSettings.workspaceId, set: cleared });
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
