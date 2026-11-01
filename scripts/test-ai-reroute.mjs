/**
 * TEST ONLY — loaded with NODE_OPTIONS="--import ./scripts/test-ai-reroute.mjs".
 * Sends the server's requests to the Gemini, OpenAI and Anthropic APIs to the
 * fake on FAKE_AI_PORT. Does nothing unless FAKE_AI_PORT is set; not part of the app.
 */
const port = process.env.FAKE_AI_PORT;
if (port) {
  const real = globalThis.fetch;
  const HOSTS = { "api.openai.com": "openai", "api.anthropic.com": "anthropic", "generativelanguage.googleapis.com": "gemini" };
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const m = /^https:\/\/([^/]+)(\/.*)$/.exec(url);
    const p = m && HOSTS[m[1]];
    return p ? real(`http://127.0.0.1:${port}/${p}${m[2]}`, init) : real(input, init);
  };
}
