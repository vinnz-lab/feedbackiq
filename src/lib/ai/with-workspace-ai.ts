import { requireWorkspace } from "@/lib/workspace";
import { withAiKey, type AiKey } from "./ai-context";
import { resolveAiKey } from "./workspace-key";

/**
 * Runs an AI action on the CURRENT workspace's key.
 *
 * Every server action that calls Gemini goes through this, so its calls use
 * the workspace's own key (or the platform key it's allowed to use) — never a
 * global one. If there's no key it may use, `fallback` returns the action's
 * normal "error" result with a message saying how to fix it.
 */
export async function withWorkspaceAi<T>(fallback: (error: string) => T, fn: () => Promise<T>): Promise<T> {
  let ai: AiKey;
  try {
    const ctx = await requireWorkspace();
    ai = await resolveAiKey(ctx.workspace.id);
  } catch (e) {
    return fallback((e as Error).message);
  }
  return withAiKey(ai, fn);
}
