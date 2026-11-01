/**
 * Owner-set temporary passwords, end to end against the fake Supabase Auth.
 *   FAKE_USERS="tom@acme.test:tom-pass-12345,tess@zebra.test:tess-pass-12345" node scripts/fake-supabase-auth.mjs 54321 &
 *   (Supabase-mode build) PGLITE_DIR=./.pglite-iso SUPABASE_SERVICE_ROLE_KEY=test-secret PLATFORM_ADMIN_EMAILS=jamie@acme.test npx next start -p 4000 &
 *   node admin-reset-test.mjs
 */
import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:4000";
const auth = process.env.AUTH || "http://127.0.0.1:54321";
let fail = 0;
const check = (ok, n, d = "") => { console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };
const b = await chromium.launch();
const errors = [];
const meta = async (email) => (await (await fetch(`${auth}/__meta?email=${email}`)).json()).app_metadata;
async function signIn(email, password) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1300 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${email}: ${e.message}`));
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForTimeout(2500);
  return { ctx, page };
}
async function resetFor(page, label) {
  await page.getByRole("button", { name: label }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.waitForTimeout(2500);
  const text = await page.locator("pre").filter({ hasText: "Temporary password" }).first().innerText().catch(() => "");
  return text.match(/Temporary password: (\S+)/)?.[1] ?? null;
}
async function addPerson(page, name, email) {
  await page.goto(base + "/settings", { waitUntil: "networkidle" });
  const f = page.locator("form", { has: page.getByRole("button", { name: "Add person" }) });
  await f.locator('input[name="name"]').fill(name);
  await f.locator('input[name="email"]').fill(email);
  await f.locator('input[name="password"]').fill("first-pass-12345");
  await f.getByRole("button", { name: "Add person" }).click();
  await page.waitForTimeout(2000);
}

console.log("Jamie resets Tom's password:");
const jamie = await signIn("jamie@acme.test", "old-password-1");
await jamie.page.goto(base + "/settings", { waitUntil: "networkidle" });
check((await jamie.page.getByRole("button", { name: "Reset password for Jamie Lee" }).count()) === 0, "there's no reset button on his own row");
const temp = await resetFor(jamie.page, "Reset password for Tom Becker");
check(Boolean(temp) && temp.length === 16, "a temporary password is shown once, ready to send", temp ? "(16 characters)" : "none");
check((await meta("tom@acme.test"))?.must_change_password === true, "Tom's account is marked 'must choose a new password'");
const old = await signIn("tom@acme.test", "tom-pass-12345");
check(!old.page.url().endsWith("/dashboard") && !old.page.url().endsWith("/choose-password"), "Tom's old password no longer works");
await old.ctx.close();

console.log("\nTom signs in with it:");
const tom = await signIn("tom@acme.test", temp);
check(tom.page.url().endsWith("/choose-password"), "he's sent straight to 'Choose your own password'", tom.page.url());
await tom.page.goto(base + "/settings", { waitUntil: "networkidle" });
check(tom.page.url().endsWith("/choose-password"), "…and can't get round it by opening another page");
const choose = async (a, b2) => {
  await tom.page.getByLabel("New password", { exact: true }).fill(a);
  await tom.page.getByLabel("Confirm new password").fill(b2);
  await tom.page.getByRole("button", { name: "Save and continue" }).click();
  await tom.page.waitForTimeout(2500);
};
await choose(temp, temp);
check(/different from the temporary one/.test(await tom.page.locator("body").innerText()), "he can't keep the temporary password");
await choose("toms-own-pass-1", "toms-own-pass-2");
check(/don't match/.test(await tom.page.locator("body").innerText()), "mismatched passwords are refused");
await choose("toms-own-pass-1", "toms-own-pass-1");
check(tom.page.url().endsWith("/dashboard"), "choosing his own lets him in", tom.page.url());
check((await meta("tom@acme.test"))?.must_change_password === false, "the 'must change' mark is cleared");
await tom.page.goto(base + "/settings", { waitUntil: "networkidle" });
check(tom.page.url().endsWith("/settings"), "he can now use the app normally");
await tom.ctx.close();
const t2 = await signIn("tom@acme.test", temp);
check(!t2.page.url().endsWith("/dashboard") && !t2.page.url().endsWith("/choose-password"), "the temporary password stops working");
await t2.ctx.close();
const t3 = await signIn("tom@acme.test", "toms-own-pass-1");
check(t3.page.url().endsWith("/dashboard"), "his own password works");
await t3.ctx.close();

console.log("\nA tester who owns her own workspace:");
const tess = await signIn("tess@zebra.test", "tess-pass-12345");
await addPerson(tess.page, "Tom Becker", "tom@acme.test"); // Tom is now in Acme AND ZEBRA
await addPerson(tess.page, "Nina New", "nina@zebra.test");  // Nina is only in ZEBRA
await tess.page.goto(base + "/settings", { waitUntil: "networkidle" });
check((await tess.page.getByRole("button", { name: "Reset password for Tom Becker" }).count()) === 0, "she can NOT reset Tom (he's also in Jamie's workspace — the takeover route)");
const blocked = await tess.page.locator("span[title*='another workspace']").count();
check(blocked >= 1, "…and the reason is shown on hover");
const ninaTemp = await resetFor(tess.page, "Reset password for Nina New");
check(Boolean(ninaTemp), "she CAN reset Nina, who's only in her workspace");

console.log("\nThe platform owner can still help with Tom:");
await jamie.page.goto(base + "/settings", { waitUntil: "networkidle" });
check((await jamie.page.getByRole("button", { name: "Reset password for Tom Becker" }).count()) === 1, "Jamie can reset Tom even though he's in two workspaces");

console.log("\nA tester who forgot her password, from your 'set up' list:");
await jamie.page.getByLabel("Their name").fill("Priya Patel");
await jamie.page.getByLabel("Their email").fill("priya@new.test");
await jamie.page.getByLabel("Their workspace name").fill("Priya's testing");
await jamie.page.getByLabel("Their password").fill("priya-first-123");
await jamie.page.getByRole("button", { name: "Create their workspace" }).click();
await jamie.page.waitForTimeout(2500);
await jamie.page.reload({ waitUntil: "networkidle" });
const priyaTemp = await resetFor(jamie.page, "Reset password for priya@new.test");
check(Boolean(priyaTemp), "Jamie resets Priya's password without opening her workspace");
const priya = await signIn("priya@new.test", priyaTemp ?? "x");
check(priya.page.url().endsWith("/choose-password"), "Priya is asked to choose her own");

check(errors.length === 0, "no browser errors", errors.slice(0, 2).join(" | "));
await b.close();
console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
