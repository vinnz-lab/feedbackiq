/**
 * Verifies bulk selection in the review queue.
 *
 * Motivated by real use: "Select all" existed but was a small grey text link,
 * so 40 duplicate rows got discarded one at a time. Discoverability and range
 * selection are the point, so both are asserted here.
 *
 * Usage: node select-test.mjs
 */
import { chromium } from "playwright";

const base = process.env.BASE || "http://localhost:4000";
const results = [];
const check = (n, ok, d = "") => {
  results.push([ok, n, d]);
  console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`);
};

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(base + "/login", { waitUntil: "networkidle" });
await page.click("text=Jamie Lee");
await page.waitForURL("**/dashboard", { timeout: 15000 });
await page.goto(base + "/register?tab=review", { waitUntil: "networkidle" });

const cardBoxes = page.locator('input[aria-label="Select item"]');
const total = await cardBoxes.count();
console.log(`\nReview queue has ${total} items`);

// --- discoverability -----------------------------------------------------
console.log("\nDiscoverability:");
const selectAll = page.getByText(/Select all \d+/);
check("select-all names how many it will select", await selectAll.isVisible(), await selectAll.textContent());
check(
  "it is a real checkbox, not a text link",
  await page.locator('input[type="checkbox"]').first().isVisible(),
);
check("the shift-range hint is shown", await page.getByText(/hold.*Shift/i).isVisible());

// --- select all ----------------------------------------------------------
console.log("\nSelect all:");
await selectAll.click();
await page.waitForTimeout(300);
const selectedAfterAll = await page.locator('input[aria-label="Select item"]:checked').count();
check("selects every item", selectedAfterAll === total, `${selectedAfterAll}/${total}`);
check("action bar shows the count", await page.getByText(`${total} selected`).first().isVisible());
check(
  "bulk discard is offered",
  await page.getByRole("button", { name: new RegExp(`Discard ${total}`) }).isVisible(),
);

// toggling again clears
await page.getByText(/Clear selection/).click();
await page.waitForTimeout(300);
check(
  "toggling clears the selection",
  (await page.locator('input[aria-label="Select item"]:checked').count()) === 0,
);

// --- shift range ---------------------------------------------------------
console.log("\nShift-click range:");
if (total >= 3) {
  await cardBoxes.nth(0).click();
  await page.waitForTimeout(150);
  await cardBoxes.nth(2).click({ modifiers: ["Shift"] });
  await page.waitForTimeout(300);
  const ranged = await page.locator('input[aria-label="Select item"]:checked').count();
  check("shift-click selects the whole run", ranged === 3, `${ranged} selected (expected 3)`);
} else {
  check("shift-click selects the whole run", false, "need 3+ items to test");
}

// --- it actually removes them -------------------------------------------
console.log("\nBulk discard works:");
const before = total;
await page.getByText(/Select all \d+/).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Discard \d+/ }).click();
await page.waitForTimeout(4000);
await page.reload({ waitUntil: "networkidle" });
const after = await page.locator('input[aria-label="Select item"]').count();
check("discarding empties the queue", after === 0, `${before} → ${after}`);

await browser.close();
const failed = results.filter(([ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
