/**
 * Phase 2: switching and creating workspaces, as three people.
 *  - Jamie (platform owner): creates "Demo", moves between Demo and Acme, renames Demo.
 *  - Tess (tester, own workspace): never sees Jamie's workspaces, can't create any.
 *  - Tom (contributor in Acme): can't create workspaces or rename Acme.
 *
 *   PGLITE_DIR=./.pglite-iso npx tsx scripts/db-setup.ts
 *   PGLITE_DIR=./.pglite-iso npx tsx scripts/seed-second-workspace.ts
 *   PGLITE_DIR=./.pglite-iso ALLOW_DEV_LOGIN=true PLATFORM_ADMIN_EMAILS=jamie@acme.test npx next start -p 4000 &
 *   node workspace-switch-test.mjs
 */
import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:4000";
let fail = 0;
const check = (ok, n, d = "") => { console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };
const b = await chromium.launch();
const errors = [];

async function session(name) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.click(`text=${name}`);
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  return { ctx, page, cookie: async () => (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ") };
}
const openMenu = async (page) => {
  await page.getByRole("button", { name: "Switch workspace" }).click();
  await page.getByRole("menu").waitFor();
};
const menuNames = async (page) => {
  await openMenu(page);
  const names = (await page.getByRole("menuitem").allInnerTexts()).map((s) => s.trim());
  const canCreate = (await page.getByRole("button", { name: "New workspace" }).count()) > 0;
  await page.keyboard.press("Escape");
  return { names, canCreate };
};
const current = async (page) => (await page.getByRole("button", { name: "Switch workspace" }).innerText()).split("\n")[0].trim();
const exportCounts = async (s) => JSON.parse(await (await fetch(base + "/api/export", { headers: { Cookie: await s.cookie() } })).text());

console.log("Jamie, the platform owner:");
const jamie = await session("Jamie Lee");
let m = await menuNames(jamie.page);
check(m.names.length === 1 && m.names[0] === "Acme App", "his list shows only his own workspace (no tester workspaces)", m.names.join(", "));
check(m.canCreate, "he can create workspaces");
const acmeBefore = (await exportCounts(jamie)).counts;

// Duplicate name refused
await openMenu(jamie.page);
await jamie.page.getByRole("button", { name: "New workspace" }).click();
await jamie.page.getByLabel("New workspace name").fill("acme app");
await jamie.page.getByRole("button", { name: "Create" }).click();
await jamie.page.waitForTimeout(1500);
check((await jamie.page.locator("text=/already have a workspace called/").count()) > 0, "a name he already uses is refused");

// Create Demo
await jamie.page.getByLabel("New workspace name").fill("Demo");
await jamie.page.getByLabel("New workspace description").fill("Clean space for demos");
await jamie.page.getByRole("button", { name: "Create" }).click();
// Already on /dashboard, so waiting for the URL proves nothing; wait for the sidebar.
await jamie.page.getByRole("button", { name: "Switch workspace" }).filter({ hasText: "Demo" }).waitFor({ timeout: 15000 }).catch(() => {});
await jamie.page.waitForLoadState("networkidle");
check((await current(jamie.page)) === "Demo", "creating opens the new workspace", await current(jamie.page));
const demoThemes = await jamie.page.goto(base + "/themes", { waitUntil: "networkidle" }).then(() => jamie.page.locator("main").innerText());
check(/0 themes/.test(demoThemes) && !demoThemes.includes("Slow dashboard loading"), "Demo starts empty — none of Acme's themes");
const demoSettings = await jamie.page.goto(base + "/settings", { waitUntil: "networkidle" }).then(() => jamie.page.locator("main").innerText());
check(demoSettings.includes("Jamie Lee") && !/Tom Becker|Riya Shah|Ana Costa/.test(demoSettings), "Demo's team is just Jamie — Acme's team wasn't copied in");

// Upload into Demo only
const up = await fetch(base + "/api/ingest", { method: "POST", headers: { "Content-Type": "application/json", Cookie: await jamie.cookie() }, body: JSON.stringify({ paste: "DEMO-ONLY feedback about the demo " + Date.now() }) });
check(up.status === 200, "he can upload into Demo");
const demoData = await exportCounts(jamie);
check(demoData.data.workspaces[0].name === "Demo" && demoData.counts.feedbackItems === 1, "the upload is in Demo", JSON.stringify(demoData.counts.feedbackItems));

// Switch back to Acme
await openMenu(jamie.page);
await jamie.page.getByRole("menuitem", { name: "Acme App" }).click();
await jamie.page.getByRole("button", { name: "Switch workspace" }).filter({ hasText: "Acme App" }).waitFor({ timeout: 15000 });
await jamie.page.waitForLoadState("networkidle");
check((await current(jamie.page)) === "Acme App", "switching back opens Acme App");
const acmeAfter = (await exportCounts(jamie)).counts;
check(acmeAfter.feedbackItems === acmeBefore.feedbackItems && acmeAfter.themes === acmeBefore.themes, "Acme unchanged by anything done in Demo", `${acmeBefore.feedbackItems} → ${acmeAfter.feedbackItems}`);
const acmeThemes = await jamie.page.goto(base + "/themes", { waitUntil: "networkidle" }).then(() => jamie.page.locator("main").innerText());
check(acmeThemes.includes("Slow dashboard loading") && !acmeThemes.includes("DEMO-ONLY"), "Acme shows its own data again, nothing from Demo");
m = await menuNames(jamie.page);
check(m.names.includes("Demo") && m.names.includes("Acme App"), "his list now has both", m.names.join(", "));

// Rename Demo from Settings
await openMenu(jamie.page);
await jamie.page.getByRole("menuitem", { name: "Demo" }).click();
await jamie.page.getByRole("button", { name: "Switch workspace" }).filter({ hasText: "Demo" }).waitFor({ timeout: 15000 });
await jamie.page.goto(base + "/settings", { waitUntil: "networkidle" });
await jamie.page.getByLabel("Workspace name").fill("Demo Space");
await jamie.page.getByRole("button", { name: "Save", exact: true }).click();
await jamie.page.waitForTimeout(1500);
await jamie.page.reload({ waitUntil: "networkidle" });
check((await current(jamie.page)) === "Demo Space", "renaming in Settings updates the sidebar", await current(jamie.page));
await jamie.page.getByLabel("Workspace name").fill("Acme App");
await jamie.page.getByRole("button", { name: "Save", exact: true }).click();
await jamie.page.waitForTimeout(1500);
check((await jamie.page.locator("text=/already have another workspace called/").count()) > 0, "renaming to the name of his other workspace is refused");

console.log("\nTess, a tester with her own workspace:");
const tess = await session("Tess Tester");
m = await menuNames(tess.page);
check(m.names.length === 1 && m.names[0] === "ZEBRA Space", "she sees only her own workspace", m.names.join(", "));
check(!m.canCreate, "she can't create workspaces");
const tessThemes = await tess.page.goto(base + "/themes", { waitUntil: "networkidle" }).then(() => tess.page.locator("body").innerText());
check(!/Demo Space|DEMO-ONLY|Acme App/.test(tessThemes), "nothing of Jamie's appears anywhere for her");

console.log("\nTom, a contributor in Acme:");
const tom = await session("Tom Becker");
m = await menuNames(tom.page);
check(m.names.length === 1 && m.names[0] === "Acme App" && !m.canCreate, "he sees Acme only, and can't create workspaces", m.names.join(", "));
const tomSettings = await tom.page.goto(base + "/settings", { waitUntil: "networkidle" }).then(() => tom.page.locator("main").innerText());
check(!tomSettings.includes("Workspace name") && (await tom.page.getByLabel("Workspace name").count()) === 0, "he can't rename the workspace (not an owner)");

console.log("\nSigning out:");
await jamie.page.goto(base + "/dashboard", { waitUntil: "networkidle" });
const before = (await jamie.ctx.cookies()).some((c) => c.name === "fiq_ws");
await jamie.page.locator("header").getByRole("button").last().click();
const signOut = jamie.page.getByRole("button", { name: /sign out/i });
if (await signOut.count()) { await signOut.first().click(); await jamie.page.waitForURL("**/login"); }
const after = (await jamie.ctx.cookies()).some((c) => c.name === "fiq_ws");
check(before && !after, "signing out forgets the chosen workspace");

check(errors.length === 0, "no browser errors", errors.slice(0, 2).join(" | "));
await b.close();
console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
