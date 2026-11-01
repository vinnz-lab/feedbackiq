/**
 * TEST ONLY — loaded with NODE_OPTIONS="--import ./scripts/test-jira-reroute.mjs".
 * Sends the server's requests for https://*.atlassian.net to the fake Jira on
 * FAKE_JIRA_PORT. Lives outside the app, so production has no such switch.
 */
const port = process.env.FAKE_JIRA_PORT;
if (port) {
  const real = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const m = /^https:\/\/[a-z0-9-]+\.atlassian\.net(\/.*)$/.exec(url);
    return m ? real(`http://127.0.0.1:${port}${m[1]}`, init) : real(input, init);
  };
}
