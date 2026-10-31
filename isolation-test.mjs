/**
 * WORKSPACE ISOLATION — the test that matters most for multi-workspace.
 *
 * Two workspaces: "Acme App" (Jamie, the demo owner) and "ZEBRA Space" (Tess,
 * a tester). Every ZEBRA string must be invisible to Jamie and every Acme string
 * invisible to Tess, on every page, in backups, via forged cookies, via guessed
 * URLs — and writes in one workspace (including Clear the register) must not
 * touch the other.
 *
 *   PGLITE_DIR=./.pglite-iso npx tsx scripts/db-setup.ts
 *   PGLITE_DIR=./.pglite-iso npx tsx scripts/seed-second-workspace.ts
 *   PGLITE_DIR=./.pglite-iso ALLOW_DEV_LOGIN=true npx next start -p 4000 &
 *   node isolation-test.mjs
 */
import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:4000";
let fail = 0;
const check = (ok, n, d = "") => { console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };

const ACME = ["Slow dashboard loading", "Export to Excel", "Acme App", "Northwind", "jamie@acme.test"];
const ZEBRA = ["ZEBRA"];
const PAGES = ["/dashboard", "/themes", "/register", "/register?tab=review", "/register?tab=sources",
  "/roadmap", "/roadmap?view=board", "/trends", "/digest", "/settings", "/ingest"];

const b = await chromium.launch();

async function session(name) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.click(`text=${name}`);
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  const cookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  return { ctx, page, errors, cookie };
}
const textOf = async (page, path) => {
  const res = await page.goto(base + path, { waitUntil: "networkidle" });
  return { status: res.status(), text: await page.locator("body").innerText(), html: await page.content() };
};
const leaks = (s, words) => words.filter((w) => s.includes(w));
const exportJson = async (cookie) => {
  const r = await fetch(base + "/api/export", { headers: { Cookie: cookie } });
  return { status: r.status, body: r.status === 200 ? await r.text() : "" };
};

const jamie = await session("Jamie Lee");
const tess = await session("Tess Tester");

// Collect ids we will try to reach across the boundary.
await jamie.page.goto(base + "/themes", { waitUntil: "networkidle" });
const acmeThemeHref = await jamie.page.locator("a[href^='/themes/']").evaluateAll((a) => a.map((x) => x.getAttribute("href")).find((h) => /^\/themes\/[0-9a-f-]{36}$/.test(h)));
await tess.page.goto(base + "/themes", { waitUntil: "networkidle" });
const zebraThemeHref = await tess.page.locator("a[href^='/themes/']").evaluateAll((a) => a.map((x) => x.getAttribute("href")).find((h) => /^\/themes\/[0-9a-f-]{36}$/.test(h)));
check(Boolean(acmeThemeHref && zebraThemeHref), "both workspaces have a theme to probe");

console.log("\nReading — every page, both directions:");
for (const p of PAGES) {
  const t = await textOf(tess.page, p);
  const l = leaks(t.html, ACME);
  check(t.status === 200 && l.length === 0, `Tess sees no Acme data on ${p}`, l.join(", "));
  const j = await textOf(jamie.page, p);
  const lz = leaks(j.html, ZEBRA);
  check(j.status === 200 && lz.length === 0, `Jamie sees no ZEBRA data on ${p}`, lz.join(", "));
}
const tessDash = await textOf(tess.page, "/themes");
check(tessDash.text.includes("ZEBRA crossing export"), "Tess DOES see her own theme (the test isn't vacuous)");
const jamieDash = await textOf(jamie.page, "/themes");
check(jamieDash.text.includes("Slow dashboard loading"), "Jamie DOES see his own themes");

console.log("\nGuessed URLs:");
const cross1 = await textOf(tess.page, acmeThemeHref);
check(/Theme not found/.test(cross1.text) && leaks(cross1.html, ACME).length === 0, "Tess opening an Acme theme URL gets 'not found'");
const cross2 = await textOf(jamie.page, zebraThemeHref);
check(/Theme not found/.test(cross2.text) && leaks(cross2.html, ZEBRA).length === 0, "Jamie opening a ZEBRA theme URL gets 'not found'");
const junk = await textOf(tess.page, "/themes/not-a-uuid");
check(junk.status === 200 && /Theme not found/.test(junk.text), "a malformed theme id fails cleanly");

console.log("\nForged workspace cookie:");
// Learn Acme's workspace id from Jamie's own backup, then plant it in Tess's browser.
const jx = await exportJson(jamie.cookie);
const acmeWsId = JSON.parse(jx.body).data.workspaces[0].id;
await tess.ctx.addCookies([{ name: "fiq_ws", value: acmeWsId, url: base }]);
const forged = await textOf(tess.page, "/themes");
check(leaks(forged.html, ACME).length === 0 && forged.text.includes("ZEBRA"), "Tess with Acme's workspace id in her cookie still sees only ZEBRA");
const forgedCookie = (await tess.ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
const fx = await exportJson(forgedCookie);
check(fx.status === 200 && leaks(fx.body, ACME).length === 0, "…and her backup still contains only ZEBRA");

console.log("\nBackups:");
check(jx.status === 200 && leaks(jx.body, ZEBRA).length === 0, "Jamie's backup contains no ZEBRA data");
const tx = await exportJson(tess.cookie);
check(tx.status === 200 && leaks(tx.body, ACME).length === 0 && tx.body.includes("ZEBRA-B approved quote"), "Tess's backup contains only her own data");
const jData = JSON.parse(jx.body);
check(jData.data.workspaces.length === 1 && jData.data.tenants.length === 1, "a backup holds exactly one workspace and one tenant");
check(!jData.data.users.some((u) => u.email === "tess@zebra.test"), "Jamie's backup doesn't list Tess");

console.log("\nWriting — nothing crosses over:");
const before = JSON.parse(jx.body).counts;
// Tess uploads feedback: it must land in ZEBRA.
const up = await fetch(base + "/api/ingest", {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: tess.cookie },
  body: JSON.stringify({ paste: "ZEBRA-B pasted feedback about zebra things " + Date.now() }),
});
check(up.status === 200, "Tess can upload", `HTTP ${up.status}`);
const tAfterUp = JSON.parse((await exportJson(tess.cookie)).body);
check(tAfterUp.data.feedbackItems.some((i) => i.quote.startsWith("ZEBRA-B pasted feedback")), "her upload landed in ZEBRA Space");
// Tess approves her pending item through the UI.
await tess.page.goto(base + "/register?tab=review", { waitUntil: "networkidle" });
await tess.page.locator("div", { hasText: "ZEBRA-B pending quote" }).locator("button", { hasText: "✓ Approve" }).last().click();
await tess.page.waitForTimeout(1500);
// Tess renames her theme.
await tess.page.goto(base + zebraThemeHref, { waitUntil: "networkidle" });
await tess.page.getByRole("button", { name: "Rename theme" }).click();
await tess.page.getByRole("textbox", { name: "Theme name" }).fill("ZEBRA renamed theme");
await tess.page.getByRole("textbox", { name: "Theme name" }).press("Enter");
await tess.page.waitForTimeout(1500);
// A rename that collides with an ACME theme name must be allowed — names only need to be unique WITHIN a workspace.
await tess.page.getByRole("button", { name: "Rename theme" }).click();
await tess.page.getByRole("textbox", { name: "Theme name" }).fill("Export to Excel");
await tess.page.getByRole("textbox", { name: "Theme name" }).press("Enter");
await tess.page.waitForTimeout(1500);
const renamed = await textOf(tess.page, zebraThemeHref);
check(renamed.text.includes("Export to Excel"), "Tess can use a name that exists in ANOTHER workspace (uniqueness is per workspace)");
// Tess clears HER register.
await tess.page.goto(base + "/settings", { waitUntil: "networkidle" });
await tess.page.getByLabel("I have downloaded a backup").check();
await tess.page.locator('input[name="confirm"]').fill("CLEAR");
await tess.page.getByRole("button", { name: "Clear the register" }).click();
await tess.page.waitForTimeout(2500);
const tAfterClear = JSON.parse((await exportJson(tess.cookie)).body).counts;
check(tAfterClear.feedbackItems === 0 && tAfterClear.themes === 0, "Tess's Clear the register emptied ZEBRA Space", JSON.stringify(tAfterClear));
const after = JSON.parse((await exportJson(jamie.cookie)).body).counts;
for (const k of ["feedbackItems", "themes", "sources", "enhancements", "digests"]) {
  check(after[k] === before[k], `Acme ${k} untouched by everything Tess did`, `${before[k]} → ${after[k]}`);
}
const jamieThemes = await textOf(jamie.page, "/themes");
check(jamieThemes.text.includes("Export to Excel") && jamieThemes.text.includes("Slow dashboard loading"), "Jamie's themes still all there, names unchanged");

console.log("\nTeam pages:");
const tSet = await textOf(tess.page, "/settings");
check(!/Jamie Lee|Tom Becker|Riya Shah/.test(tSet.text), "Tess's team list shows none of Jamie's team");
const jSet = await textOf(jamie.page, "/settings");
check(!/Tess Tester/.test(jSet.text), "Jamie's team list doesn't show Tess");

check(jamie.errors.length + tess.errors.length === 0, "no browser errors", [...jamie.errors, ...tess.errors].slice(0, 2).join(" | "));
await b.close();
console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
