import { createHash } from "node:crypto";
import { currentAiKey } from "./ai-context";

/**
 * Minimal Gemini client via REST (no SDK dependency).
 *
 * Which key: the one set for the current AI action with withAiKey() (the
 * workspace's own key, or the platform key it's allowed to use). Only with no
 * such context — tests and scripts — does it fall back to GEMINI_API_KEY.
 * Pacing is tracked PER KEY: each key has its own quota, so one workspace's
 * heavy run never slows down another's.
 *
 * Two behaviours matter on the free tier, and both live here so every caller
 * (classify / summarise / digest) gets them automatically:
 *
 *  1. PACING. The free tier allows only a handful of requests per minute.
 *     Firing a batch as fast as possible earns a 429 for nearly every item, so
 *     calls are serialised with a minimum gap between them.
 *
 *  2. RETRY. Google's guidance for 429 RESOURCE_EXHAUSTED / 503 is exponential
 *     backoff. Without it a single throttled call silently loses that item for
 *     the whole run.
 */
// Pinned, not an alias: "-latest" aliases can move to a pricier model without
// warning. gemini-3.1-flash-lite is the cheapest current stable model ($0.25 in
// / $1.50 out per 1M tokens, paid tier) and is scheduled to run until May 2027.
// 2.5 Flash-Lite is no longer open to new accounts. Override with GEMINI_MODEL.
const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

/** Requests per minute to aim for. The paid tier allows far more than this, so
 *  60 keeps batches fast while staying well inside the limit. Lower it via
 *  GEMINI_RPM if a 429 ever appears. */
const RPM = Math.max(1, Number(process.env.GEMINI_RPM) || 60);
const BASE_INTERVAL_MS = Math.ceil(60_000 / RPM);
const MAX_INTERVAL_MS = 20_000;
const MAX_ATTEMPTS = 3;

/** Self-tuning pacing, one lane per key: sustained 429s widen that key's gap
 *  instead of hammering a limit we already know we've hit. */
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
function activeKey(): string | undefined {
  return currentAiKey()?.key ?? process.env.GEMINI_API_KEY;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Which allowance ran out. The difference matters enormously to the user: a
 *  per-minute limit clears in seconds, a daily one not until it resets. */
export type ThrottleScope = "minute" | "day" | "unknown";

export class GeminiRateLimitError extends Error {
  readonly scope: ThrottleScope;
  /** Google's own retry hint, when it supplies one. */
  readonly retryAfterSeconds: number | null;

  constructor(msg: string, scope: ThrottleScope, retryAfterSeconds: number | null) {
    super(msg);
    this.name = "GeminiRateLimitError";
    this.scope = scope;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  /** Plain-language advice, driven by what Google actually said. */
  get advice(): string {
    if (this.scope === "day") {
      return "the daily Gemini free-tier quota is used up — it resets at midnight Pacific, so waiting a minute will not help.";
    }
    const wait = this.retryAfterSeconds
      ? `about ${Math.max(5, Math.ceil(this.retryAfterSeconds))} seconds`
      : "a minute";
    if (this.scope === "minute") {
      return `the per-minute Gemini limit was hit — wait ${wait} and try again.`;
    }
    return `Gemini is rate limiting — wait ${wait} and try again. If it keeps happening, the daily quota may be spent.`;
  }
}

/** True when Gemini is saying "slow down" rather than "you got it wrong". */
function isThrottle(status: number, body: string) {
  return status === 429 || status === 503 || /RESOURCE_EXHAUSTED|UNAVAILABLE/i.test(body);
}

/**
 * Reads the useful detail out of a 429 body.
 *
 * Google names the exhausted quota (…PerDay… / …PerMinute…) and frequently
 * includes a RetryInfo delay. Both were being captured and then thrown away in
 * favour of a hardcoded "wait about a minute" — which is actively misleading
 * when it is the daily quota, because no amount of waiting a minute fixes it.
 */
export function parseThrottle(body: string): {
  scope: ThrottleScope;
  retryAfterSeconds: number | null;
} {
  const scope: ThrottleScope = /per[\s_-]*day|PerDay|daily/i.test(body)
    ? "day"
    : /per[\s_-]*minute|PerMinute/i.test(body)
      ? "minute"
      : "unknown";

  // e.g. "retryDelay": "27s"
  const m = body.match(/"?retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/i);
  const retryAfterSeconds = m ? Number(m[1]) : null;

  return { scope, retryAfterSeconds };
}

async function callOnce(prompt: string, key: string) {
  // Key in a header, not the URL, so it can't end up in request logs.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const msg = `Gemini API ${res.status}: ${body.slice(0, 300)}`;
    if (isThrottle(res.status, body)) {
      const { scope, retryAfterSeconds } = parseThrottle(body);
      throw new GeminiRateLimitError(msg, scope, retryAfterSeconds);
    }
    throw new Error(msg);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no text");
  return JSON.parse(text) as Record<string, unknown>;
}

export async function geminiJson(prompt: string): Promise<Record<string, unknown>> {
  const key = activeKey();
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const lane = laneFor(key);

  // Queue behind any in-flight call so the pacing gap is honoured even when
  // callers fire concurrently.
  const run = lane.chain.then(async () => {
    let lastErr: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const wait = Math.max(0, lane.lastCallAt + lane.interval - Date.now());
      if (wait > 0) await sleep(wait);
      lane.lastCallAt = Date.now();

      try {
        const out = await callOnce(prompt, key);
        // Ease back toward the base rate after a clean call.
        lane.interval = Math.max(BASE_INTERVAL_MS, Math.floor(lane.interval * 0.9));
        return out;
      } catch (e) {
        lastErr = e;
        if (!(e instanceof GeminiRateLimitError)) throw e;

        // A spent DAILY quota will not recover within this run, so retrying
        // just burns time and makes the failure slower to report.
        if (e.scope === "day") throw e;

        lane.interval = Math.min(MAX_INTERVAL_MS, Math.ceil(lane.interval * 1.5));
        if (attempt < MAX_ATTEMPTS) {
          // Prefer Google's own retry hint over guessing at the backoff.
          const hinted = e.retryAfterSeconds ? e.retryAfterSeconds * 1000 : 0;
          await sleep(Math.min(MAX_INTERVAL_MS, Math.max(hinted, lane.interval * attempt)));
        }
      }
    }
    throw lastErr;
  });

  // Keep the chain alive regardless of this call's outcome.
  lane.chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Current pacing gap, so batch jobs can budget how many items fit in a run. */
export function currentIntervalMs() {
  const key = activeKey();
  return key ? laneFor(key).interval : BASE_INTERVAL_MS;
}

/** The model the app uses, so a key can be checked against it. */
export const GEMINI_MODEL = MODEL;
