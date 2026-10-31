/**
 * Browser check: rename a theme on its page, then confirm the new name shows
 * everywhere (Themes, Dashboard, Roadmap list, Roadmap board) and the old one
 * is gone; refusals are shown; Cancel and Escape change nothing.
 *
 *   PGLITE_DIR=./.pglite-test npx tsx scripts/db-setup.ts
 *   PGLITE_DIR=./.pglite-test ALLOW_DEV_LOGIN=true npx next start -p 4000 &
 *   node rename-ui-test.mjs
 */
import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:4000";
let fail = 0;
const check = (ok, n, d = "") => { console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(base + "/login", { waitUntil: "networkidle" });
await page.click("text=Jamie Lee");
await page.waitForURL("**/dashboard");

// Pick a theme that is on the roadmap, so the roadmap half is really tested.
await page.goto(base + "/themes", { waitUntil: "networkidle" });
const card = page.locator("div.relative", { has: page.locator("text=On roadmap") }).first();
const href = await card.locator("a[href^='/themes/']").first().getAttribute("href");
const oldName = (await card.locator("a[href^='/themes/'] .text-\\[16px\\]").first().innerText()).replace(/EMERGING/, "").trim();
const other = (await page.locator("a[href^='/themes/'] .text-\\[16px\\]").nth(1).innerText()).replace(/EMERGING/, "").trim();
const newName = `${oldName} (renamed ${Date.now() % 10000})`;
console.log(`renaming “${oldName}” → “${newName}”`);

await page.goto(base + href, { waitUntil: "networkidle" });
const pencil = page.getByRole("button", { name: "Rename theme" });
const box = page.getByRole("textbox", { name: "Theme name" });

// Cancel and Escape leave it alone
await pencil.click(); await box.fill("Should not save"); await page.getByRole("button", { name: "Cancel" }).click();
check((await page.locator("h1").innerText()) === oldName, "Cancel changes nothing");
await pencil.click(); await box.fill("Should not save"); await box.press("Escape");
check((await page.locator("h1").innerText()) === oldName, "Escape changes nothing");

// Refusals
await pencil.click(); await box.fill("   ");
check(await page.getByRole("button", { name: "Save" }).isDisabled(), "Save is disabled for a blank name");
await box.fill(other); await page.getByRole("button", { name: "Save" }).click();
await page.waitForTimeout(1200);
const err = await page.locator("text=/already called/").count();
check(err > 0, "duplicate of another theme's name is refused with a clear message", other);
await page.getByRole("button", { name: "Cancel" }).click();

// The real rename (Enter to save)
await pencil.click(); await box.fill(newName); await box.press("Enter");
await page.waitForTimeout(1500);
await page.reload({ waitUntil: "networkidle" });
check((await page.locator("h1").innerText()) === newName, "theme page shows the new name after reload");

const shows = async (path, label) => {
  await page.goto(base + path, { waitUntil: "networkidle" });
  const t = await page.locator("main").innerText();
  check(t.includes(newName) && !t.split("\n").some((l) => l.trim() === oldName), `${label} shows the new name, not the old one`);
};
await shows("/themes", "Themes page");
await shows("/dashboard", "Dashboard");
await shows("/roadmap", "Roadmap list");
await shows("/roadmap?view=board", "Roadmap board");

// Rename back so the test can be re-run against the same database
await page.goto(base + href, { waitUntil: "networkidle" });
await pencil.click(); await box.fill(oldName); await box.press("Enter"); await page.waitForTimeout(1200);

check(errors.length === 0, "no browser errors", errors.slice(0, 2).join(" | "));
await b.close();
console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
