/**
 * Phase 3: giving someone their own private workspace.
 *
 *   PGLITE_DIR=./.pglite-iso npx tsx scripts/db-setup.ts
 *   PGLITE_DIR=./.pglite-iso npx tsx scripts/seed-second-workspace.ts
 *   PGLITE_DIR=./.pglite-iso ALLOW_DEV_LOGIN=true PLATFORM_ADMIN_EMAILS=jamie@acme.test npx next start -p 4000 &
 *   node workspace-provision-test.mjs
 */
import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:4000";
let fail = 0;
const check = (ok, n, d = "") => { console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };
const b = await chromium.launch();
const errors = [];
async function session(name) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1100 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.click(`text=${name}`);
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  return { ctx, page, cookie: async () => (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ") };
}
const exp = async (s) => JSON.parse(await (await fetch(base + "/api/export", { headers: { Cookie: await s.cookie() } })).text());
const menu = async (page) => {
  await page.getByRole("button", { name: "Switch workspace" }).click();
  const names = (await page.getByRole("menuitem").allInnerTexts()).map((s) => s.trim());
  const canCreate = (await page.getByRole("button", { name: "New workspace" }).count()) > 0;
  await page.keyboard.press("Escape");
  return { names, canCreate };
};
const PROVISION = "Give someone their own workspace";
async function provision(page, { name, email, workspace, password }) {
  await page.goto(base + "/settings", { waitUntil: "networkidle" });
  await page.getByLabel("Their name").fill(name);
  await page.getByLabel("Their email").fill(email);
  if (workspace) await page.getByLabel("Their workspace name").fill(workspace);
  await page.getByLabel("Their password").fill(password ?? "");
  await page.getByRole("button", { name: "Create their workspace" }).click();
  await page.waitForTimeout(2000);
  return page.locator("main").innerText();
}

console.log("Who sees the setup form:");
const jamie = await session("Jamie Lee");
await jamie.page.goto(base + "/settings", { waitUntil: "networkidle" });
check((await jamie.page.locator(`text=${PROVISION}`).count()) > 0, "Jamie (platform owner) sees it");
const tom = await session("Tom Becker");
await tom.page.goto(base + "/settings", { waitUntil: "networkidle" });
check((await tom.page.locator(`text=${PROVISION}`).count()) === 0, "Tom (contributor) doesn't");
const tess = await session("Tess Tester");
await tess.page.goto(base + "/settings", { waitUntil: "networkidle" });
check((await tess.page.locator(`text=${PROVISION}`).count()) === 0, "Tess (owner of her own workspace, not platform owner) doesn't");

console.log("\nRefusals:");
let t = await provision(jamie.page, { name: "Jamie Again", email: "jamie@acme.test", password: "longenoughpassword" });
check(/That's your own email/.test(t), "his own email is refused");
t = await provision(jamie.page, { name: "Short Pass", email: "short@new.test", password: "abc" });
check(/at least 10 characters/.test(t), "a short password is refused for a new person");

console.log("\nJamie sets up Priya:");
const acmeBefore = (await exp(jamie)).counts;
t = await provision(jamie.page, { name: "Priya Patel", email: "priya@new.test", workspace: "Priya's testing", password: "priya-test-pass-123" });
check(/Created “Priya's testing” for Priya Patel/.test(t), "it's created");
check(/priya@new\.test/.test(t) && /priya-test-pass-123/.test(t), "the invite shows her email and password to hand over");
await jamie.page.reload({ waitUntil: "networkidle" });
const listed = await jamie.page.locator("main").innerText();
check(/Workspaces you've set up/.test(listed) && /Priya's testing/.test(listed) && /priya@new\.test/.test(listed), "it appears in his 'set up' list (name and owner)");
let jm = await menu(jamie.page);
check(!jm.names.includes("Priya's testing"), "Jamie is NOT a member — it's not in his workspace list", jm.names.join(", "));
const acmeAfter = (await exp(jamie)).counts;
check(acmeAfter.workspaceMembers === acmeBefore.workspaceMembers && acmeAfter.users === acmeBefore.users, "Acme's team is unchanged (Priya wasn't added there)");

console.log("\nPriya signs in:");
const priya = await session("Priya Patel");
let pm = await menu(priya.page);
check(pm.names.length === 1 && pm.names[0] === "Priya's testing", "she sees only her own workspace", pm.names.join(", "));
check(!pm.canCreate, "she can't create more workspaces");
const pThemes = await priya.page.goto(base + "/themes", { waitUntil: "networkidle" }).then(() => priya.page.locator("body").innerText());
check(/0 themes/.test(pThemes) && !/Acme|ZEBRA|Slow dashboard/.test(pThemes), "it starts empty, nothing from anyone else");
const pSet = await priya.page.goto(base + "/settings", { waitUntil: "networkidle" }).then(() => priya.page.locator("main").innerText());
check(/Product Owner/.test(pSet) && !/Jamie Lee/.test(pSet), "she's its owner, and Jamie isn't in her team");
check(!pSet.includes(PROVISION), "she doesn't get the platform setup form");
check(/This is your only workspace/.test(pSet), "and can't delete her only workspace");
await fetch(base + "/api/ingest", { method: "POST", headers: { "Content-Type": "application/json", Cookie: await priya.cookie() }, body: JSON.stringify({ paste: "PRIYA-PRIVATE feedback " + Date.now() }) });
const pData = await exp(priya);
check(pData.counts.feedbackItems === 1 && pData.data.workspaces[0].name === "Priya's testing", "her upload lands in her workspace");
check(!JSON.stringify(await exp(jamie)).includes("PRIYA-PRIVATE"), "Jamie's backup doesn't contain it");
for (const p of ["/dashboard", "/register", "/themes", "/settings"]) {
  const j = await jamie.page.goto(base + p, { waitUntil: "networkidle" }).then(() => jamie.page.content());
  if (j.includes("PRIYA-PRIVATE")) check(false, `Jamie sees Priya's feedback on ${p}`);
}
check(true, "Jamie sees none of Priya's feedback on any page");

console.log("\nPriya adds her own teammate:");
await priya.page.goto(base + "/settings", { waitUntil: "networkidle" });
const addForm = priya.page.locator("form", { has: priya.page.getByRole("button", { name: "Add person" }) });
await addForm.locator('input[name="name"]').fill("Sam Rivers");
await addForm.locator('input[name="email"]').fill("sam@new.test");
await addForm.locator('input[name="password"]').fill("sam-test-pass-123");
await addForm.getByRole("button", { name: "Add person" }).click();
await priya.page.waitForTimeout(2000);
check((await priya.page.locator("text=/Sam Rivers can now sign in/").count()) > 0, "she can add Sam");
const sam = await session("Sam Rivers");
const sm = await menu(sam.page);
check(sm.names.length === 1 && sm.names[0] === "Priya's testing", "Sam sees only Priya's workspace", sm.names.join(", "));
const sThemes = await sam.page.goto(base + "/register?tab=review", { waitUntil: "networkidle" }).then(() => sam.page.locator("body").innerText());
check(/PRIYA-PRIVATE/.test(sThemes), "and sees her feedback (he's a member)");
const sSet = await sam.page.goto(base + "/settings", { waitUntil: "networkidle" }).then(() => sam.page.locator("main").innerText());
check(!/Clear the register|Delete this workspace|Workspace name/.test(sSet), "as a contributor he can't clear, delete or rename it");

console.log("\nSomeone who already has an account:");
t = await provision(jamie.page, { name: "Tess Tester", email: "tess@zebra.test", workspace: "Tess second space" });
check(/already had an account/.test(t), "Jamie can give Tess a second workspace without a new password");
await tess.page.goto(base + "/dashboard", { waitUntil: "networkidle" });
const tm = await menu(tess.page);
check(tm.names.includes("ZEBRA Space") && tm.names.includes("Tess second space"), "Tess now has both", tm.names.join(", "));
jm = await menu(jamie.page);
check(!jm.names.includes("Tess second space"), "and Jamie still isn't in it");

check(errors.length === 0, "no browser errors", errors.slice(0, 2).join(" | "));
await b.close();
console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
