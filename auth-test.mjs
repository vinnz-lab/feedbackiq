/**
 * Verifies the sign-in modes against a locally running server.
 *
 * The security property that matters: a deployment with NO auth configuration
 * must fail CLOSED. An earlier design would have fallen back to the
 * passwordless profile picker whenever Supabase settings were absent, which on
 * a public URL is an open door. The dev picker now requires an explicit
 * ALLOW_DEV_LOGIN opt-in.
 *
 * Usage: MODE=dev|unconfigured node auth-test.mjs
 */
const base = process.env.BASE || "http://localhost:4000";
const mode = process.env.MODE || "dev";

const results = [];
const check = (n, ok, d = "") => {
  results.push([ok, n, d]);
  console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`);
};

const loginHtml = await (await fetch(base + "/login")).text();

if (mode === "dev") {
  console.log("\nDev mode (ALLOW_DEV_LOGIN=true):");
  check("login offers the profile picker", /Choose a profile/.test(loginHtml));
  check("does not claim to be unconfigured", !/isn.{0,3}t configured/i.test(loginHtml));
  const ids = loginHtml.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [];
  check("profiles are listed", ids.length > 0, `${ids.length} found`);

  // A picked profile can reach the app.
  const res = await fetch(base + "/dashboard", {
    headers: { Cookie: `fiq_uid=${ids[0]}` },
    redirect: "manual",
  });
  check("a chosen profile reaches the dashboard", res.status === 200, `HTTP ${res.status}`);
} else {
  console.log("\nUnconfigured mode (no Supabase, no ALLOW_DEV_LOGIN):");
  check("login says sign-in is not configured", /isn.{0,3}t configured/i.test(loginHtml));
  check("NO profile picker is offered", !/Choose a profile/.test(loginHtml));
  check("no user ids are leaked to the page", !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(loginHtml));

  // Even a valid-looking session cookie must not work.
  const res = await fetch(base + "/dashboard", {
    headers: { Cookie: "fiq_uid=00000000-0000-4000-8000-000000000000" },
    redirect: "manual",
  });
  check("gated pages redirect to login", res.status === 307 || res.status === 302, `HTTP ${res.status}`);

  const api = await fetch(base + "/api/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paste: "should not land" }),
  });
  check("the ingest API rejects", api.status === 401, `HTTP ${api.status}`);
}

const failed = results.filter(([ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
