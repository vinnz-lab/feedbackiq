/**
 * Takes the screenshots for the Getting Started PDF from a running server
 * seeded with scripts/guide/seed-guide.ts. Output: /tmp/guide-shots/*.jpg
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const base = process.env.BASE || "http://localhost:4000";
const out = process.env.OUT || "/tmp/guide-shots";
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const HIDE_BANNER = `[data-testid="sample-banner"]{display:none!important}`;
async function session(name, { hideGuide = true } = {}) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.click(`text=${name}`);
  await page.waitForURL("**/dashboard");
  if (hideGuide) await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("ih-guide-hidden")) localStorage.removeItem(k); });
  return page;
}
async function go(p, path, css = HIDE_BANNER) {
  await p.goto(base + path, { waitUntil: "networkidle" });
  await p.addStyleTag({ content: css });
  await p.mouse.move(2, 2);
  await p.waitForTimeout(400);
}
const shot = (p, name, clip) => p.screenshot({ path: `${out}/${name}.jpg`, type: "jpeg", quality: 82, clip });

// Day one: an empty workspace.
const sam = await session("Sam Lee");
await go(sam, "/dashboard");
await shot(sam, "01-welcome", { x: 240, y: 64, width: 1200, height: 640 });

const alex = await session("Alex Morgan");
await go(alex, "/dashboard", HIDE_BANNER + `section[aria-label="Getting started"]{display:none!important}`);
await shot(alex, "03-dashboard", { x: 0, y: 0, width: 1440, height: 900 });
await go(alex, "/ingest");
await shot(alex, "04-ingest", { x: 240, y: 64, width: 1200, height: 560 });
await go(alex, "/register?tab=review");
await shot(alex, "05-review", { x: 240, y: 64, width: 1200, height: 760 });
await go(alex, "/themes");
await shot(alex, "06-themes", { x: 240, y: 64, width: 1200, height: 760 });
await alex.getByRole("link", { name: /Slow Board Loading/ }).first().click();
await alex.waitForLoadState("networkidle");
await alex.addStyleTag({ content: HIDE_BANNER });
await alex.waitForTimeout(400);
await shot(alex, "07-theme", { x: 240, y: 64, width: 1200, height: 760 });
await go(alex, "/roadmap");
await shot(alex, "08-roadmap", { x: 240, y: 64, width: 1200, height: 640 });
await go(alex, "/digest");
await shot(alex, "09-digest", { x: 240, y: 64, width: 1200, height: 800 });
await go(alex, "/integrations");
await shot(alex, "10-integrations", { x: 240, y: 64, width: 1200, height: 820 });

// Audio briefings, with the script open.
await go(alex, "/briefings");
await alex.getByText("Read the script").first().click();
await alex.waitForTimeout(300);
await shot(alex, "14-briefings", { x: 240, y: 64, width: 1200, height: 836 });
await alex.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await alex.waitForTimeout(300);
await alex.getByTestId("briefing").first().screenshot({ path: `${out}/15-briefing-item.jpg`, type: "jpeg", quality: 82 });
await go(alex, "/privacy");
await shot(alex, "16-privacy", { x: 0, y: 0, width: 1440, height: 760 });

// Share link + the page it opens.
await go(alex, "/roadmap");
await alex.getByRole("button", { name: /🔗 Share/ }).click();
if (await alex.getByRole("button", { name: "Create share link" }).count()) await alex.getByRole("button", { name: "Create share link" }).click();
await alex.getByTestId("share-url").waitFor();
await alex.waitForTimeout(300);
const url = (await alex.getByTestId("share-url").innerText()).trim();
const anon = await (await b.newContext({ viewport: { width: 1060, height: 520 }, deviceScaleFactor: 2 })).newPage();
await anon.goto(url, { waitUntil: "networkidle" });
await anon.screenshot({ path: `${out}/11-shared-roadmap.jpg`, type: "jpeg", quality: 82 });

// Search and Feedback.
await go(alex, "/dashboard");
await alex.getByRole("combobox", { name: "Search" }).fill("export");
await alex.waitForTimeout(1200);
await shot(alex, "12-search", { x: 240, y: 0, width: 900, height: 640 });
await alex.keyboard.press("Escape");
await alex.keyboard.press("Escape");
if (await alex.getByRole("button", { name: "Feedback" }).count()) {
  await alex.getByRole("button", { name: "Feedback" }).click();
  await alex.getByLabel("Your feedback").fill("Love the sample data — could the digest also go out by email?");
  await alex.waitForTimeout(300);
  await shot(alex, "13-feedback", { x: 840, y: 0, width: 600, height: 460 });
}
await b.close();
console.log("shots in", out);
