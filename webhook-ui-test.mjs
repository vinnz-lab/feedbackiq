/**
 * Integrations page + incoming webhook, end to end (run via run-ws-suites.sh).
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
  return page;
}
const card = (p) => p.locator("section", { hasText: "Incoming webhook" });
const open = (p) => p.goto(base + "/integrations", { waitUntil: "networkidle" });
async function post(path, body, { type = "application/json", auth } = {}) {
  const r = await fetch(base + path, { method: "POST", headers: { "content-type": type, ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, body: typeof body === "string" ? body : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}
async function create(p, regen = false) {
  await open(p);
  if (regen) { await p.getByRole("button", { name: "Get a new address" }).click(); await p.getByRole("button", { name: "Replace it" }).click(); }
  else await p.getByRole("button", { name: "Create webhook address" }).click();
  await p.getByTestId("webhook-url").waitFor({ timeout: 15000 });
  const url = (await p.getByTestId("webhook-url").innerText()).trim();
  return { url, path: new URL(url).pathname, token: url.split("/").pop() };
}

console.log("Navigation:");
const jamie = await session("Jamie Lee");
check((await jamie.getByRole("link", { name: "Integrations" }).count()) >= 1, "Integrations is in the sidebar");
await open(jamie);
let main = await jamie.locator("main").innerText();
check(/BRING FEEDBACK IN/i.test(main) && /SEND WORK OUT/i.test(main) && /AI connection/.test(main) && /Send roadmap items to Jira Cloud/.test(main), "one page: bring in, send out, AI");
check(/Not set up/.test(await card(jamie).innerText()), "webhook starts not set up");
await jamie.goto(base + "/settings", { waitUntil: "networkidle" });
check((await jamie.getByLabel("Jira API token").count()) === 0 && (await jamie.getByRole("link", { name: /Integrations/ }).count()) >= 1, "Settings points to Integrations instead");

console.log("\nCreating the address:");
const a = await create(jamie);
check(/^fiqwh_[A-Za-z0-9]{32}$/.test(a.token) && a.path.startsWith("/api/hooks/feedback/"), "shows a private address once", a.url);
await open(jamie);
const txt = await card(jamie).innerText();
check(/On · address ending …/.test(txt) && !txt.includes(a.token), "after reload: shows only the ending, never the address");

console.log("\nSending feedback:");
let r = await post(a.path, { feedback: "WH-ONE exporting to Excel loses all the cell formatting", customer: "Acme Ltd", name: "Jo Smith", source: "Typeform" });
check(r.status === 200 && r.j?.received === 1, "JSON item accepted", JSON.stringify(r.j));
r = await post(a.path, { feedback: "WH-ONE exporting to Excel loses all the cell formatting" });
check(r.status === 200 && r.j?.received === 0 && r.j?.skippedDuplicates === 1, "the same feedback again is skipped");
r = await post("/api/hooks/feedback", { items: [{ text: "WH-TWO search is slow" }, { comment: "WH-THREE love the board" }, { rating: 4 }] }, { auth: a.token });
check(r.status === 200 && r.j?.received === 2 && r.j?.ignored === 1, "Bearer header + a list of items", JSON.stringify(r.j));
r = await post(a.path, "WH-FOUR plain text works too", { type: "text/plain" });
check(r.status === 200 && r.j?.received === 1, "plain text");
r = await post(a.path, "{broken", {});
check(r.status === 400 && /JSON/.test(r.j?.error ?? ""), "broken JSON gets a clear 400");
r = await post("/api/hooks/feedback/fiqwh_" + "A".repeat(32), { feedback: "x" });
const r2 = await post("/api/hooks/feedback", { feedback: "x" });
const r3 = await post("/api/hooks/feedback", { feedback: "x" }, { auth: "nonsense" });
check(r.status === 401 && r2.status === 401 && r3.status === 401, "wrong, missing or junk secrets are refused");
const g = await fetch(base + a.path);
check(g.status === 405, "opening the address in a browser just explains it", String(g.status));

console.log("\nWhere it lands:");
await jamie.goto(base + "/register?tab=review", { waitUntil: "networkidle" });
main = await jamie.locator("main").innerText();
check(["WH-ONE", "WH-TWO", "WH-THREE", "WH-FOUR"].every((k) => main.includes(k)), "all four are in Needs review");
check(/Arrived unattended/.test(main) && /Typeform \(webhook\)/.test(main), "flagged as arrived unattended, with the app's name");
await open(jamie);
check(/4 items received/.test(await card(jamie).innerText()), "the card counts what arrived");

console.log("\nOther people:");
const tom = await session("Tom Becker");
await open(tom);
let t = await card(tom).innerText();
check(/On · address ending/.test(t) && /Only the workspace owner/.test(t) && (await tom.getByRole("button", { name: /Create webhook|Get a new address|Switch off/ }).count()) === 0, "a contributor sees the status but can't change it");
const tess = await session("Tess Tester");
await tess.goto(base + "/register?tab=review", { waitUntil: "networkidle" });
check(!(await tess.locator("main").innerText()).includes("WH-ONE"), "another workspace doesn't get Jamie's feedback");
const tw = await create(tess);
r = await post(tw.path, { feedback: "WH-TESS only for zebra" });
await jamie.goto(base + "/register?tab=review", { waitUntil: "networkidle" });
const jm = await jamie.locator("main").innerText();
await tess.goto(base + "/register?tab=review", { waitUntil: "networkidle" });
check(r.j?.received === 1 && !jm.includes("WH-TESS") && (await tess.locator("main").innerText()).includes("WH-TESS"), "each workspace's address feeds only that workspace");

console.log("\nSwitching off and replacing:");
await open(jamie);
await jamie.getByRole("button", { name: "Switch off" }).click();
await jamie.waitForTimeout(1500);
r = await post(a.path, { feedback: "WH-OFF should be refused" });
await open(jamie);
check(r.status === 401 && /Switched off/.test(await card(jamie).innerText()), "switched off: refused");
await jamie.getByRole("button", { name: "Switch on" }).click();
await jamie.waitForTimeout(1500);
r = await post(a.path, { feedback: "WH-ON back again" });
check(r.status === 200 && r.j?.received === 1, "switched back on: works");
const n = await create(jamie, true);
const old = await post(a.path, { feedback: "WH-OLD old address" });
const neu = await post(n.path, { feedback: "WH-NEW new address" });
check(n.token !== a.token && old.status === 401 && neu.status === 200, "a new address replaces the old one straight away");

console.log("\nLimits:");
const big = await post(n.path, { feedback: "x".repeat(300 * 1024) });
check(big.status === 413, "over 256 KB is refused", String(big.status));
const statuses = [];
for (let i = 0; i < 62; i++) statuses.push((await post(n.path, { rating: i })).status);
check(statuses.includes(429), "more than 60 requests a minute are slowed down", `first 429 at #${statuses.indexOf(429) + 1}`);

console.log(errors.length ? "\nBrowser errors:\n" + errors.join("\n") : "\nNo browser errors.");
await b.close();
console.log(fail ? `${fail} FAILED` : "all passed");
process.exit(fail ? 1 : 0);
