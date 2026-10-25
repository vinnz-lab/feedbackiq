/**
 * Browser check for the roadmap: editable scores persist, out-of-range values
 * are clamped, re-estimate reports what it did, and theme cards offer the
 * roadmap button.
 *
 *   PGLITE_DIR=./.pglite-test npx tsx scripts/db-setup.ts
 *   PGLITE_DIR=./.pglite-test ALLOW_DEV_LOGIN=true npx next start -p 4000 &
 *   node roadmap-test.mjs
 */
import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:4000";
let fail = 0;
const check = (ok, n, d = "") => { console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(base + "/login", { waitUntil: "networkidle" });
await page.click("text=Jamie Lee");
await page.waitForURL("**/dashboard");
await page.goto(base + "/roadmap", { waitUntil: "networkidle" });

const n = await page.locator("tbody tr").count();
check(n > 0, "roadmap lists items", `${n} rows`);
check((await page.locator('input[aria-label="Benefit"]').count()) === n, "every row has an editable Benefit box");

// Rows re-sort after an edit, so always find the row again by its title.
const title = (await page.locator("tbody tr").first().locator("td").first().innerText()).replace(/^\s*\d+\s*/, "").trim();
const rowOf = () => page.locator("tbody tr", { hasText: title }).first();

for (const [field, input, expected] of [
  ["Benefit", "9", "9"],
  ["Effort", "99", "10"],
  ["Effort", "0", "1"],
  ["Effort", "4.6", "5"],
]) {
  const box = rowOf().locator(`input[aria-label="${field}"]`);
  await box.fill(input); await box.blur();
  await page.waitForTimeout(1300);
  await page.reload({ waitUntil: "networkidle" });
  const v = await rowOf().locator(`input[aria-label="${field}"]`).inputValue();
  check(v === expected, `${field} "${input}" saved as ${expected}`, `got ${v}`);
}

await rowOf().locator("button", { hasText: "Re-estimate" }).click();
await page.waitForTimeout(1500);
const note = await page.locator("text=/Re-estimated|isn't linked/").first().innerText().catch(() => "");
check(!!note, "re-estimate says what it did", note.slice(0, 80));

await page.goto(base + "/themes", { waitUntil: "networkidle" });
check((await page.locator("text=/Add to roadmap|On roadmap/").count()) > 0, "theme cards show the roadmap button or badge");
await b.close();
console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
