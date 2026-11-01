/** The search box, end to end (run via run-ws-suites.sh). */
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
const box = (p) => p.getByRole("combobox", { name: "Search" });
const list = (p) => p.locator("#search-results");
async function type(p, text) { await box(p).fill(text); await p.waitForTimeout(900); return list(p).innerText().catch(() => ""); }

console.log("Access:");
check((await fetch(base + "/api/search?q=export")).status === 401, "search needs a sign-in");

const jamie = await session("Jamie Lee");
console.log("\nTyping:");
let t = await type(jamie, "e");
check((await list(jamie).count()) === 0, "one letter doesn't search yet");
t = await type(jamie, "export");
check(/THEMES/i.test(t) && /Export to Excel/.test(t), "themes appear as you type", t.split("\n").slice(0, 3).join(" | "));
check(/FEEDBACK/i.test(t) && /ROADMAP/i.test(t), "feedback and roadmap items too");
check((await list(jamie).locator("mark").first().innerText()).toLowerCase() === "export", "the matching word is highlighted");
check(/See all feedback matching “export”/.test(t), "offers a full list");

console.log("\nKeyboard:");
await box(jamie).press("Enter");
await jamie.waitForURL(/\/themes\//, { timeout: 10000 });
check(/Export to Excel/.test(await jamie.locator("h1").innerText()), "Enter opens the top result");
await jamie.keyboard.press("Control+k");
check(await box(jamie).evaluate((el) => el === document.activeElement), "Ctrl+K jumps to the search box");
await box(jamie).press("Escape");
await box(jamie).press("Escape");
await jamie.locator("h1").click();
check(await box(jamie).evaluate((el) => el !== document.activeElement), "Escape leaves the box");
await jamie.keyboard.press("/");
check(await box(jamie).evaluate((el) => el === document.activeElement), "so does /");
await type(jamie, "northwind");
const hits = await list(jamie).getByTestId("search-hit").count();
for (let i = 0; i < hits; i++) await box(jamie).press("ArrowDown"); // to "See all"
await box(jamie).press("Enter");
await jamie.waitForURL(/\/register\?q=northwind/);
let main = await jamie.locator("main").innerText();
check((await jamie.getByTestId("search-filter").count()) === 1 && /Showing only what matches “northwind”/.test(main), "arrow keys reach “See all”, which opens Register filtered");
const rows = await jamie.locator("tbody tr").allInnerTexts();
check(rows.length > 0 && rows.every((r) => /northwind/i.test(r)), "every row shown matches", `${rows.length} rows`);
await jamie.getByRole("link", { name: /Sources/ }).click();
await jamie.waitForURL(/tab=sources&q=northwind/);
check((await jamie.locator("tbody tr").allInnerTexts()).every((r) => /northwind/i.test(r)), "switching tabs keeps the search");
await jamie.getByRole("link", { name: "✕ Clear search" }).click();
await jamie.waitForURL(/tab=sources$/);
check((await jamie.getByTestId("search-filter").count()) === 0 && (await jamie.locator("tbody tr").count()) > rows.length - 1, "Clear search shows everything again");
await jamie.goto(base + "/register?q=nothing-like-this-xyz", { waitUntil: "networkidle" });
check(/Nothing here matches “nothing-like-this-xyz”/.test(await jamie.locator("main").innerText()), "an empty result says so");
await box(jamie).click();
t = await type(jamie, "zzqqxx");
check(/Nothing matches “zzqqxx” in this workspace/.test(t), "the box says when nothing matches");
await box(jamie).press("Escape");
check((await box(jamie).inputValue()) === "", "Escape clears it");

console.log("\nWaiting-for-review feedback:");
await jamie.goto(base + "/register?tab=review", { waitUntil: "networkidle" });
const pending = (await jamie.locator("main").innerText()).match(/“([^”]{12,})/)?.[1]?.split(" ").slice(0, 3).join(" ");
t = await type(jamie, pending ?? "dark mode");
check(/Needs review/.test(t), "marked as needing review", pending);
await list(jamie).getByTestId("search-hit").filter({ hasText: "Needs review" }).first().click();
await jamie.waitForURL(/tab=review&q=/);
check((await jamie.locator("main").innerText()).includes(pending ?? "dark mode"), "opens Needs review, filtered to it");

console.log("\nWorkspaces and roles:");
const tess = await session("Tess Tester");
t = await type(tess, "export");
check(!/Excel|Northwind/.test(t) && /ZEBRA/.test(t), "another workspace only finds its own", t.split("\n").slice(0, 3).join(" | "));
const vera = await session("Vera Viewer");
t = await type(vera, "export");
check(/Export to Excel/.test(t), "a viewer can search");

console.log(errors.length ? "\nBrowser errors:\n" + errors.join("\n") : "\nNo browser errors.");
await b.close();
console.log(fail ? `${fail} FAILED` : "all passed");
process.exit(fail ? 1 : 0);
