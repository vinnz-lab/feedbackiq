/** Visits every page as every kind of user: no crashes, no browser errors, new name everywhere. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const base = process.env.BASE || "http://localhost:4000";
let fail = 0;
const check = (ok, n, d = "") => { console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };
mkdirSync("/tmp/walk", { recursive: true });
const b = await chromium.launch();
const users = ["Jamie Lee", "Tom Becker", "Riya Shah", "Ana Costa", "Vera Viewer", "Tess Tester"];
const pages = ["/dashboard", "/themes", "/register", "/register?tab=review", "/roadmap", "/roadmap?view=board", "/trends", "/digest", "/ingest", "/integrations", "/briefings", "/settings"];
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
for (const p of ["/login", "/forgot-password", "/reset-password", "/", "/privacy"]) {
  const r = await page.goto(base + p, { waitUntil: "networkidle" });
  const body = await page.locator("body").innerText();
  check(r.status() < 400 && !BROKEN.test(body) && !/FeedbackIQ/.test(body), p, `${r.status()} ${page.url().replace(base, "")}`);
}
check((await page.goto(base + "/login")) && (await page.title()).startsWith("Insight Hub"), "browser tab title starts with Insight Hub", await page.title());
const og = async (prop) => page.locator(`meta[property="${prop}"]`).getAttribute("content").catch(() => null);
const ogImg = await og("og:image");
check(/opengraph-image/.test(ogImg ?? "") && /Every customer voice/.test((await og("og:description")) ?? "") && (await og("og:site_name")) === "Insight Hub", "link previews (LinkedIn etc.) get a title, description and image", ogImg);
const imgRes = await fetch(new URL(new URL(ogImg).pathname + new URL(ogImg).search, base));
check(imgRes.ok && imgRes.headers.get("content-type") === "image/jpeg" && (await imgRes.arrayBuffer()).byteLength > 50000, "…and the preview image loads");
check((await page.locator('meta[name="twitter:card"]').getAttribute("content")) === "summary_large_image", "large preview card");
await page.goto(base + "/privacy", { waitUntil: "networkidle" });
const priv = await page.locator("body").innerText();
check(/How AI is used/.test(priv) && /Stockholm/.test(priv) && /30 days/.test(priv) && /Feedback/.test(priv) && (await page.title()) === "Privacy · Insight Hub", "the privacy page is public, with the key sections", await page.title());
await page.goto(base + "/login", { waitUntil: "networkidle" });
await page.getByRole("link", { name: "Privacy" }).click();
await page.waitForURL("**/privacy");
check(true, "the sign-in page links to it");
await b.close();
console.log(fail ? `${fail} FAILED` : "all passed");
process.exit(fail ? 1 : 0);
