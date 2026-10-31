import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Which Gemini key the current AI work runs on.
 *
 * Set once per AI action with withAiKey(); every Gemini call inside it —
 * however deep in classify / extract / summarise / digest — picks it up, so no
 * call can accidentally use the wrong workspace's key or bill the platform.
 */
export type AiKey = {
  key: string;
  /** "workspace" = the workspace's own key; "platform" = the platform owner's. */
  source: "workspace" | "platform";
};

const store = new AsyncLocalStorage<AiKey>();

export function withAiKey<T>(ai: AiKey, fn: () => Promise<T>): Promise<T> {
  return store.run(ai, fn);
}

export function currentAiKey(): AiKey | undefined {
  return store.getStore();
}
