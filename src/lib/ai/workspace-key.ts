import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { decryptSecret } from "@/lib/secret-box";
import type { AiKey } from "./ai-context";
import { cleanModel, isProvider, PROVIDERS, type ProviderId } from "./providers";

/** Shown to the user when a workspace has no key it's allowed to use. */
export class NoAiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoAiKeyError";
  }
}

export type AiKeyStatus = {
  /** What AI calls in this workspace will actually use. */
  using: "workspace" | "platform" | "none";
  hasOwnKey: boolean;
  /** The provider and model AI in this workspace will use. */
  provider: ProviderId;
  model: string;
  last4: string | null;
  allowPlatformKey: boolean;
  updatedAt: Date | null;
};

const platformModel = () => process.env.GEMINI_MODEL || PROVIDERS.gemini.defaultModel;

/** A saved row's provider and model, falling back to safe defaults. */
function providerAndModel(row: { provider: string | null; model: string | null }): { provider: ProviderId; model: string } {
  const provider = isProvider(row.provider) ? row.provider : "gemini";
  return { provider, model: cleanModel(row.model) ?? PROVIDERS[provider].defaultModel };
}

export async function getAiKeyStatus(workspaceId: string): Promise<AiKeyStatus> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.workspaceAiSettings)
    .where(eq(schema.workspaceAiSettings.workspaceId, workspaceId))
    .limit(1);
  const hasOwnKey = Boolean(row?.encryptedKey);
  const allowPlatformKey = row?.allowPlatformKey ?? true;
  const own = hasOwnKey ? providerAndModel(row) : null;
  return {
    using: hasOwnKey ? "workspace" : allowPlatformKey ? "platform" : "none",
    hasOwnKey,
    provider: own?.provider ?? "gemini",
    model: own?.model ?? platformModel(),
    last4: row?.keyLast4 ?? null,
    allowPlatformKey,
    updatedAt: row?.updatedAt ?? null,
  };
}

/**
 * The key this workspace's AI work must run on.
 *
 *  1. Its own key, if it has one.
 *  2. Otherwise the platform key — only if the platform owner allows it.
 *  3. Otherwise refuse, with a message saying how to fix it.
 *
 * A saved key that can't be decrypted is an ERROR, never a silent fall back to
 * the platform key: that would quietly bill the platform owner for a workspace
 * that is meant to pay for itself.
 */
export async function resolveAiKey(workspaceId: string): Promise<AiKey> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.workspaceAiSettings)
    .where(eq(schema.workspaceAiSettings.workspaceId, workspaceId))
    .limit(1);

  if (row?.encryptedKey) {
    try {
      return { key: decryptSecret(row.encryptedKey), source: "workspace", ...providerAndModel(row) };
    } catch {
      throw new NoAiKeyError(
        "This workspace's saved AI key can't be read. Its owner should add the key again in Integrations → AI.",
      );
    }
  }
  if (row && !row.allowPlatformKey) {
    throw new NoAiKeyError(
      "This workspace needs its own AI key. Its owner can add one in Integrations → AI.",
    );
  }
  const platform = process.env.GEMINI_API_KEY;
  if (!platform) throw new NoAiKeyError("No AI key is configured for this app yet.");
  return { key: platform, source: "platform", provider: "gemini", model: platformModel() };
}
