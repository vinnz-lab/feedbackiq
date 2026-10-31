/**
 * End-to-end regression check against a locally running app.
 *
 * Covers: the auth guards actually protect the endpoints; the real signed-in
 * flow still works; AI runs are rate-limited; and AI failures are reported
 * honestly rather than hidden behind a success count.
 *
 * Run after any change to auth, guards, server actions, or the AI pipeline:
 *
 *   PGLITE_DIR=./.pglite-test npx tsx scripts/db-setup.ts
 *   PGLITE_DIR=./.pglite-test npx tsx scripts/seed-unclassified.ts 8
 *   PGLITE_DIR=./.pglite-test npx next start -p 4000 &
 *   node regress.mjs
 *
 * No GEMINI_API_KEY is needed: the guards and the failure-reporting paths all
 * run before any Gemini call.
 */
import { chromium } from "playwright";

const base = process.env.BASE || "http://localhost:4000";
const results = [];
const check = (n, ok, d = "") => {
  results.push([ok, n, d]);
  console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`);
};

// ---------- API-level guards (no browser needed) ----------
async function post(cookie, body = { paste: "guard probe" }) {
  const res = await fetch(base + "/api/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  return res.status;
}

console.log("\nAPI guards:");
check("anonymous ingest rejected", (await post(null)) === 401);
check("malformed cookie rejected", (await post("fiq_uid=not-a-uuid")) === 401);
check(
  "unknown uuid rejected",
  (await post("fiq_uid=00000000-0000-4000-8000-000000000000")) === 401,
);
check("diagnostic endpoint gone", (await fetch(base + "/api/ai-models")).status === 404);

// ---------- Signed-in flow must still work ----------
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

console.log("\nSigned-in flow:");
await page.goto(base + "/login", { waitUntil: "networkidle" });
await page.click("text=Jamie Lee");
await page.waitForURL("**/dashboard", { timeout: 15000 });
check("login → dashboard", true);

const APPROVE = { hasText: /✓ Approve$/ };
async function reviewCount() {
  await page.goto(base + "/register?tab=review", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  return page.locator("button", APPROVE).count();
}

const before = await reviewCount();
if (before > 0) {
  // Approve an item the AI has already analysed. Un-analysed items are refused
  // on purpose (they would have no theme), which is checked separately below.
  const analysed = page.locator("div.rounded-\\[var\\(--radius-card\\)\\]", { hasText: "AI suggests" });
  await analysed.first().locator("button", APPROVE).click();
  await page.waitForTimeout(3000);
  const after = await reviewCount();
  check("approve mutates data", after === before - 1, `${before} → ${after}`);

  const pending = page.locator("div.rounded-\\[var\\(--radius-card\\)\\]", { hasText: "Not yet analysed by AI" });
  if (await pending.count()) {
    await pending.first().locator("button", APPROVE).click();
    await page.waitForTimeout(2500);
    // Read the on-card message BEFORE reviewCount(), which reloads the page.
    const told = (await page.locator("text=Run AI analysis on this first").count()) > 0;
    check("approving an un-analysed item is refused, with a reason", told && (await reviewCount()) === after);
  }
} else {
  check("approve mutates data", false, "no needs-review items — inconclusive");
}

for (const [name, path, marker] of [
  ["ingest", "/ingest", /Drop|drop/],
  ["trends", "/trends", /Sentiment distribution/],
  ["digest", "/digest", /Weekly digest/],
  ["roadmap", "/roadmap", /Backlog|backlog/],
]) {
  await page.goto(base + path, { waitUntil: "networkidle" });
  check(`${name} renders`, await page.locator(`text=${marker}`).first().isVisible());
}

// ---------- AI failures must be reported, not hidden ----------
// Regression guard for the "everything stuck on Awaiting AI" bug: the run used
// to surface an error only when NOTHING succeeded, so a 5-of-40 run looked
// clean and left 35 items silently unclassified.
console.log("\nAI failure honesty:");
await page.goto(base + "/register?tab=review", { waitUntil: "networkidle" });
const runAi = page.locator("button", { hasText: /Run AI analysis/ });
if (await runAi.isEnabled()) {
  await runAi.click();
  await page
    .waitForFunction(() => !document.body.textContent?.includes("Analysing…"), { timeout: 120000 })
    .catch(() => {});
  await page.waitForTimeout(1500);
  const line =
    (await page.locator("main").innerText()).match(
      /[^\n]*(failed|Analysed|still waiting|Nothing to analyse|No AI key)[^\n]*/,
    )?.[0] ?? "";
  // With no key at all the run now stops up front and says why, instead of
  // failing item by item; either way the user must be told.
  check("AI failures are reported", /failed|No AI key/.test(line), line.trim());
  check("failure names a cause", /GEMINI|rate limit|Gemini|AI key/i.test(line));
} else {
  check("AI failures are reported", false, "no unclassified items — run seed-unclassified.ts");
}

// ---------- AI rate limiting ----------
// guardAiRun runs BEFORE any Gemini call, so this works without an API key:
// click 1 records an attempt, click 2 must be refused by the cooldown.
console.log("\nAI rate limiting:");
await page.goto(base + "/digest", { waitUntil: "networkidle" });
const digestBtn = page.locator("button", { hasText: /Generate weekly digest/ });
await digestBtn.click();
await page
  .waitForFunction(() => !document.body.textContent?.includes("Writing digest"), { timeout: 30000 })
  .catch(() => {});
await page.waitForTimeout(1200);
const warn1 = (await page.locator("main").innerText()).match(/⚠[^\n]*/)?.[0] ?? "";
check("1st AI run not rate-limited", !/please wait/.test(warn1), warn1 || "no warning");

await digestBtn.click();
await page.waitForTimeout(1500);
const warn2 = (await page.locator("main").innerText()).match(/⚠[^\n]*/)?.[0] ?? "";
if (/No AI key/.test(warn1)) {
  // No key at all: the run stops before it starts, so it isn't counted and
  // there's no cooldown to hit. The cooldown itself is covered by guard-test.
  check("with no AI key, the run stops up front and says why", /No AI key/.test(warn2), warn2);
} else {
  check("2nd AI run blocked by cooldown", /please wait \d+s/.test(warn2), warn2 || "no warning");
}

// ---------- Sign-out ----------
console.log("\nSession:");
await ctx.clearCookies();
await page.goto(base + "/dashboard", { waitUntil: "networkidle" });
check("signed-out → /login", page.url().includes("/login"));

await browser.close();
const failed = results.filter(([ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
