/**
 * TEST ONLY — sends the server's Slack/Teams webhook posts to the fake on
 * FAKE_CHAT_PORT. Does nothing unless FAKE_CHAT_PORT is set; not part of the app.
 */
const port = process.env.FAKE_CHAT_PORT;
if (port) {
  const real = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const m = /^https:\/\/([^/:]+)(?::\d+)?(\/[^?]*)/.exec(url);
    if (m) {
      const host = m[1];
      if (host === "hooks.slack.com") return real(`http://127.0.0.1:${port}/slack${m[2]}`, init);
      if (/\.(webhook\.office\.com|logic\.azure\.com|api\.powerplatform\.com)$/.test(host)) return real(`http://127.0.0.1:${port}/teams${m[2]}`, init);
    }
    return real(input, init);
  };
}
