/**
 * Verifies the "import the duplicate anyway" flow.
 *
 * Two behaviours matter and neither is obvious from the code:
 *  - it must import immediately, not dump you back on the form to press
 *    Extract a second time;
 *  - when a batch mixes new and duplicate files, forcing must re-import ONLY
 *    the duplicate. Re-sending the whole batch would duplicate the file that
 *    imported perfectly well the first time.
 *
 * Usage: node force-flow-test.mjs
 */
import { chromium } from "playwright";

const base = process.env.BASE || "http://localhost:4000";
const results = [];
const check = (n, ok, d = "") => {
  results.push([ok, n, d]);
  console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`);
};

const stamp = Date.now();
const row = (s) => `${s} — raised in the review on ${stamp}, needs attention soon.`;

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("dialog", (d) => d.accept()); // accept the confirmation

await page.goto(base + "/login", { waitUntil: "networkidle" });
await page.click("text=Jamie Lee");
await page.waitForURL("**/dashboard", { timeout: 15000 });

async function uploadCsv(name, rows) {
  await page.goto(base + "/ingest", { waitUntil: "networkidle" });
  const csv = "Feedback,Customer\n" + rows.map((r) => `"${r}","Acme"`).join("\n");
  await page.setInputFiles('input[type="file"]', {
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: /Extract|Save|Ingest/i }).last().click();
  await page.waitForTimeout(3500);
}

function countFrom(text) {
  return Number(text.match(/(\d+)\s+feedback item/)?.[1] ?? -1);
}

// --- first import ---------------------------------------------------------
console.log("\nSetup:");
await uploadCsv("alpha.csv", [row("Board filtering feels frozen")]);
check("first import succeeds", countFrom(await page.locator("main").innerText()) === 1);

// --- duplicate is detected ------------------------------------------------
console.log("\nDuplicate detected:");
await uploadCsv("alpha.csv", [row("Board filtering feels frozen")]);
let body = await page.locator("main").innerText();
check("nothing imported", countFrom(body) === 0, `count=${countFrom(body)}`);
check("duplicate is announced", /already imported/i.test(body));
const forceBtn = page.getByRole("button", { name: /Import the duplicate/i });
check("the override button is offered", await forceBtn.isVisible());

// --- the flow itself ------------------------------------------------------
console.log("\nOverride imports immediately:");
await forceBtn.click();
await page.waitForTimeout(4000);
body = await page.locator("main").innerText();
check(
  "it does NOT return to the upload form",
  !/Drop files here or click to browse/.test(body),
  "stayed on the result screen",
);
check("it imported without a second Extract click", countFrom(body) === 1, `count=${countFrom(body)}`);

// --- mixed batch: force must not duplicate the healthy file ---------------
console.log("\nMixed batch (1 new + 1 duplicate):");
await page.goto(base + "/ingest", { waitUntil: "networkidle" });
const dupeRow = row("PDF export loses all colour");
const newRow = row("Search ignores hyphenated codes");
// seed the duplicate first
await uploadCsv("dupe.csv", [dupeRow]);
// now upload both together
await page.goto(base + "/ingest", { waitUntil: "networkidle" });
for (const [name, rows] of [
  ["dupe.csv", [dupeRow]],
  ["brandnew.csv", [newRow]],
]) {
  const csv = "Feedback,Customer\n" + rows.map((r) => `"${r}","Acme"`).join("\n");
  await page.setInputFiles('input[type="file"]', [
    { name, mimeType: "text/csv", buffer: Buffer.from(csv) },
  ]);
}
// setInputFiles replaces, so send both in one call instead
await page.goto(base + "/ingest", { waitUntil: "networkidle" });
await page.setInputFiles('input[type="file"]', [
  { name: "dupe.csv", mimeType: "text/csv", buffer: Buffer.from("Feedback,Customer\n" + `"${dupeRow}","Acme"`) },
  { name: "brandnew.csv", mimeType: "text/csv", buffer: Buffer.from("Feedback,Customer\n" + `"${newRow}","Acme"`) },
]);
await page.getByRole("button", { name: /Extract|Save|Ingest/i }).last().click();
await page.waitForTimeout(3500);
body = await page.locator("main").innerText();
check("only the new file imports", countFrom(body) === 1, `count=${countFrom(body)}`);

const before = countFrom(body);
await page.getByRole("button", { name: /Import the duplicate/i }).click();
await page.waitForTimeout(4000);
body = await page.locator("main").innerText();
check(
  "forcing re-imports ONLY the duplicate, not the healthy file",
  countFrom(body) === 1,
  `count=${countFrom(body)} (must be 1, not 2)`,
);
void before;

await browser.close();
const failed = results.filter(([ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
