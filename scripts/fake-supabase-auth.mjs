/**
 * A tiny stand-in for Supabase Auth, for testing sign-in, password change and
 * password reset end to end without a real project. Implements only the
 * endpoints the app calls. NOT secure — test use only.
 *
 *   node scripts/fake-supabase-auth.mjs 54321
 *   GET /__last_link → the reset link that would have been emailed
 */
import http from "node:http";
import { randomUUID } from "node:crypto";

const port = Number(process.argv[2] || 54321);
// Pre-seeded sign-ins. Extra ones via FAKE_USERS="a@b.c:pass,d@e.f:pass".
const users = new Map([["jamie@acme.test", { id: "6f9619ff-8b86-4d11-b42d-00c04fc964ff", password: "old-password-1", app_metadata: {} }]]);
for (const pair of (process.env.FAKE_USERS || "").split(",").filter(Boolean)) {
  const [email, password] = pair.split(":");
  users.set(email, { id: randomUUID(), password, app_metadata: {} });
}
const refreshTokens = new Map(); // refresh_token -> email
const tokens = new Map(); // token_hash -> { email, used }
const sessions = new Map(); // access_token -> email
let lastLink = null;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function session(email) {
  const u = users.get(email);
  const now = Math.floor(Date.now() / 1000);
  const access = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: u.id, email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600, session_id: randomUUID(), app_metadata: u.app_metadata, user_metadata: {} })}.sig`;
  sessions.set(access, email);
  const refresh = randomUUID();
  refreshTokens.set(refresh, email);
  return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: refresh, user: userObj(email) };
}
const userObj = (email) => ({ id: users.get(email).id, aud: "authenticated", role: "authenticated", email, email_confirmed_at: new Date().toISOString(), app_metadata: users.get(email).app_metadata ?? {}, user_metadata: {}, created_at: new Date().toISOString() });
const byId = (id) => [...users.entries()].find(([, u]) => u.id === id)?.[0];
const send = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(body === undefined ? "" : JSON.stringify(body)); };
const who = (req) => sessions.get((req.headers.authorization || "").replace(/^Bearer /, ""));

http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    const body = raw ? JSON.parse(raw) : {};
    const p = url.pathname;
    if (p === "/__last_link") return send(res, 200, { link: lastLink });
    if (p === "/__password") return send(res, 200, { password: users.get(url.searchParams.get("email"))?.password ?? null });
    if (p.endsWith("/.well-known/jwks.json")) return send(res, 200, { keys: [] });
    if (p === "/auth/v1/recover" && req.method === "POST") {
      if (users.has(body.email)) {
        const th = "th_" + randomUUID().replace(/-/g, "");
        tokens.set(th, { email: body.email, used: false });
        const site = new URL(url.searchParams.get("redirect_to") || body.redirect_to || "http://localhost:4000/auth/confirm");
        lastLink = `${site.origin}/auth/confirm?token_hash=${th}&type=recovery&next=/reset-password`;
      }
      return send(res, 200, {}); // same answer either way, like the real one
    }
    if (p === "/auth/v1/verify" && req.method === "POST") {
      const t = tokens.get(body.token_hash);
      if (!t || t.used || body.type !== "recovery") return send(res, 403, { code: 403, error_code: "otp_expired", msg: "Email link is invalid or has expired" });
      t.used = true;
      return send(res, 200, session(t.email));
    }
    if (p === "/auth/v1/token") {
      const g = url.searchParams.get("grant_type");
      if (g === "password") {
        const u = users.get(body.email);
        if (!u || u.password !== body.password) return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
        return send(res, 200, session(body.email));
      }
      if (g === "refresh_token") {
        const e = refreshTokens.get(body.refresh_token);
        if (!e) return send(res, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
        refreshTokens.delete(body.refresh_token);
        return send(res, 200, session(e));
      }
      if (g === "pkce") return send(res, 400, { code: 400, error_code: "flow_state_not_found", msg: "invalid flow state" });
    }
    if (p === "/auth/v1/user" && req.method === "GET") {
      const e = who(req); return e ? send(res, 200, userObj(e)) : send(res, 401, { code: 401, msg: "invalid JWT" });
    }
    if (p === "/auth/v1/user" && req.method === "PUT") {
      const e = who(req); if (!e) return send(res, 401, { code: 401, msg: "invalid JWT" });
      if (body.password) users.get(e).password = body.password;
      return send(res, 200, userObj(e));
    }
    if (p === "/auth/v1/logout") return send(res, 204);
    // --- admin API (service role) ---
    if (p === "/auth/v1/admin/users" && req.method === "GET") {
      return send(res, 200, { users: [...users.keys()].map(userObj), aud: "authenticated" });
    }
    if (p === "/auth/v1/admin/users" && req.method === "POST") {
      if (users.has(body.email)) return send(res, 422, { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" });
      users.set(body.email, { id: randomUUID(), password: body.password, app_metadata: body.app_metadata ?? {} });
      return send(res, 200, userObj(body.email));
    }
    const m = p.match(/^\/auth\/v1\/admin\/users\/([0-9a-f-]+)$/);
    if (m) {
      const e = byId(m[1]);
      if (!e) return send(res, 404, { code: 404, msg: "User not found" });
      if (req.method === "GET") return send(res, 200, userObj(e));
      if (req.method === "PUT") {
        if (body.password) users.get(e).password = body.password;
        if (body.app_metadata) users.get(e).app_metadata = body.app_metadata;
        return send(res, 200, userObj(e));
      }
      if (req.method === "DELETE") { users.delete(e); return send(res, 200, {}); }
    }
    if (p === "/__meta") return send(res, 200, { app_metadata: users.get(url.searchParams.get("email"))?.app_metadata ?? null });
    send(res, 404, { msg: `fake auth: no route ${req.method} ${p}` });
  });
}).listen(port, () => console.log(`fake supabase auth on ${port}`));
