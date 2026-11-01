/** Visits every page as every kind of user: no crashes, no browser errors, new name everywhere. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const base = process.env.BASE || "http://localhost:4000";
let fail = 0;
const check = (ok, n, d = "") => { console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };
mkdirSync("/tmp/walk", { recursive: true });
const b = await chromium.launch();
const users = ["Jamie Lee", "Tom Becker", "Riya Shah", "Ana Costa", "Vera Viewer", "Tess Tester"];
const pages = ["/dashboard", "/themes", "/register", "/register?tab=review", "/roadmap", "/roadmap?view=board", "/trends", "/digest", "/ingest", "/integrations", "/settings"];
const BROKEN = /Application error|Internal Server Error|Something went wrong|Unhandled Runtime Error|This page could not be found/i;
for (const name of users) {
  console.log(`\n${name}:`);
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  page.on("response", (r) => { if (r.status() >= 500) errs.push(`${r.status()} ${r.url()}`); });
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.click(`text=${name}`);
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  const list = [...pages];
  // a theme detail page, if this workspace has themes
  await page.goto(base + "/themes", { waitUntil: "networkidle" });
  const th = await page.locator('a[href^="/themes/"]').first().getAttribute("href").catch(() => null);
  if (th) list.push(th);
  for (const p of list) {
    const before = errs.length;
    const r = await page.goto(base + p, { waitUntil: "networkidle" });
    const body = await page.locator("body").innerText();
    const sidebar = await page.locator("aside, nav").first().innerText().catch(() => "");
    const problems = [];
    if (!r || r.status() >= 400) problems.push(`HTTP ${r?.status()}`);
    if (BROKEN.test(body)) problems.push("error screen");
    if (/FeedbackIQ/.test(body)) problems.push("old name shown");
    if (!/Insight Hub/.test(sidebar + body)) problems.push("new name missing");
    if (errs.length > before) problems.push(errs.slice(before).join(" | ").slice(0, 300));
    if (name === "Jamie Lee" || name === "Vera Viewer") await page.screenshot({ path: `/tmp/walk/${name.split(" ")[0]}${p.replace(/[/?=]/g, "_")}.png`, fullPage: true });
    check(problems.length === 0, p, problems.join("; "));
  }
  await ctx.close();
}
console.log("\nPublic pages:");
const ctx = await b.newContext(); const page = await ctx.newPage();
for (const p of ["/login", "/forgot-password", "/reset-password", "/"]) {
  const r = await page.goto(base + p, { waitUntil: "networkidle" });
  const body = await page.locator("body").innerText();
  check(r.status() < 400 && !BROKEN.test(body) && !/FeedbackIQ/.test(body), p, `${r.status()} ${page.url().replace(base, "")}`);
}
check((await page.goto(base + "/login")) && (await page.title()) === "Insight Hub", "browser tab title is Insight Hub", await page.title());
await b.close();
console.log(fail ? `${fail} FAILED` : "all passed");
process.exit(fail ? 1 : 0);
