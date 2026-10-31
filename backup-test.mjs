/**
 * Tests the keep-alive endpoint and the owner-only data export.
 *
 * Usage: node backup-test.mjs
 */
const base = process.env.BASE || "http://localhost:4000";
const results = [];
const check = (n, ok, d = "") => {
  results.push([ok, n, d]);
  console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`);
};

const html = await (await fetch(base + "/login")).text();
const ids = [...html.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)].map(
  (m) => m[0],
);

// --- keep-alive ----------------------------------------------------------
console.log("\nKeep-alive:");
const ka = await fetch(base + "/api/cron/keepalive");
const kaBody = await ka.json();
check("responds without a session (cron has no cookies)", ka.status === 200, `HTTP ${ka.status}`);
check("reports success", kaBody.ok === true);
check(
  "actually queried the database",
  typeof kaBody.counts?.feedbackItems === "number",
  `items=${kaBody.counts?.feedbackItems}`,
);
check("runs several queries, not one", Object.keys(kaBody.counts ?? {}).length >= 3);
check("reports whether the scheduler fired it", typeof kaBody.viaCron === "boolean");
check("exposes how many scheduled runs it has seen", typeof kaBody.cronRunsLogged === "number", `logged=${kaBody.cronRunsLogged}`);

// A manual call must not be mistaken for a scheduled one, otherwise the
// diagnostic is worthless.
check("a hand-made call is NOT counted as scheduled", kaBody.viaCron === false);
const asCron = await (
  await fetch(base + "/api/cron/keepalive", { headers: { "User-Agent": "vercel-cron/1.0" } })
).json();
check("a scheduler-stamped call IS recognised", asCron.viaCron === true);
check("returns a timestamp", typeof kaBody.at === "string");
check("leaks no feedback content", !JSON.stringify(kaBody).match(/quote|customer|email/i));

// --- export: access control ---------------------------------------------
console.log("\nExport access control:");
const anon = await fetch(base + "/api/export");
check("anonymous is refused", anon.status === 401, `HTTP ${anon.status}`);

// Find a non-owner to prove role enforcement. The seed has contributor,
// executive and engineer alongside the owner.
let nonOwnerRefused = null;
let ownerOk = null;
for (const id of ids) {
  const res = await fetch(base + "/api/export", { headers: { Cookie: `fiq_uid=${id}` } });
  if (res.status === 403) nonOwnerRefused = true;
  if (res.status === 200) ownerOk = res;
  if (nonOwnerRefused && ownerOk) break;
}
check("a non-owner is refused (403)", nonOwnerRefused === true);
check("the owner is allowed (200)", Boolean(ownerOk));

// --- export: contents ----------------------------------------------------
console.log("\nExport contents:");
if (ownerOk) {
  const disp = ownerOk.headers.get("content-disposition") ?? "";
  check("downloads as a file", /attachment/.test(disp), disp);
  check("filename names the workspace and the date", /feedbackiq-[a-z0-9-]+-backup-\d{4}-\d{2}-\d{2}\.json/.test(disp), disp);

  const dump = await ownerOk.json();
  const tables = Object.keys(dump.data ?? {});
  check("every table is present", tables.length >= 13, `${tables.length} tables`);
  check("feedback is included", (dump.counts?.feedbackItems ?? 0) > 0, `${dump.counts?.feedbackItems} items`);
  check("themes are included", (dump.counts?.themes ?? 0) > 0, `${dump.counts?.themes} themes`);
  check("records who exported and when", Boolean(dump.exportedBy && dump.exportedAt));
  // A backup is only useful if the quotes survive it.
  const firstQuote = dump.data?.feedbackItems?.[0]?.quote;
  check("quotes are intact", typeof firstQuote === "string" && firstQuote.length > 0);
} else {
  check("export contents", false, "no owner session available");
}

const failed = results.filter(([ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
