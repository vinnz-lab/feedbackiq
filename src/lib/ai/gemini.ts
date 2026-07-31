/**
 * Minimal Gemini client via REST (no SDK dependency).
 * Key lives in GEMINI_API_KEY (env only — never in source or chat).
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
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

/** Requests per minute to aim for. Free-tier Flash has historically been
 *  ~10–15 RPM; Google now shows your real limit in the AI Studio dashboard.
 *  Raise via GEMINI_RPM if your tier allows more. */
const RPM = Math.max(1, Number(process.env.GEMINI_RPM) || 12);
const BASE_INTERVAL_MS = Math.ceil(60_000 / RPM);
const MAX_INTERVAL_MS = 20_000;
const MAX_ATTEMPTS = 3;

/** Self-tuning pacing: sustained 429s widen the gap for the rest of the run
 *  instead of hammering a limit we already know we've hit. */
let interval = BASE_INTERVAL_MS;
let lastCallAt = 0;
let chain: Promise<unknown> = Promise.resolve();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GeminiRateLimitError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "GeminiRateLimitError";
  }
}

/** True when Gemini is saying "slow down" rather than "you got it wrong". */
function isThrottle(status: number, body: string) {
  return status === 429 || status === 503 || /RESOURCE_EXHAUSTED|UNAVAILABLE/i.test(body);
}

async function callOnce(prompt: string, key: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const msg = `Gemini API ${res.status}: ${body.slice(0, 200)}`;
    if (isThrottle(res.status, body)) throw new GeminiRateLimitError(msg);
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
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  // Queue behind any in-flight call so the pacing gap is honoured even when
  // callers fire concurrently.
  const run = chain.then(async () => {
    let lastErr: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const wait = Math.max(0, lastCallAt + interval - Date.now());
      if (wait > 0) await sleep(wait);
      lastCallAt = Date.now();

      try {
        const out = await callOnce(prompt, key);
        // Ease back toward the base rate after a clean call.
        interval = Math.max(BASE_INTERVAL_MS, Math.floor(interval * 0.9));
        return out;
      } catch (e) {
        lastErr = e;
        if (!(e instanceof GeminiRateLimitError)) throw e;
        interval = Math.min(MAX_INTERVAL_MS, Math.ceil(interval * 1.5));
        if (attempt < MAX_ATTEMPTS) await sleep(interval * attempt);
      }
    }
    throw lastErr;
  });

  // Keep the chain alive regardless of this call's outcome.
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Current pacing gap, so batch jobs can budget how many items fit in a run. */
export function currentIntervalMs() {
  return interval;
}
