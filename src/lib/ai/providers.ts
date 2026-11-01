/**
 * The AI providers a workspace can bring its own key for, and their models.
 * Client-safe: no server imports, so the settings screen can use it too.
 */
export type ProviderId = "gemini" | "openai" | "anthropic";

export type ModelChoice = { id: string; label: string };
export type ProviderInfo = {
  id: ProviderId;
  name: string; // shown to people
  company: string;
  keyUrl: string; // where to get a key
  keyWhere: string; // plain-language path
  keyHint: RegExp; // what its keys look like
  defaultModel: string;
  models: ModelChoice[];
  billingNote: string;
};

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    company: "Google",
    keyUrl: "https://aistudio.google.com/apikey",
    keyWhere: "Google AI Studio → API keys",
    keyHint: /^AIza[0-9A-Za-z_-]{30,}$/,
    defaultModel: "gemini-3.1-flash-lite",
    models: [{ id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite — fast and cheapest (recommended)" }],
    billingNote: "Usage is billed by Google to the account the key belongs to.",
  },
  openai: {
    id: "openai",
    name: "OpenAI (ChatGPT)",
    company: "OpenAI",
    keyUrl: "https://platform.openai.com/api-keys",
    keyWhere: "platform.openai.com → API keys",
    keyHint: /^sk-(?!ant-)[0-9A-Za-z_-]{20,}$/,
    defaultModel: "gpt-5-mini",
    models: [
      { id: "gpt-5-mini", label: "GPT-5 mini — good balance (recommended)" },
      { id: "gpt-5-nano", label: "GPT-5 nano — fastest and cheapest" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini — quick, no reasoning step" },
    ],
    billingNote:
      "A ChatGPT Plus or Pro subscription doesn't include API use — the key needs API credit, added at platform.openai.com → Billing.",
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic (Claude)",
    company: "Anthropic",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyWhere: "console.anthropic.com → API keys",
    keyHint: /^sk-ant-[0-9A-Za-z_-]{20,}$/,
    defaultModel: "claude-haiku-4-5",
    models: [
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 — fast and cheapest (recommended)" },
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5 — more capable, costs more" },
    ],
    billingNote:
      "A Claude Pro or Max subscription doesn't include API use — the key needs API credit, added at console.anthropic.com → Billing.",
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function isProvider(x: unknown): x is ProviderId {
  return typeof x === "string" && x in PROVIDERS;
}

/** Model names are passed to the provider's API, so only plain characters. */
export function cleanModel(x: unknown): string | null {
  const m = typeof x === "string" ? x.trim() : "";
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{1,79}$/.test(m) ? m : null;
}

/** Which provider a pasted key most likely belongs to, to catch mix-ups. */
export function guessProvider(key: string): ProviderId | null {
  for (const p of PROVIDER_IDS) if (PROVIDERS[p].keyHint.test(key)) return p;
  return null;
}
