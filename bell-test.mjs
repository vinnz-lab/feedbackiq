/** The notification bell, end to end (run via run-ws-suites.sh). */
import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:4000";
let fail = 0;
const check = (ok, n, d = "") => { console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };
const b = await chromium.launch();
const errors = [];
async function session(name) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.click(`text=${name}`);
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  return page;
}
const bell = (p) => p.getByRole("button", { name: /^Notifications/ });
const dot = async (p) => { await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(800); const d = p.getByTestId("bell-dot"); return (await d.count()) ? (await d.innerText()).trim() : null; };
const openBell = async (p) => { await bell(p).click(); await p.getByRole("dialog", { name: "Notifications" }).waitFor(); await p.waitForTimeout(600); return p.getByRole("dialog", { name: "Notifications" }); };
const closeBell = async (p) => { await p.keyboard.press("Escape"); await p.waitForTimeout(300); };
async function post(path, body) { const r = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return r.json(); }

console.log("Access:");
check((await fetch(base + "/api/notifications")).status === 401, "the feed needs a sign-in");

console.log("\nFirst look (Jamie):");
const jamie = await session("Jamie Lee");
const first = await dot(jamie);
let panel = await openBell(jamie);
let txt = await panel.innerText();
check(/Notifications/.test(txt) && /Last 14 days/.test(txt), "clicking the bell opens the panel");
check(/waiting for review/.test(txt), "shows how many items are waiting for review", txt.match(/\d+ items? waiting for review/)?.[0]);
await closeBell(jamie);
check((await jamie.getByRole("dialog", { name: "Notifications" }).count()) === 0, "Escape closes it");
check((await dot(jamie)) === null, "after opening, the dot goes away", `before: ${first}`);

console.log("\nSomething new arrives:");
await jamie.goto(base + "/integrations", { waitUntil: "networkidle" });
await jamie.getByRole("button", { name: "Create webhook address" }).click();
await jamie.getByTestId("webhook-url").waitFor();
const path = new URL((await jamie.getByTestId("webhook-url").innerText()).trim()).pathname;
await post(path, { source: "Typeform", items: [{ feedback: "BELL-1 the calendar view needs a week mode for planning" }, { feedback: "BELL-2 please allow exporting the board as a PDF file" }] });
check((await dot(jamie)) === "1", "the dot comes back, counting 1 new notice");
panel = await openBell(jamie);
const top = panel.getByTestId("notice").first();
check(/2 new items arrived from Typeform \(webhook\)/.test(await top.innerText()) && (await top.getAttribute("data-unread")) === "true", "newest first, highlighted as new", (await top.innerText()).split("\n")[0]);
check(/just now/.test(await top.innerText()), "says when");
await top.click();
await jamie.waitForURL("**/register?tab=review");
check((await jamie.locator("main").innerText()).includes("BELL-1"), "clicking it opens Needs review, where the items are");
check((await dot(jamie)) === null, "read stays read after reload");
panel = await openBell(jamie);
check((await panel.getByTestId("notice").first().getAttribute("data-unread")) === "false", "…and isn't highlighted any more");
await closeBell(jamie);

console.log("\nEach person has their own unread:");
const tom = await session("Tom Becker");
check((await dot(tom)) !== null, "Tom still sees it as new");
panel = await openBell(tom);
check(/2 new items arrived from Typeform/.test(await panel.innerText()), "same notice for Tom");
await closeBell(tom);

console.log("\nYour own actions don't light the dot:");
await jamie.goto(base + "/themes", { waitUntil: "networkidle" });
const href = await jamie.locator("a[href^='/themes/']").first().getAttribute("href");
await jamie.goto(base + href, { waitUntil: "networkidle" });
const oldName = (await jamie.locator("h1").innerText()).trim();
await jamie.getByRole("button", { name: "Rename theme" }).click();
await jamie.getByRole("textbox", { name: "Theme name" }).fill(oldName + " BELLX");
await jamie.getByRole("textbox", { name: "Theme name" }).press("Enter");
await jamie.waitForTimeout(1500);
check((await dot(jamie)) === null, "Jamie's rename doesn't notify Jamie");
panel = await openBell(jamie);
check(/You renamed a theme/.test(await panel.innerText()), "but it's listed as “You renamed a theme”");
await closeBell(jamie);
check((await dot(tom)) === "1", "Tom gets one new notice for it");
panel = await openBell(tom);
const t1 = await panel.getByTestId("notice").first().innerText();
check(/Jamie Lee renamed a theme/.test(t1) && t1.includes("BELLX"), "“Jamie Lee renamed a theme”, with old → new name");
await closeBell(tom);

console.log("\nOther workspaces and roles:");
const tess = await session("Tess Tester");
panel = await openBell(tess);
txt = await panel.innerText();
check(!/Typeform|BELLX|BELL-/.test(txt), "another workspace sees none of it");
await closeBell(tess);
const vera = await session("Vera Viewer");
panel = await openBell(vera);
check(/Typeform/.test(await panel.innerText()), "a viewer can see what's happening too");
await closeBell(vera);

console.log("\nMenu:");
await jamie.locator("header button.rounded-full").click();
check((await jamie.getByRole("link", { name: "Switch profile" }).count()) === 1, "Switch profile shows only with the test sign-in (on here)");

console.log(errors.length ? "\nBrowser errors:\n" + errors.join("\n") : "\nNo browser errors.");
await b.close();
console.log(fail ? `${fail} FAILED` : "all passed");
process.exit(fail ? 1 : 0);
