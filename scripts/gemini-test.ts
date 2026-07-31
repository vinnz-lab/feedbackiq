/**
 * Unit tests for the Gemini client's pacing + retry behaviour.
 *
 * Stubs global fetch so the 429 path can be exercised without a real API key
 * and without adding any production config knob (e.g. an overridable base URL)
 * that could later be used to redirect AI traffic.
 *
 * Run: npx tsx scripts/gemini-test.ts
 */
type FetchFn = typeof globalThis.fetch;

const pass: string[] = [];
const fail: string[] = [];
const check = (name: string, ok: boolean, detail = "") =>
  (ok ? pass : fail).push(`${name}${detail ? " — " + detail : ""}`);

function jsonBody(obj: unknown) {
  return JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }],
  });
}

function makeResponse(status: number, body: string): Response {
  return new Response(body, { status, headers: { "Content-Type": "application/json" } });
}

async function main() {
  // Fast pacing so the tests don't sit around waiting.
  process.env.GEMINI_RPM = "600"; // 100ms interval
  process.env.GEMINI_API_KEY = "test-key";

  const { geminiJson, GeminiRateLimitError } = await import("../src/lib/ai/gemini.ts");

  const realFetch = globalThis.fetch;
  const calls: number[] = [];

  // --- 1. Transient 429 then success: must retry, not give up. ---
  let n = 0;
  globalThis.fetch = (async () => {
    calls.push(Date.now());
    n++;
    if (n === 1) return makeResponse(429, '{"error":{"status":"RESOURCE_EXHAUSTED"}}');
    return makeResponse(200, jsonBody({ ok: true }));
  }) as FetchFn;

  try {
    const out = await geminiJson("prompt");
    check("retries after a transient 429", out.ok === true, `${n} attempts`);
  } catch (e) {
    check("retries after a transient 429", false, `threw: ${(e as Error).message}`);
  }

  // --- 2. Persistent 429: must surface as GeminiRateLimitError (so the caller
  //        can say "rate limited" rather than a generic failure). ---
  n = 0;
  globalThis.fetch = (async () => {
    n++;
    return makeResponse(429, '{"error":{"status":"RESOURCE_EXHAUSTED"}}');
  }) as FetchFn;

  try {
    await geminiJson("prompt");
    check("persistent 429 throws", false, "did not throw");
  } catch (e) {
    check(
      "persistent 429 throws GeminiRateLimitError",
      e instanceof GeminiRateLimitError,
      `${(e as Error).name} after ${n} attempts`,
    );
    check("gives up after bounded attempts", n <= 4, `${n} attempts`);
  }

  // --- 3. A real error (400) must NOT be retried — retrying a malformed
  //        request just burns quota. ---
  n = 0;
  globalThis.fetch = (async () => {
    n++;
    return makeResponse(400, '{"error":{"message":"API key not valid"}}');
  }) as FetchFn;

  try {
    await geminiJson("prompt");
    check("400 throws", false, "did not throw");
  } catch (e) {
    check("400 is not retried", n === 1, `${n} attempt(s)`);
    check("400 is not misreported as rate limiting", !(e instanceof GeminiRateLimitError));
  }

  // --- 4. Pacing: sequential calls must be separated by the interval. ---
  const stamps: number[] = [];
  globalThis.fetch = (async () => {
    stamps.push(Date.now());
    return makeResponse(200, jsonBody({ ok: true }));
  }) as FetchFn;

  await geminiJson("a");
  await geminiJson("b");
  await geminiJson("c");
  const gaps = stamps.slice(1).map((t, i) => t - stamps[i]);
  check(
    "calls are paced apart",
    gaps.every((g) => g >= 90),
    `gaps: ${gaps.join("ms, ")}ms (target ≥100ms)`,
  );

  // --- 5. Concurrent callers must still be serialised, not fired at once. ---
  stamps.length = 0;
  await Promise.all([geminiJson("x"), geminiJson("y"), geminiJson("z")]);
  const cGaps = stamps.slice(1).map((t, i) => t - stamps[i]);
  check(
    "concurrent callers are serialised",
    cGaps.every((g) => g >= 90),
    `gaps: ${cGaps.join("ms, ")}ms`,
  );

  globalThis.fetch = realFetch;

  console.log("\nPASS:");
  pass.forEach((p) => console.log("  ✓ " + p));
  if (fail.length) {
    console.log("\nFAIL:");
    fail.forEach((f) => console.log("  ✗ " + f));
  }
  console.log(`\n${pass.length}/${pass.length + fail.length} checks passed`);
  process.exit(fail.length ? 1 : 0);
}
main();
