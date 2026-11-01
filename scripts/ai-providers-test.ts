/**
 * Bring-your-own AI: Gemini, OpenAI and Claude requests, answers and errors.
 * Run: npx tsx scripts/ai-providers-test.ts   (no network; fetch is faked)
 */
async function main() {
  let fail = 0;
  const check = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };
  process.env.AI_RPM = "6000"; // no pacing delay in tests
  delete process.env.GEMINI_API_KEY;
  const { aiJson, aiJsonWith, AiRateLimitError, parseJsonObject } = await import("../src/lib/ai/client.ts");
  const { withAiKey } = await import("../src/lib/ai/ai-context.ts");
  const { guessProvider, cleanModel, PROVIDERS } = await import("../src/lib/ai/providers.ts");

  type Call = { url: string; headers: Record<string, string>; body: any };
  let calls: Call[] = [];
  let reply: (c: Call, n: number) => Response = () => new Response("{}");
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const c = { url: String(url), headers: (init.headers ?? {}) as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : null };
    calls.push(c);
    return reply(c, calls.length);
  }) as typeof fetch;
  const json = (o: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(o), { status, headers });
  const openaiOk = (content: string) => json({ choices: [{ message: { content } }] });
  const claudeOk = (text: string, stop = "end_turn") => json({ content: [{ type: "text", text }], stop_reason: stop });
  const geminiOk = (text: string) => json({ candidates: [{ content: { parts: [{ text }] } }] });
  const run = (provider: "gemini" | "openai" | "anthropic", model: string, prompt = "Classify this. Return JSON.") =>
    withAiKey({ key: `KEY-${provider}-1234567890`, source: "workspace", provider, model }, () => aiJson(prompt));

  console.log("OpenAI:");
  calls = []; reply = () => openaiOk('{"type":"Bug"}');
  let r = await run("openai", "gpt-5-mini");
  let c = calls[0];
  check("goes to OpenAI's chat endpoint", c.url === "https://api.openai.com/v1/chat/completions");
  check("key sent as a Bearer header, never in the URL", c.headers.Authorization === "Bearer KEY-openai-1234567890" && !c.url.includes("KEY"));
  check("asks for strict JSON", c.body.response_format?.type === "json_object" && c.body.messages[0].role === "system" && /JSON/.test(c.body.messages[0].content));
  check("uses the chosen model, with the prompt", c.body.model === "gpt-5-mini" && c.body.messages[1].content.includes("Classify this"));
  check("reasoning models: no temperature (they reject it), low reasoning effort", c.body.temperature === undefined && c.body.reasoning_effort === "low");
  check("the answer comes back as an object", r.type === "Bug");
  calls = []; await run("openai", "gpt-4.1-mini");
  check("older models get a temperature and no reasoning setting", calls[0].body.temperature === 0.2 && calls[0].body.reasoning_effort === undefined);
  calls = []; reply = () => json({ error: { code: "insufficient_quota", message: "You exceeded your current quota, please check your plan and billing details." } }, 429);
  let err: any = await run("openai", "gpt-5-mini").catch((e) => e);
  check("no API credit is reported at once, not retried", err instanceof AiRateLimitError && err.scope === "credit" && calls.length === 1, `${calls.length} call(s)`);
  check("…with advice saying where to add credit", /no API credit left/.test(err.advice) && /platform\.openai\.com → Billing/.test(err.advice));
  calls = []; reply = (_c, n) => (n === 1 ? json({ error: { code: "rate_limit_exceeded" } }, 429, { "retry-after": "0" }) : openaiOk('{"ok":1}'));
  r = await run("openai", "gpt-5-mini");
  check("a per-minute limit is retried and then succeeds", r.ok === 1 && calls.length === 2);
  calls = []; reply = () => json({ choices: [{ message: { content: null, refusal: "I can't help with that." } }] });
  err = await run("openai", "gpt-5-mini").catch((e) => e);
  check("a refusal is a clear error", /OpenAI declined/.test(err.message));
  calls = []; reply = () => json({ error: { message: "Incorrect API key provided: KEY-openai-1234567890" } }, 401);
  err = await run("openai", "gpt-5-mini").catch((e) => e);
  check("other errors are plain errors (not retried)", !(err instanceof AiRateLimitError) && /OpenAI API 401/.test(err.message) && calls.length === 1);

  console.log("\nAnthropic (Claude):");
  calls = []; reply = () => claudeOk('{"summary":"ok"}');
  r = await run("anthropic", "claude-haiku-4-5");
  c = calls[0];
  check("goes to Anthropic's messages endpoint", c.url === "https://api.anthropic.com/v1/messages");
  check("key in x-api-key with the API version header, never in the URL", c.headers["x-api-key"] === "KEY-anthropic-1234567890" && c.headers["anthropic-version"] === "2023-06-01" && !c.url.includes("KEY"));
  check("JSON-only instruction, model, room for long answers", /JSON/.test(c.body.system) && c.body.model === "claude-haiku-4-5" && c.body.max_tokens >= 4096 && c.body.messages[0].role === "user");
  check("the answer comes back as an object", r.summary === "ok");
  calls = []; reply = () => claudeOk('Here you go:\n```json\n{"theme":"Slow Board Loading"}\n```');
  r = await run("anthropic", "claude-haiku-4-5");
  check("JSON wrapped in ``` fences or with a sentence around it still works", r.theme === "Slow Board Loading");
  calls = []; reply = () => claudeOk('{"items":[{"quote":"cut', "max_tokens");
  err = await run("anthropic", "claude-haiku-4-5").catch((e) => e);
  check("an answer cut off for length says so", /cut off/.test(err.message));
  calls = []; reply = (_c, n) => (n === 1 ? json({ type: "error", error: { type: "overloaded_error" } }, 529, { "retry-after": "0" }) : claudeOk('{"ok":2}'));
  r = await run("anthropic", "claude-haiku-4-5");
  check("“overloaded” is retried and then succeeds", r.ok === 2 && calls.length === 2);
  calls = []; reply = () => json({ type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." } }, 400);
  err = await run("anthropic", "claude-haiku-4-5").catch((e) => e);
  check("no credit is reported at once, with where to add it", err instanceof AiRateLimitError && err.scope === "credit" && calls.length === 1 && /console\.anthropic\.com → Billing/.test(err.advice));

  console.log("\nGemini (unchanged):");
  calls = []; reply = () => geminiOk('{"type":"UX"}');
  r = await run("gemini", "gemini-3.1-flash-lite");
  c = calls[0];
  check("same request as before: model in the path, key in a header, JSON mode", c.url.endsWith("/models/gemini-3.1-flash-lite:generateContent") && c.headers["x-goog-api-key"] === "KEY-gemini-1234567890" && c.body.generationConfig.responseMimeType === "application/json" && r.type === "UX");
  calls = []; reply = () => json({ error: { message: "Quota exceeded for metric: generate_content_free_tier_requests, limit: GenerateRequestsPerDayPerProjectPerModel" } }, 429);
  err = await run("gemini", "gemini-3.1-flash-lite").catch((e) => e);
  check("a spent daily quota is still reported at once", err instanceof AiRateLimitError && err.scope === "day" && calls.length === 1 && /midnight Pacific/.test(err.advice));

  console.log("\nWhich AI each call uses:");
  process.env.GEMINI_API_KEY = "PLATFORM-GEMINI-KEY";
  calls = []; reply = (cc) => (cc.url.includes("openai") ? openaiOk('{"via":"openai"}') : geminiOk('{"via":"gemini"}'));
  const [a, b2, plat] = await Promise.all([run("openai", "gpt-5-mini"), run("gemini", "gemini-3.1-flash-lite"), aiJson("platform call")]);
  check("two workspaces at once each reach their own provider", a.via === "openai" && b2.via === "gemini");
  check("with no workspace context, the platform Gemini key is used", plat.via === "gemini" && calls.some((x) => x.headers["x-goog-api-key"] === "PLATFORM-GEMINI-KEY"));
  calls = []; reply = () => openaiOk('{"ok":true}');
  await aiJsonWith({ key: "TEST-KEY-abcdefghijklmnop", source: "workspace", provider: "openai", model: "gpt-5-nano" }, "test");
  check("a key can be tried before saving, with its own model", calls[0].body.model === "gpt-5-nano" && calls[0].headers.Authorization === "Bearer TEST-KEY-abcdefghijklmnop");

  console.log("\nHelpers:");
  check("recognises each provider's keys", guessProvider("AIzaSyA" + "x".repeat(32)) === "gemini" && guessProvider("sk-proj-" + "x".repeat(40)) === "openai" && guessProvider("sk-ant-api03-" + "x".repeat(40)) === "anthropic" && guessProvider("nonsense") === null);
  check("a Claude key isn't mistaken for OpenAI", guessProvider("sk-ant-" + "x".repeat(40)) !== "openai");
  check("model names: plain characters only", cleanModel("gpt-5-mini") === "gpt-5-mini" && cleanModel("claude-haiku-4-5") === "claude-haiku-4-5" && cleanModel("models/../x") === null && cleanModel("a b") === null && cleanModel("") === null);
  check("every provider has a recommended model in its list", Object.values(PROVIDERS).every((p) => p.models[0].id === p.defaultModel));
  check("JSON parsing refuses non-objects", (() => { try { parseJsonObject("[1,2]"); return false; } catch { return true; } })() && (() => { try { parseJsonObject("no json here"); return false; } catch { return true; } })());
  process.exit(fail ? 1 : 0);
}
main();
