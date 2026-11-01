/**
 * The Viewer role: sees everything, changes nothing — on screen AND on the server.
 *   PGLITE_DIR=./.pglite-iso npx tsx scripts/db-setup.ts   (seeds Vera Viewer)
 *   PGLITE_DIR=./.pglite-iso ALLOW_DEV_LOGIN=true npx next start -p 4000 &
 *   node viewer-test.mjs
 */
import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:4000";
let fail = 0;
const check = (ok, n, d = "") => { console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };
const b = await chromium.launch();
const errors = [];
async function session(name) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1200 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.click(`text=${name}`);
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  return { ctx, page, cookie: async () => (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ") };
}
const count = (page, role, name) => page.getByRole(role, { name }).count();
const go = async (page, path) => { await page.goto(base + path, { waitUntil: "networkidle" }); return page.locator("main").innerText(); };

const vera = await session("Vera Viewer");
const v = vera.page;
console.log("Vera (viewer) can see everything:");
for (const p of ["/dashboard", "/themes", "/register", "/register?tab=review", "/roadmap", "/roadmap?view=board", "/trends", "/digest", "/settings"]) {
  const r = await v.goto(base + p, { waitUntil: "networkidle" });
  check(r.status() === 200, `${p} opens`);
}
const themesText = await go(v, "/themes");
check(/Slow dashboard loading/.test(themesText), "…with the real data in it");

console.log("\n…but there's nothing to change:");
await go(v, "/dashboard");
check((await v.locator("text=👁 View only").count()) > 0 && (await count(v, "link", "Ingest Feedback")) === 0, "sidebar says View only, no Ingest button");
check((await count(v, "link", "View digest")) === 1, "dashboard offers 'View digest', not 'Generate'");
const ing = await go(v, "/ingest");
check(/View only/.test(ing) && (await v.locator("input[type=file]").count()) === 0, "the Ingest page explains, with no upload box");
const rev = await go(v, "/register?tab=review");
check(/View only — you can see the queue/.test(rev), "review queue is visible, marked view-only");
check((await v.getByRole("button", { name: /Approve|Discard|Correct|Run AI analysis/ }).count()) === 0 && (await v.locator('input[type="checkbox"]').count()) === 0, "no approve / discard / correct / select / Run AI");
await go(v, "/themes");
check((await v.getByRole("button", { name: /Regenerate summaries|Review & consolidate|Add to roadmap/ }).count()) === 0, "no Regenerate, Consolidate or Add to roadmap");
check((await v.getByRole("link", { name: /On roadmap/ }).count()) > 0, "but 'On roadmap' links still show");
const href = await v.locator("a[href^='/themes/']").evaluateAll((a) => a.map((x) => x.getAttribute("href")).find((h) => /^\/themes\/[0-9a-f-]{36}$/.test(h)));
await go(v, href);
check((await count(v, "button", "Rename theme")) === 0 && (await count(v, "button", /Promote/)) === 0, "theme page: no rename, no promote");
await go(v, "/roadmap");
check((await v.locator('input[aria-label="Benefit"]').count()) === 0 && /Benefit \d+ · Effort \d+/.test(await v.locator("main").innerText()), "roadmap shows scores as text, not edit boxes");
await go(v, "/roadmap?view=board");
check((await v.locator('[draggable="true"]').count()) === 0, "board cards can't be dragged");
await go(v, "/digest");
check((await count(v, "button", /Generate/)) === 0, "no Generate digest button");
const set = await go(v, "/settings");
check(/Your account/.test(set) && (await count(v, "button", "Add person")) === 0 && !/Clear the register|Delete this workspace/.test(set), "Settings: own account only — no adding people, clearing or deleting");
check((await v.getByLabel("Gemini API key").count()) === 0 && (await v.getByLabel("Jira API token").count()) === 0, "no AI key or Jira settings to change");

console.log("\nGoing round the screen doesn't work either:");
const up = await fetch(base + "/api/ingest", { method: "POST", headers: { "Content-Type": "application/json", Cookie: await vera.cookie() }, body: JSON.stringify({ paste: "VERA tried to add this " + Date.now() }) });
check(up.status === 403, "uploading through the API is refused", `HTTP ${up.status}`);
// Capture a real server-action call made by the owner, then replay it as Vera.
const jamie = await session("Jamie Lee");
await jamie.page.goto(base + href, { waitUntil: "networkidle" });
const original = (await jamie.page.locator("h1").innerText()).trim();
let captured = null;
jamie.page.on("request", (r) => { if (r.method() === "POST" && r.headers()["next-action"] && !captured) captured = { url: r.url(), headers: r.headers(), body: r.postData() }; });
await jamie.page.getByRole("button", { name: "Rename theme" }).click();
await jamie.page.getByRole("textbox", { name: "Theme name" }).fill(original + " (owner edit)");
await jamie.page.getByRole("textbox", { name: "Theme name" }).press("Enter");
await jamie.page.waitForTimeout(2000);
check(Boolean(captured), "(captured the owner's real rename request)");
const forged = captured.body.replace(original + " (owner edit)", "VERA WAS HERE");
await fetch(captured.url, { method: "POST", headers: { ...captured.headers, cookie: await vera.cookie() }, body: forged });
await go(v, href);
const nowTitle = (await v.locator("h1").innerText()).trim();
check(nowTitle === original + " (owner edit)" && nowTitle !== "VERA WAS HERE", "replaying the owner's rename as Vera changes nothing", nowTitle);
// Control: the same replay with the OWNER's login does work — so the refusal above is real, not a broken replay.
await fetch(captured.url, { method: "POST", headers: { ...captured.headers, cookie: await jamie.cookie() }, body: captured.body.replace(original + " (owner edit)", original + " (replayed)") });
await go(v, href);
check((await v.locator("h1").innerText()).trim() === original + " (replayed)", "control: the identical replay with the owner's login does go through");
// put it back
await jamie.page.getByRole("button", { name: "Rename theme" }).click();
await jamie.page.getByRole("textbox", { name: "Theme name" }).fill(original);
await jamie.page.getByRole("textbox", { name: "Theme name" }).press("Enter");
await jamie.page.waitForTimeout(1500);

console.log("\nOwners change roles:");
await jamie.page.goto(base + "/settings", { waitUntil: "networkidle" });
check((await jamie.page.getByLabel("Role for Jamie Lee").count()) === 0, "there's no role picker on your own row");
await jamie.page.getByLabel("Role for Tom Becker").selectOption("viewer");
await jamie.page.waitForTimeout(1800);
const tom = await session("Tom Becker");
await tom.page.goto(base + "/register?tab=review", { waitUntil: "networkidle" });
check(/View only/.test(await tom.page.locator("main").innerText()), "making Tom a Viewer takes effect on his next page");
await jamie.page.reload({ waitUntil: "networkidle" });
await jamie.page.getByLabel("Role for Tom Becker").selectOption("contributor");
await jamie.page.waitForTimeout(1800);
await tom.page.reload({ waitUntil: "networkidle" });
check((await tom.page.getByRole("button", { name: /Run AI analysis/ }).count()) > 0, "and back to Contributor gives him the buttons back");
const vRole = await (async () => { await jamie.page.reload({ waitUntil: "networkidle" }); return jamie.page.getByLabel("Role for Vera Viewer").inputValue(); })();
check(vRole === "viewer", "the picker shows Vera as Viewer");

check(errors.length === 0, "no browser errors", errors.slice(0, 2).join(" | "));
await b.close();
console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
