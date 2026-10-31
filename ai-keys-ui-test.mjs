/**
 * Per-workspace AI keys in the browser.
 * The server runs WITHOUT GEMINI_API_KEY, so "platform key" runs say so — which
 * proves which key path a workspace took.
 *
 *   PGLITE_DIR=./.pglite-iso npx tsx scripts/db-setup.ts && PGLITE_DIR=./.pglite-iso npx tsx scripts/seed-second-workspace.ts
 *   PGLITE_DIR=./.pglite-iso ALLOW_DEV_LOGIN=true PLATFORM_ADMIN_EMAILS=jamie@acme.test AI_KEYS_SECRET=<32+ chars> npx next start -p 4000 &
 *   node ai-keys-ui-test.mjs
 */
import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:4000";
let fail = 0;
const check = (ok, n, d = "") => { console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };
const b = await chromium.launch();
const errors = [];
async function session(name) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1400 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.click(`text=${name}`);
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  return { ctx, page, cookie: async () => (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ") };
}
const aiSection = (page) => page.locator("section", { hasText: "AI connection" });
async function runAi(s) {
  await s.page.goto(base + "/register?tab=review", { waitUntil: "networkidle" });
  await s.page.getByRole("button", { name: /Run AI analysis/ }).first().click();
  await s.page.waitForTimeout(3500);
  return s.page.locator("main").innerText();
}

console.log("Your own workspace:");
const jamie = await session("Jamie Lee");
await jamie.page.goto(base + "/settings", { waitUntil: "networkidle" });
check(/Using the platform's AI key/.test(await aiSection(jamie.page).innerText()), "starts on the platform key");
await jamie.page.getByLabel("Gemini API key").fill("AIzaSyFAKE-not-a-real-key-000000000000");
await jamie.page.getByRole("button", { name: "Check and save" }).click();
await jamie.page.waitForTimeout(5000);
const after = await aiSection(jamie.page).innerText();
check(/Google didn't accept this key/.test(after), "a made-up key is checked with REAL Google and rejected", after.match(/⚠.*$/m)?.[0]);
await jamie.page.reload({ waitUntil: "networkidle" });
check(/Using the platform's AI key/.test(await aiSection(jamie.page).innerText()), "…and nothing was saved");
check(!/AIzaSyFAKE/.test(await jamie.page.content()), "the pasted key isn't echoed back into the page");

console.log("\nA contributor:");
const tom = await session("Tom Becker");
await tom.page.goto(base + "/settings", { waitUntil: "networkidle" });
const ts = await aiSection(tom.page).innerText();
check(/Using the platform's AI key/.test(ts) && /Only the workspace owner can change/.test(ts) && (await tom.page.getByLabel("Gemini API key").count()) === 0, "sees which key is used, can't change it");

console.log("\nA tester who must bring their own key:");
await jamie.page.goto(base + "/settings", { waitUntil: "networkidle" });
await jamie.page.getByLabel("Their name").fill("Priya Patel");
await jamie.page.getByLabel("Their email").fill("priya@new.test");
await jamie.page.getByLabel("Their workspace name").fill("Priya's testing");
await jamie.page.getByLabel("Their password").fill("test-pass-12345");
await jamie.page.getByText("Let them use your AI key").click(); // untick
await jamie.page.getByRole("button", { name: "Create their workspace" }).click();
await jamie.page.waitForTimeout(2000);
await jamie.page.reload({ waitUntil: "networkidle" });
const toggle = jamie.page.getByLabel("Priya's testing may use your AI key");
check((await toggle.count()) === 1 && !(await toggle.isChecked()), "in your list, her workspace shows 'Uses your AI key' off");

const priya = await session("Priya Patel");
await priya.page.goto(base + "/settings", { waitUntil: "networkidle" });
check(/No AI key — AI features are off/.test(await aiSection(priya.page).innerText()), "she's told AI is off until she adds a key");
check((await priya.page.getByLabel("Gemini API key").count()) === 1, "and, as owner, she can add one");
await fetch(base + "/api/ingest", { method: "POST", headers: { "Content-Type": "application/json", Cookie: await priya.cookie() }, body: JSON.stringify({ paste: "PRIYA feedback about exports being slow " + Date.now() }) });
let t = await runAi(priya);
check(/needs its own AI key/.test(t) && !/Nothing to analyse/.test(t), "running AI analysis tells her to add her own key (your key is NOT used)", t.match(/⚠.*$/m)?.[0]);

console.log("\nYou switch your key on for her:");
await toggle.check();
await jamie.page.waitForTimeout(1500);
await jamie.page.reload({ waitUntil: "networkidle" });
check(await jamie.page.getByLabel("Priya's testing may use your AI key").isChecked(), "the switch stays on");
await priya.page.goto(base + "/settings", { waitUntil: "networkidle" });
check(/Using the platform's AI key/.test(await aiSection(priya.page).innerText()), "her Settings now says she's on the platform key");
t = await runAi(priya);
check(/No AI key is configured for this app yet/.test(t), "and AI now goes down the platform-key path (this test server has no platform key)", t.match(/⚠.*$/m)?.[0]);

console.log("\nPrivacy:");
const jx = await (await fetch(base + "/api/export", { headers: { Cookie: await jamie.cookie() } })).text();
check(!/encrypted_key|encryptedKey|workspaceAiSettings/.test(jx), "backups don't contain AI key data");

check(errors.length === 0, "no browser errors", errors.slice(0, 2).join(" | "));
await b.close();
console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
