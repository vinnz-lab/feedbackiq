import { createHash } from "node:crypto";
import { currentAiKey, type AiKey } from "./ai-context";
import { PROVIDERS, type ProviderId } from "./providers";

/**
 * One way to ask any supported AI for a JSON answer: Google Gemini, OpenAI or
 * Anthropic Claude, over plain REST (no SDKs).
 *
 * Which key/provider/model: the one set for the current AI action with
 * withAiKey() (the workspace's own key, or the platform's Gemini key). Only
 * with no such context — tests and scripts — does it fall back to
 * GEMINI_API_KEY.
 *
 * Shared behaviour, whatever the provider:
 *  - PACING, one lane per key (each key has its own quota).
 *  - RETRY with backoff on "slow down" answers, preferring the provider's own
 *    retry hint; a spent daily quota or credit balance is reported at once.
 *  - A time limit per request, so one stuck call can't eat a whole batch run.
 */
const PLATFORM_MODEL = process.env.GEMINI_MODEL || PROVIDERS.gemini.defaultModel;
const RPM = Math.max(1, Number(process.env.AI_RPM || process.env.GEMINI_RPM) || 60);
const BASE_INTERVAL_MS = Math.ceil(60_000 / RPM);
const MAX_INTERVAL_MS = 20_000;
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 90_000;
const MAX_OUTPUT_TOKENS = 8192;

type Lane = { interval: number; lastCallAt: number; chain: Promise<unknown> };
const lanes = new Map<string, Lane>();
function laneFor(key: string): Lane {
  // Keyed by a hash, so the key itself isn't kept as a map key in memory dumps.
  const id = createHash("sha256").update(key).digest("hex").slice(0, 16);
  let lane = lanes.get(id);
  if (!lane) {
    lane = { interval: BASE_INTERVAL_MS, lastCallAt: 0, chain: Promise.resolve() };
    lanes.set(id, lane);
  }
  return lane;
}

/** The key, provider and model the current call must use. */
export function activeAi(): AiKey | undefined {
  const ai = currentAiKey();
  if (ai) return ai;
  const k = process.env.GEMINI_API_KEY;
  return k ? { key: k, source: "platform", provider: "gemini", model: PLATFORM_MODEL } : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Which allowance ran out. A per-minute limit clears in seconds; the others don't. */
export type ThrottleScope = "minute" | "day" | "credit" | "unknown";

export class AiRateLimitError extends Error {
  readonly scope: ThrottleScope;
  readonly retryAfterSeconds: number | null;
  readonly provider: ProviderId;

  constructor(msg: string, scope: ThrottleScope, retryAfterSeconds: number | null, provider: ProviderId = "gemini") {
    super(msg);
    this.name = "AiRateLimitError";
    this.scope = scope;
    this.retryAfterSeconds = retryAfterSeconds;
    this.provider = provider;
  }

  /** Plain-language advice, driven by what the provider actually said. */
  get advice(): string {
    const who = this.provider === "gemini" ? "Gemini" : PROVIDERS[this.provider].company;
    if (this.scope === "credit") {
      const where = this.provider === "openai" ? "platform.openai.com → Billing" : this.provider === "anthropic" ? "console.anthropic.com → Billing" : "Google AI Studio";
      return `the ${who} account behind this key has no API credit left — add credit at ${where}, then run it again.`;
    }
    if (this.scope === "day") {
      return this.provider === "gemini"
        ? "the daily Gemini free-tier quota is used up — it resets at midnight Pacific, so waiting a minute will not help."
        : `the daily ${who} limit for this key is used up — try again tomorrow, or raise the limit in your ${who} account.`;
    }
    const wait = this.retryAfterSeconds ? `about ${Math.max(5, Math.ceil(this.retryAfterSeconds))} seconds` : "a minute";
    if (this.scope === "minute") return `the per-minute ${who} limit was hit — wait ${wait} and try again.`;
    return `${who} is busy or rate limiting — wait ${wait} and try again. If it keeps happening, the account's limit may be spent.`;
  }
}

/** Kept for older imports. */
export const GeminiRateLimitError = AiRateLimitError;

/** Reads Gemini's 429 body: which quota ran out, and its RetryInfo delay. */
export function parseThrottle(body: string): { scope: ThrottleScope; retryAfterSeconds: number | null } {
  const scope: ThrottleScope = /per[\s_-]*day|PerDay|daily/i.test(body)
    ? "day"
    : /per[\s_-]*minute|PerMinute/i.test(body)
      ? "minute"
      : "unknown";
  const m = body.match(/"?retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/i);
  return { scope, retryAfterSeconds: m ? Number(m[1]) : null };
}

function retryAfter(res: Response): number | null {
  const h = res.headers.get("retry-after");
  if (!h) return null;
  const n = Number(h);
  if (Number.isFinite(n)) return n;
  const d = Date.parse(h);
  return Number.isFinite(d) ? Math.max(0, (d - Date.now()) / 1000) : null;
}

/**
 * Turns a model's text answer into an object. Some providers have a strict
 * JSON mode; for the others the answer may arrive wrapped in ``` fences or
 * with a sentence around it, so take the outermost {...}.
 */
export function parseJsonObject(text: string): Record<string, unknown> {
  const t = text.trim();
  const tryParse = (s: string) => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(t);
  if (direct) return direct;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fenced) {
    const f = tryParse(fenced[1].trim());
    if (f) return f;
  }
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) {
    const inner = tryParse(t.slice(a, b + 1));
    if (inner) return inner;
  }
  throw new Error("The AI's answer wasn't valid JSON.");
}

const JSON_ONLY = "You reply with a single valid JSON object and nothing else — no explanation, no code fences.";

/** Errors: never echo more than a short slice of the provider's body, and never the key. */
function apiError(provider: ProviderId, status: number, body: string) {
  return new Error(`${PROVIDERS[provider].company} API ${status}: ${body.slice(0, 300)}`);
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function callGemini(prompt: string, ai: AiKey): Promise<string> {
  // Key in a header, not the URL, so it can't end up in request logs.
  const res = await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ai.model)}:generateContent`,
    { "x-goog-api-key": ai.key },
    { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.2 } },
  );
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429 || res.status === 503 || /RESOURCE_EXHAUSTED|UNAVAILABLE/i.test(body)) {
      const { scope, retryAfterSeconds } = parseThrottle(body);
      throw new AiRateLimitError(`Gemini API ${res.status}: ${body.slice(0, 300)}`, scope, retryAfterSeconds, "gemini");
    }
    throw apiError("gemini", res.status, body);
  }
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) throw new Error("Gemini returned no text");
  return text;
}

/** OpenAI's reasoning models (gpt-5*, o-series) take no temperature, and think less when asked. */
const isOpenAiReasoning = (model: string) => /^(gpt-5|o\d)/i.test(model);

async function callOpenAi(prompt: string, ai: AiKey): Promise<string> {
  const reasoning = isOpenAiReasoning(ai.model);
  const res = await post(
    "https://api.openai.com/v1/chat/completions",
    { Authorization: `Bearer ${ai.key}` },
    {
      model: ai.model,
      messages: [
        { role: "system", content: JSON_ONLY },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      ...(reasoning ? { reasoning_effort: "low" } : { temperature: 0.2 }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429 || res.status === 503) {
      const scope: ThrottleScope = /insufficient_quota|exceeded your current quota|billing/i.test(body)
        ? "credit"
        : /per day|RPD|TPD/i.test(body)
          ? "day"
          : res.status === 429
            ? "minute"
            : "unknown";
      throw new AiRateLimitError(`OpenAI API ${res.status}: ${body.slice(0, 300)}`, scope, retryAfter(res), "openai");
    }
    throw apiError("openai", res.status, body);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string | null; refusal?: string | null } }[] };
  const msg = data?.choices?.[0]?.message;
  if (!msg?.content) throw new Error(msg?.refusal ? `OpenAI declined: ${msg.refusal.slice(0, 200)}` : "OpenAI returned no text");
  return msg.content;
}

async function callAnthropic(prompt: string, ai: AiKey): Promise<string> {
  const res = await post(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": ai.key, "anthropic-version": "2023-06-01" },
    {
      model: ai.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.2,
      system: JSON_ONLY,
      messages: [{ role: "user", content: prompt }],
    },
  );
  if (!res.ok) {
    const body = await res.text();
    if (/credit balance is too low|billing/i.test(body) && (res.status === 400 || res.status === 402 || res.status === 403)) {
      throw new AiRateLimitError(`Anthropic API ${res.status}: ${body.slice(0, 300)}`, "credit", null, "anthropic");
    }
    if (res.status === 429 || res.status === 529 || res.status === 503) {
      throw new AiRateLimitError(`Anthropic API ${res.status}: ${body.slice(0, 300)}`, res.status === 429 ? "minute" : "unknown", retryAfter(res), "anthropic");
    }
    throw apiError("anthropic", res.status, body);
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
  const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  if (!text) throw new Error("Claude returned no text");
  if (data.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off (too long). Try a shorter source.");
  return text;
}

async function callOnce(prompt: string, ai: AiKey): Promise<Record<string, unknown>> {
  const text =
    ai.provider === "openai" ? await callOpenAi(prompt, ai) : ai.provider === "anthropic" ? await callAnthropic(prompt, ai) : await callGemini(prompt, ai);
  return parseJsonObject(text);
}

/** Ask the current workspace's AI for a JSON object. */
export async function aiJson(prompt: string): Promise<Record<string, unknown>> {
  const ai = activeAi();
  if (!ai) throw new Error("GEMINI_API_KEY is not set");
  return runPaced(ai, prompt);
}

/** Same, with an explicit key — used to test a key before it's saved. */
export async function aiJsonWith(ai: AiKey, prompt: string): Promise<Record<string, unknown>> {
  return runPaced(ai, prompt, 1);
}

function runPaced(ai: AiKey, prompt: string, attempts = MAX_ATTEMPTS): Promise<Record<string, unknown>> {
  const lane = laneFor(ai.key);
  // Queue behind any in-flight call so the pacing gap is honoured even when callers fire concurrently.
  const run = lane.chain.then(async () => {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const wait = Math.max(0, lane.lastCallAt + lane.interval - Date.now());
      if (wait > 0) await sleep(wait);
      lane.lastCallAt = Date.now();
      try {
        const out = await callOnce(prompt, ai);
        lane.interval = Math.max(BASE_INTERVAL_MS, Math.floor(lane.interval * 0.9));
        return out;
      } catch (e) {
        lastErr = e;
        if (!(e instanceof AiRateLimitError)) throw e;
        // A spent daily quota or empty credit balance won't recover within this run.
        if (e.scope === "day" || e.scope === "credit") throw e;
        lane.interval = Math.min(MAX_INTERVAL_MS, Math.ceil(lane.interval * 1.5));
        if (attempt < attempts) {
          const hinted = e.retryAfterSeconds ? e.retryAfterSeconds * 1000 : 0;
          await sleep(Math.min(MAX_INTERVAL_MS, Math.max(hinted, lane.interval * attempt)));
        }
      }
    }
    throw lastErr;
  });
  lane.chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Current pacing gap, so batch jobs can budget how many items fit in a run. */
export function currentIntervalMs() {
  const ai = activeAi();
  return ai ? laneFor(ai.key).interval : BASE_INTERVAL_MS;
}

/** The model the platform key uses. */
export const GEMINI_MODEL = PLATFORM_MODEL;
