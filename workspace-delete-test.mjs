/**
 * Deleting a workspace — every guard, and that nothing else is touched.
 *
 *   PGLITE_DIR=./.pglite-iso npx tsx scripts/db-setup.ts
 *   PGLITE_DIR=./.pglite-iso npx tsx scripts/seed-second-workspace.ts
 *   PGLITE_DIR=./.pglite-iso ALLOW_DEV_LOGIN=true PLATFORM_ADMIN_EMAILS=jamie@acme.test npx next start -p 4000 &
 *   node workspace-delete-test.mjs
 */
import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:4000";
let fail = 0;
const check = (ok, n, d = "") => { console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };
const b = await chromium.launch();
const errors = [];
async function session(name) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.click(`text=${name}`);
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  return { ctx, page, cookie: async () => (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ") };
}
const exp = async (s) => JSON.parse(await (await fetch(base + "/api/export", { headers: { Cookie: await s.cookie() } })).text());
const current = async (page) => (await page.getByRole("button", { name: "Switch workspace" }).innerText()).split("\n")[0].trim();
const menu = async (page) => {
  await page.getByRole("button", { name: "Switch workspace" }).click();
  const names = (await page.getByRole("menuitem").allInnerTexts()).map((s) => s.trim());
  await page.keyboard.press("Escape");
  return names;
};
const deleteBtn = (page) => page.getByRole("button", { name: "Delete this workspace" });

console.log("Your last workspace can't be deleted:");
const tess = await session("Tess Tester");
await tess.page.goto(base + "/settings", { waitUntil: "networkidle" });
check((await tess.page.locator("text=This is your only workspace").count()) > 0 && (await deleteBtn(tess.page).count()) === 0, "Tess (one workspace) is told it can't be deleted, and has no delete button");
const tessBefore = (await exp(tess)).counts;

console.log("\nNon-owners can't delete:");
const tom = await session("Tom Becker");
await tom.page.goto(base + "/settings", { waitUntil: "networkidle" });
check((await tom.page.locator("text=Delete this workspace").count()) === 0, "Tom (contributor) doesn't see the delete section");

console.log("\nJamie deletes a workspace that has data and another member:");
const jamie = await session("Jamie Lee");
const acmeBefore = (await exp(jamie)).counts;
// Create "Throwaway", put data in it, add Tom so the 'others lose access' warning is exercised.
await jamie.page.getByRole("button", { name: "Switch workspace" }).click();
await jamie.page.getByRole("button", { name: "New workspace" }).click();
await jamie.page.getByLabel("New workspace name").fill("Throwaway");
await jamie.page.getByRole("button", { name: "Create" }).click();
await jamie.page.getByRole("button", { name: "Switch workspace" }).filter({ hasText: "Throwaway" }).waitFor({ timeout: 15000 });
for (const t of ["THROWAWAY one", "THROWAWAY two"]) {
  await fetch(base + "/api/ingest", { method: "POST", headers: { "Content-Type": "application/json", Cookie: await jamie.cookie() }, body: JSON.stringify({ paste: `${t} ${Date.now()}` }) });
}
await jamie.page.goto(base + "/settings", { waitUntil: "networkidle" });
// Scope to the "Add person" form: the Workspace section also has a name field.
const addForm = jamie.page.locator("form", { has: jamie.page.getByRole("button", { name: "Add person" }) });
await addForm.locator('input[name="name"]').fill("Tom Becker");
await addForm.locator('input[name="email"]').fill("tom@acme.test");
await addForm.locator('input[name="password"]').fill("irrelevant-here-123");
await addForm.getByRole("button", { name: "Add person" }).click();
await jamie.page.waitForTimeout(1500);
await jamie.page.reload({ waitUntil: "networkidle" });
const throwData = await exp(jamie);
check(throwData.data.workspaces[0].name === "Throwaway" && throwData.counts.feedbackItems === 2 && throwData.counts.workspaceMembers === 2, "Throwaway has 2 items and 2 members", JSON.stringify({ i: throwData.counts.feedbackItems, m: throwData.counts.workspaceMembers }));
check((await jamie.page.locator("text=/will lose access: Tom Becker/").count()) > 0, "the warning names who will lose access");
check(await deleteBtn(jamie.page).isDisabled(), "the button starts disabled");

// Wrong name: stays disabled
await jamie.page.getByLabel("I have downloaded a backup of this workspace").check();
await jamie.page.getByLabel("Type the workspace name to confirm").fill("throwaway");
check(await deleteBtn(jamie.page).isDisabled(), "typing the name in the wrong case keeps it disabled");
await jamie.page.getByLabel("Type the workspace name to confirm").fill("Acme App");
check(await deleteBtn(jamie.page).isDisabled(), "typing ANOTHER workspace's name keeps it disabled");

// Bypass the browser's check: force the button on and submit a wrong name.
await jamie.page.getByLabel("Type the workspace name to confirm").fill("Acme App");
await deleteBtn(jamie.page).evaluate((el) => { el.disabled = false; });
await deleteBtn(jamie.page).click();
await jamie.page.waitForTimeout(2000);
check((await jamie.page.locator("text=/Type the workspace name exactly/").count()) > 0, "the SERVER refuses a wrong name even if the browser check is bypassed");
check((await current(jamie.page)) === "Throwaway", "…and nothing was deleted");

// Right name: deletes, lands in Acme
await jamie.page.getByLabel("Type the workspace name to confirm").fill("Throwaway");
await deleteBtn(jamie.page).click();
await jamie.page.getByRole("button", { name: "Switch workspace" }).filter({ hasText: "Acme App" }).waitFor({ timeout: 15000 });
check((await current(jamie.page)) === "Acme App", "afterwards he lands in Acme App");
const names = await menu(jamie.page);
check(!names.includes("Throwaway"), "Throwaway is gone from his list", names.join(", "));

console.log("\nNothing else was touched:");
const acmeAfterData = await exp(jamie);
const acmeAfter = acmeAfterData.counts;
for (const k of ["feedbackItems", "themes", "sources", "enhancements", "workspaceMembers"]) {
  check(acmeAfter[k] === acmeBefore[k], `Acme ${k} unchanged`, `${acmeBefore[k]} → ${acmeAfter[k]}`);
}
check(acmeAfterData.data.auditEvents.some((a) => a.action === "workspace.deleted" && a.after?.name === "Throwaway" && a.after?.feedbackItems === 2), "the deletion is recorded in Acme's log, with what was removed");
const tessAfter = (await exp(tess)).counts;
check(JSON.stringify(tessAfter.feedbackItems) === JSON.stringify(tessBefore.feedbackItems) && tessAfter.themes === tessBefore.themes, "Tess's workspace unchanged");
// Tom lost Throwaway but kept Acme
await tom.page.goto(base + "/dashboard", { waitUntil: "networkidle" });
const tomNames = await menu(tom.page);
check(tomNames.length === 1 && tomNames[0] === "Acme App", "Tom lost access to Throwaway but still has Acme", tomNames.join(", "));

console.log("\nJamie can't delete his last one either:");
// Acme is now his only workspace.
await jamie.page.goto(base + "/settings", { waitUntil: "networkidle" });
check((await jamie.page.locator("text=This is your only workspace").count()) > 0 && (await deleteBtn(jamie.page).count()) === 0, "with only Acme left, deleting is blocked");

check(errors.length === 0, "no browser errors", errors.slice(0, 2).join(" | "));
await b.close();
console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
