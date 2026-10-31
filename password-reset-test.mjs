/**
 * Forgot password + change password, end to end, against a fake Supabase Auth.
 * Needs a build made in Supabase mode (NEXT_PUBLIC_* are baked in at build):
 *
 *   node scripts/fake-supabase-auth.mjs 54321 &
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test npx next build
 *   PGLITE_DIR=./.pglite-test SUPABASE_SERVICE_ROLE_KEY=test-secret npx next start -p 4000 &
 *   node password-reset-test.mjs
 */
import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:4000";
const auth = process.env.AUTH || "http://127.0.0.1:54321";
let fail = 0;
const check = (ok, n, d = "") => { console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };
const b = await chromium.launch();
const errors = [];
const fresh = async () => { const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } }); const page = await ctx.newPage(); page.on("pageerror", (e) => errors.push(e.message)); return { ctx, page }; };
const pw = async () => (await (await fetch(`${auth}/__password?email=jamie@acme.test`)).json()).password;
const lastLink = async () => (await (await fetch(`${auth}/__last_link`)).json()).link;
async function signIn(page, password) {
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill("jamie@acme.test");
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForTimeout(2500);
  return page.url();
}

console.log("Sign-in page:");
let s = await fresh();
await s.page.goto(base + "/login", { waitUntil: "networkidle" });
check((await s.page.getByRole("link", { name: "Forgot password?" }).count()) === 1, "has a 'Forgot password?' link");
check((await signIn(s.page, "old-password-1")).endsWith("/dashboard"), "signs in with the current password");
await s.ctx.close();

console.log("\nAsking for a reset link:");
s = await fresh();
await s.page.goto(base + "/forgot-password", { waitUntil: "networkidle" });
await s.page.getByLabel("Email").fill("nobody-here@nowhere.test");
await s.page.getByRole("button", { name: "Send reset link" }).click();
await s.page.waitForTimeout(1500);
const unknown = await s.page.locator("body").innerText();
check(/If that email has a FeedbackIQ account/.test(unknown), "an unknown email gets the SAME answer (doesn't reveal who has an account)");
check((await lastLink()) === null, "…and no link was sent");
await s.page.goto(base + "/forgot-password", { waitUntil: "networkidle" });
await s.page.getByLabel("Email").fill("Jamie@Acme.test");
await s.page.getByRole("button", { name: "Send reset link" }).click();
await s.page.waitForTimeout(1500);
check(/If that email has a FeedbackIQ account/.test(await s.page.locator("body").innerText()), "a real email gets the same message");
const link = await lastLink();
check(Boolean(link) && /token_hash=.*type=recovery/.test(link), "a reset link was 'emailed' (capitals in the email didn't matter)");

console.log("\nAttacks that must fail:");
const other = await fresh();
await other.page.goto(base + "/reset-password", { waitUntil: "networkidle" });
check(/This link has expired/.test(await other.page.locator("body").innerText()) && (await other.page.getByLabel("New password").count()) === 0, "opening /reset-password directly gives no form");
// Signed in normally, then trying to skip the current-password check:
check((await signIn(other.page, "old-password-1")).endsWith("/dashboard"), "(signed in normally in another browser)");
await other.page.goto(base + "/reset-password", { waitUntil: "networkidle" });
check((await other.page.getByLabel("New password").count()) === 0, "a normal signed-in session can't use the reset page to skip the current password");
await other.ctx.addCookies([{ name: "fiq_recovery", value: "6f9619ff-8b86-4d11-b42d-00c04fc964ff.9999999999.deadbeef", url: base }]);
await other.page.goto(base + "/reset-password", { waitUntil: "networkidle" });
check((await other.page.getByLabel("New password").count()) === 0, "a forged proof cookie is rejected");
await other.page.goto(base + "/auth/confirm?token_hash=made-up&type=recovery&next=/reset-password", { waitUntil: "networkidle" });
check(/\/forgot-password\?error=link/.test(other.page.url()) && /expired or was already used/.test(await other.page.locator("body").innerText()), "a made-up link is refused with a clear message");
await other.page.goto(base + "/auth/confirm?token_hash=made-up&type=recovery&next=https://evil.example", { waitUntil: "networkidle" });
check(other.page.url().startsWith(base), "the link can't redirect anywhere outside the app", other.page.url());

console.log("\nUsing the real link:");
await s.page.goto(link, { waitUntil: "networkidle" });
check(s.page.url().endsWith("/reset-password"), "the link opens the reset page", s.page.url());
check(/Choose a new password/.test(await s.page.locator("body").innerText()) && /jamie@acme\.test/.test(await s.page.locator("body").innerText()), "it shows the form, for the right account");
await s.page.getByLabel("New password", { exact: true }).fill("short");
await s.page.getByLabel("Confirm new password").fill("short");
await s.page.getByRole("button", { name: "Set new password" }).evaluate((el) => el.closest("form").noValidate = true);
await s.page.getByRole("button", { name: "Set new password" }).click();
await s.page.waitForTimeout(1500);
check(/at least 10 characters/.test(await s.page.locator("body").innerText()) && (await pw()) === "old-password-1", "a too-short password is refused, nothing changed");
await s.page.getByLabel("New password", { exact: true }).fill("brand-new-password-1");
await s.page.getByLabel("Confirm new password").fill("brand-new-password-2");
await s.page.getByRole("button", { name: "Set new password" }).click();
await s.page.waitForTimeout(1500);
check(/don't match/.test(await s.page.locator("body").innerText()) && (await pw()) === "old-password-1", "mismatched passwords are refused, nothing changed");
await s.page.getByLabel("New password", { exact: true }).fill("brand-new-password-1");
await s.page.getByLabel("Confirm new password").fill("brand-new-password-1");
await s.page.getByRole("button", { name: "Set new password" }).click();
await s.page.waitForURL("**/dashboard", { timeout: 15000 }).catch(() => {});
check(s.page.url().endsWith("/dashboard"), "setting it lands on the dashboard, signed in");
check((await pw()) === "brand-new-password-1", "the password really changed");
await s.page.goto(base + "/reset-password", { waitUntil: "networkidle" });
check((await s.page.getByLabel("New password").count()) === 0, "the proof is used up — the reset page can't be used again");
await s.page.goto(link, { waitUntil: "networkidle" });
check(/error=link/.test(s.page.url()), "the same emailed link can't be used twice");
await s.ctx.close();

console.log("\nSigning in afterwards:");
s = await fresh();
check(!(await signIn(s.page, "old-password-1")).endsWith("/dashboard"), "the OLD password no longer works");
check((await signIn(s.page, "brand-new-password-1")).endsWith("/dashboard"), "the NEW password works");

console.log("\nChanging it from Settings:");
await s.page.goto(base + "/settings", { waitUntil: "networkidle" });
await s.page.getByLabel("Current password").fill("wrong-password-9");
await s.page.getByLabel("New password", { exact: true }).fill("settings-pass-123");
await s.page.getByLabel("Confirm new password").fill("settings-pass-123");
await s.page.getByRole("button", { name: "Change password" }).click();
await s.page.waitForTimeout(1500);
check(/current password isn't right/.test(await s.page.locator("main").innerText()) && (await pw()) === "brand-new-password-1", "wrong current password refused, nothing changed");
await s.page.getByLabel("Current password").fill("brand-new-password-1");
await s.page.getByLabel("New password", { exact: true }).fill("settings-pass-123");
await s.page.getByLabel("Confirm new password").fill("settings-pass-123");
await s.page.getByRole("button", { name: "Change password" }).click();
await s.page.waitForTimeout(2000);
check(/Password changed/.test(await s.page.locator("main").innerText()) && (await pw()) === "settings-pass-123", "the right current password changes it");
await s.ctx.close();
s = await fresh();
check((await signIn(s.page, "settings-pass-123")).endsWith("/dashboard"), "and the new one signs in");

check(errors.length === 0, "no browser errors", errors.slice(0, 2).join(" | "));
await b.close();
console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
