import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.BASE || "http://localhost:3200";
mkdirSync("shots", { recursive: true });

// authed routes captured once per theme after logging in
const ROUTES = [
  ["dashboard", "/dashboard"],
  ["register-items", "/register"],
  ["register-review", "/register?tab=review"],
  ["register-sources", "/register?tab=sources"],
];

const browser = await chromium.launch();

async function capture(theme, wantLogin) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem("fiq-theme", t);
    } catch (e) {}
  }, theme);
  const page = await ctx.newPage();

  if (wantLogin) {
    await page.goto(base + "/login", { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `shots/00-login-${theme}.png` });
  }

  // log in as Jamie Lee (owner) via the real dev-login flow
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.click("text=Jamie Lee");
  await page.waitForURL("**/dashboard", { timeout: 15000 });

  for (const [name, route] of ROUTES) {
    await page.goto(base + route, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `shots/${name}-${theme}.png` });
    console.log("shot:", `${name}-${theme}`);
  }
  await ctx.close();
}

await capture("light", true);
await capture("dark", false);
await browser.close();
console.log("ALL DONE");
