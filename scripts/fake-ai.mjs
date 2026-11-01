/**
 * TEST ONLY: a stand-in for the Gemini, OpenAI and Anthropic APIs.
 * Paths arrive prefixed /gemini, /openai or /anthropic (see test-ai-reroute.mjs).
 * Keys containing "good" work; "nocredit" has no credit; anything else is refused.
 *   GET /__calls   every model request received (provider, model, key's last 4)
 */
import { createServer } from "node:http";
const port = Number(process.argv[2] || 54500);
const calls = [];
const MODELS = {
  gemini: ["gemini-3.1-flash-lite"],
  openai: ["gpt-5-mini", "gpt-5-nano", "gpt-4.1-mini"],
  anthropic: ["claude-haiku-4-5", "claude-sonnet-4-5"],
};
const send = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
function answer(prompt, provider) {
  if (/Reply with this JSON object exactly/.test(prompt)) return { ok: true };
  if (/Classify the single piece/.test(prompt)) return { type: "Bug", sentiment: "Negative", severity: "High", confidence: "High", theme: `${provider} Provider Theme` };
  if (/concise 1–2 sentence summary/.test(prompt)) return { summary: `Summary written by ${provider}.` };
  if (/Extract every DISTINCT/.test(prompt)) return { items: [] };
  if (/weekly feedback digest/.test(prompt)) return { headline: `Digest by ${provider}`, summary: "s", sections: [] };
  return { groups: [] };
}
createServer(async (req, res) => {
  let raw = ""; for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : {};
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/__calls") return send(res, 200, calls);
  const [, provider, ...rest] = url.pathname.split("/");
  const path = "/" + rest.join("/");
  const key = provider === "openai" ? (req.headers.authorization || "").replace(/^Bearer /, "") : provider === "anthropic" ? req.headers["x-api-key"] : req.headers["x-goog-api-key"];
  const bad = !key || !/good|nocredit/.test(String(key));
  if (bad) return send(res, 401, { error: { message: "invalid api key" } });

  if (req.method === "GET") {
    const m = decodeURIComponent(path.split("/").pop());
    return MODELS[provider]?.includes(m) ? send(res, 200, { id: m }) : send(res, 404, { error: { message: "model not found" } });
  }
  const model = provider === "gemini" ? decodeURIComponent(path.split("/models/")[1].split(":")[0]) : body.model;
  if (!MODELS[provider]?.includes(model)) return send(res, 404, { error: { message: "model not found" } });
  const prompt = provider === "gemini" ? body.contents[0].parts[0].text : provider === "openai" ? body.messages.map((m) => m.content).join("\n") : body.messages[0].content;
  calls.push({ provider, model, last4: String(key).slice(-4), prompt: prompt.slice(0, 60) });
  if (/nocredit/.test(String(key))) {
    if (provider === "openai") return send(res, 429, { error: { code: "insufficient_quota", message: "You exceeded your current quota, please check your plan and billing details." } });
    if (provider === "anthropic") return send(res, 400, { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } });
  }
  const out = JSON.stringify(answer(prompt, provider));
  if (provider === "openai") return send(res, 200, { choices: [{ message: { content: out } }] });
  if (provider === "anthropic") return send(res, 200, { content: [{ type: "text", text: "```json\n" + out + "\n```" }], stop_reason: "end_turn" });
  return send(res, 200, { candidates: [{ content: { parts: [{ text: out }] } }] });
}).listen(port, "127.0.0.1", () => console.log(`fake ai on ${port}`));
