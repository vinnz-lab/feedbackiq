/**
 * A tiny stand-in for Jira Cloud (REST v3), for end-to-end tests only.
 *   node scripts/fake-jira.mjs 54400
 * Accepts the login FAKE_JIRA_LOGIN="email:token" (default jamie@acme.test:good-token-123456).
 * Project FIQ with issue types Story, Bug, Sub-task. Test controls:
 *   GET  /__issues                    everything created (fields as received)
 *   POST /__status {key,name,category,resolution}
 */
import http from "node:http";
const port = Number(process.argv[2] || 54400);
const login = process.env.FAKE_JIRA_LOGIN || "jamie@acme.test:good-token-123456";
const issues = new Map();
let n = 0;
const send = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(body === undefined ? "" : JSON.stringify(body)); };
http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    const p = url.pathname;
    const body = raw ? JSON.parse(raw) : {};
    if (p === "/__issues") return send(res, 200, [...issues.values()]);
    if (p === "/__status") { const i = issues.get(body.key); if (!i) return send(res, 404, {}); i.status = { name: body.name, statusCategory: { key: body.category } }; i.resolution = body.resolution ? { name: body.resolution } : null; return send(res, 200, {}); }
    const auth = Buffer.from((req.headers.authorization || "").replace(/^Basic /, ""), "base64").toString();
    if (auth !== login) return send(res, 401, { errorMessages: ["Unauthorized"] });
    if (p === "/rest/api/3/myself") return send(res, 200, { accountId: "abc", displayName: "Jamie Lee" });
    const proj = p.match(/^\/rest\/api\/3\/project\/([^/]+)$/);
    if (proj) {
      if (proj[1] !== "FIQ") return send(res, 404, { errorMessages: ["No project could be found with key '" + proj[1] + "'."] });
      return send(res, 200, { id: "10000", key: "FIQ", name: "FeedbackIQ Delivery", issueTypes: [{ id: "1", name: "Story" }, { id: "2", name: "Bug" }, { id: "3", name: "Sub-task", subtask: true }] });
    }
    if (p === "/rest/api/3/issue" && req.method === "POST") {
      const f = body.fields || {};
      if (f.project?.key !== "FIQ") return send(res, 400, { errors: { project: "valid project is required" } });
      if (!f.summary) return send(res, 400, { errors: { summary: "You must specify a summary of the issue." } });
      const key = `FIQ-${++n}`;
      issues.set(key, { key, fields: f, status: { name: "To Do", statusCategory: { key: "new" } }, resolution: null });
      return send(res, 201, { id: String(10000 + n), key, self: `x/rest/api/3/issue/${key}` });
    }
    const iss = p.match(/^\/rest\/api\/3\/issue\/([^/]+)$/);
    if (iss && req.method === "GET") {
      const i = issues.get(decodeURIComponent(iss[1]));
      if (!i) return send(res, 404, { errorMessages: ["Issue does not exist or you do not have permission to see it."] });
      return send(res, 200, { key: i.key, fields: { status: i.status, resolution: i.resolution } });
    }
    send(res, 404, { errorMessages: [`fake jira: no route ${req.method} ${p}`] });
  });
}).listen(port, () => console.log(`fake jira on ${port}`));
