/**
 * Gap 2: the platform owner removes a workspace they set up, without opening it.
 * Also checks the "Your account" section is there for everyone.
 *
 *   PGLITE_DIR=./.pglite-iso npx tsx scripts/db-setup.ts
 *   PGLITE_DIR=./.pglite-iso npx tsx scripts/seed-second-workspace.ts
 *   PGLITE_DIR=./.pglite-iso ALLOW_DEV_LOGIN=true PLATFORM_ADMIN_EMAILS=jamie@acme.test npx next start -p 4000 &
 *   node workspace-remove-test.mjs
 */
import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:4000";
let fail = 0;
const check = (ok, n, d = "") => { console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };
const b = await chromium.launch();
const errors = [];
async function session(name) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1200 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.click(`text=${name}`);
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  return { ctx, page, cookie: async () => (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ") };
}
const exp = async (s) => JSON.parse(await (await fetch(base + "/api/export", { headers: { Cookie: await s.cookie() } })).text());
const loginNames = async () => {
  const ctx = await b.newContext(); const p = await ctx.newPage();
  await p.goto(base + "/login", { waitUntil: "networkidle" });
  const t = await p.locator("body").innerText(); await ctx.close(); return t;
};
const menu = async (page) => {
  await page.getByRole("button", { name: "Switch workspace" }).click();
  const names = (await page.getByRole("menuitem").allInnerTexts()).map((s) => s.trim());
  await page.keyboard.press("Escape");
  return names;
};
async function provision(page, name, email, workspace, password = "test-pass-12345") {
  await page.goto(base + "/settings", { waitUntil: "networkidle" });
  await page.getByLabel("Their name").fill(name);
  await page.getByLabel("Their email").fill(email);
  await page.getByLabel("Their workspace name").fill(workspace);
  await page.getByLabel("Their password").fill(password);
  await page.getByRole("button", { name: "Create their workspace" }).click();
  await page.waitForTimeout(2000);
}
async function addPerson(page, name, email) {
  await page.goto(base + "/settings", { waitUntil: "networkidle" });
  const f = page.locator("form", { has: page.getByRole("button", { name: "Add person" }) });
  await f.locator('input[name="name"]').fill(name);
  await f.locator('input[name="email"]').fill(email);
  await f.locator('input[name="password"]').fill("test-pass-12345");
  await f.getByRole("button", { name: "Add person" }).click();
  await page.waitForTimeout(1800);
}

console.log("Your account section:");
const tom = await session("Tom Becker");
const tSet = await tom.page.goto(base + "/settings", { waitUntil: "networkidle" }).then(() => tom.page.locator("main").innerText());
check(/Your account/.test(tSet) && /tom@acme\.test/.test(tSet), "every signed-in person (even a contributor) has a 'Your account' section");

console.log("\nSet-up: Priya's workspace, with Sam (only there) and Tom (also in Acme):");
const jamie = await session("Jamie Lee");
const acmeBefore = (await exp(jamie)).counts;
await provision(jamie.page, "Priya Patel", "priya@new.test", "Priya's testing");
const priya = await session("Priya Patel");
await fetch(base + "/api/ingest", { method: "POST", headers: { "Content-Type": "application/json", Cookie: await priya.cookie() }, body: JSON.stringify({ paste: "PRIYA-PRIVATE " + Date.now() }) });
await addPerson(priya.page, "Sam Rivers", "sam@new.test");
await addPerson(priya.page, "Tom Becker", "tom@acme.test");
await tom.page.goto(base + "/dashboard", { waitUntil: "networkidle" });
check((await menu(tom.page)).includes("Priya's testing"), "Tom is now in Acme and Priya's");

console.log("\nJamie's list:");
await jamie.page.goto(base + "/settings", { waitUntil: "networkidle" });
await jamie.page.getByRole("button", { name: "Remove Priya's testing" }).click();
const confirmText = await jamie.page.locator("main").innerText();
check(/It has 3 people in it/.test(confirmText), "it says how many people are in it (a number, no names)");
check(/sign-in of the 2 people who would have no workspace left/.test(confirmText), "it knows 2 would be left with nowhere (Priya, Sam) — Tom has Acme");
check(!/PRIYA-PRIVATE/.test(await jamie.page.content()), "nothing from inside the workspace is shown");
const removeBtn = jamie.page.getByRole("button", { name: "Remove permanently" });
check(await removeBtn.isDisabled(), "Remove is disabled until the name is typed");
await jamie.page.getByLabel("Type Priya's testing to confirm removal").fill("Priyas testing");
check(await removeBtn.isDisabled(), "a near-miss name keeps it disabled");
await removeBtn.evaluate((el) => { el.disabled = false; });
await removeBtn.click();
await jamie.page.waitForTimeout(1800);
check((await jamie.page.locator("text=/Type the workspace name exactly/").count()) > 0, "the SERVER refuses the wrong name too");

await jamie.page.getByLabel("Type Priya's testing to confirm removal").fill("Priya's testing");
await removeBtn.click();
await jamie.page.waitForTimeout(2500);
const done = await jamie.page.locator("main").innerText();
check(/Removed “Priya's testing”/.test(done) && /Sign-ins removed: .*Priya Patel/.test(done) && /Sam Rivers/.test(done), "it's removed, with Priya's and Sam's sign-ins", done.match(/Removed.*$/m)?.[0]);
check(/1 person keeps their account/.test(done), "and says Tom keeps his account");

console.log("\nAfterwards:");
const names = await loginNames();
check(!/Priya Patel/.test(names) && !/Sam Rivers/.test(names), "Priya and Sam can no longer sign in");
check(/Tom Becker/.test(names), "Tom still can");
await tom.page.goto(base + "/dashboard", { waitUntil: "networkidle" });
const tm = await menu(tom.page);
check(tm.length === 1 && tm[0] === "Acme App", "Tom just has Acme now", tm.join(", "));
const acmeAfterData = await exp(jamie);
for (const k of ["feedbackItems", "themes", "sources", "enhancements", "workspaceMembers"]) {
  check(acmeAfterData.counts[k] === acmeBefore[k], `Acme ${k} unchanged`, `${acmeBefore[k]} → ${acmeAfterData.counts[k]}`);
}
check(acmeAfterData.data.auditEvents.some((a) => a.action === "workspace.removed" && a.after?.name === "Priya's testing"), "the removal is recorded in Jamie's workspace log");
await jamie.page.reload({ waitUntil: "networkidle" });
check(!/Priya's testing/.test(await jamie.page.locator("main").innerText()), "it's gone from his list");
const tess = await session("Tess Tester");
check((await exp(tess)).counts.feedbackItems === 4, "Tess's workspace untouched");

console.log("\nRemoving but KEEPING sign-ins:");
await provision(jamie.page, "Kim Lee", "kim@new.test", "Kim's space");
await jamie.page.goto(base + "/settings", { waitUntil: "networkidle" });
await jamie.page.getByRole("button", { name: "Remove Kim's space" }).click();
await jamie.page.getByLabel("Also remove the sign-in", { exact: false }).uncheck();
await jamie.page.getByLabel("Type Kim's space to confirm removal").fill("Kim's space");
await jamie.page.getByRole("button", { name: "Remove permanently" }).click();
await jamie.page.waitForTimeout(2500);
check(/Kim Lee/.test(await loginNames()), "with the box unticked, Kim keeps her sign-in");
const kim = await (async () => {
  const ctx = await b.newContext(); const p = await ctx.newPage();
  await p.goto(base + "/login", { waitUntil: "networkidle" }); await p.click("text=Kim Lee");
  await p.waitForURL("**/dashboard", { timeout: 15000 }); await p.waitForLoadState("networkidle"); const t = await p.locator("body").innerText(); await ctx.close(); return t;
})();
check(/No workspace yet/.test(kim), "…and sees 'No workspace yet' when she signs in");

console.log("\nOthers can't:");
const tSet2 = await tess.page.goto(base + "/settings", { waitUntil: "networkidle" }).then(() => tess.page.locator("main").innerText());
check(!/Workspaces you've set up/.test(tSet2), "Tess (not platform owner) has no such list");

check(errors.length === 0, "no browser errors", errors.slice(0, 2).join(" | "));
await b.close();
console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
