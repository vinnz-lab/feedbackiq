import { expect, test, type Page } from "@playwright/test";

// Core journey, step 2: paste feedback, then approve it so it leaves Needs review.
// Local only: needs ALLOW_DEV_LOGIN=true and the local sample database. It skips on GitHub.
// Uses "Correct" then "Save & approve", because plain Approve needs AI analysis first.

// Signs in with the first dev profile. Returns false when the picker is not shown.
async function signInWithProfile(page: Page): Promise<boolean> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  const picker = page.getByRole("heading", { name: "Choose a profile" });
  if (!(await picker.isVisible().catch(() => false))) return false;
  await page.locator("form button[type=submit]").first().click();
  await expect(page).not.toHaveURL(/\/login/);
  return true;
}

test("approving a pasted item removes it from Needs review", async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!(await signInWithProfile(page)), "Dev profile picker is off (ALLOW_DEV_LOGIN not set)");

  // 1. Paste a unique piece of feedback.
  const sentence = `Approve test ${Date.now()}: the export button is hard to find.`;
  await page.goto("/ingest");
  await page.getByPlaceholder("Paste an email, meeting notes, or any feedback text…").fill(sentence);
  await page.getByRole("button", { name: "✨ Extract & save" }).click();
  await expect(page.getByRole("heading", { name: "Ingested ✓" })).toBeVisible({ timeout: 90_000 });

  // 2. It should be waiting in Needs review.
  await page.goto("/register?tab=review");
  const card = page.locator("div.p-4", { has: page.getByText(sentence) }).first();
  await expect(card).toBeVisible();

  // 3. Correct the details and approve.
  await card.getByRole("button", { name: "✎ Correct" }).click();
  await card.getByRole("button", { name: "Save & approve" }).click();

  // 4. It should no longer be waiting for review.
  await expect(page.getByText(sentence)).toHaveCount(0, { timeout: 15_000 });

  // 5. It should now be in the approved items.
  await page.goto("/register?tab=items");
  await expect(page.getByText(sentence).first()).toBeVisible();
});
