/** TEST ONLY: stands in for Slack and Teams incoming webhooks. GET /__posts lists what arrived. */
import { createServer } from "node:http";
const port = Number(process.argv[2] || 54600);
const posts = [];
createServer(async (req, res) => {
  let raw = ""; for await (const c of req) raw += c;
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/__posts") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(posts)); }
  const kind = url.pathname.startsWith("/slack/") ? "slack" : "teams";
  if (/gone/.test(url.pathname)) { res.writeHead(404); return res.end(kind === "slack" ? "no_service" : ""); }
  posts.push({ kind, path: url.pathname, body: JSON.parse(raw || "{}") });
  if (kind === "slack") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("ok"); }
  res.writeHead(202); res.end();
}).listen(port, "127.0.0.1", () => console.log(`fake chat on ${port}`));
