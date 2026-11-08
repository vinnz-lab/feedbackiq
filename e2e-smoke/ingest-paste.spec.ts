import { expect, test, type Page } from "@playwright/test";

// Core journey: paste feedback on the Ingest page and check it is saved.
// Local only: needs ALLOW_DEV_LOGIN=true and the local sample database. It skips on GitHub.

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

test("pasted feedback is extracted and saved", async ({ page }) => {
  // Extraction can call an AI service, so allow more time than the default.
  test.setTimeout(120_000);
  test.skip(!(await signInWithProfile(page)), "Dev profile picker is off (ALLOW_DEV_LOGIN not set)");

  await page.goto("/ingest");

  // A unique sentence, so repeated runs are not flagged as duplicates.
  const sentence = `Test feedback ${Date.now()}: the export button is hard to find.`;
  await page.getByPlaceholder("Paste an email, meeting notes, or any feedback text…").fill(sentence);
  await page.getByRole("button", { name: "✨ Extract & save" }).click();

  await expect(page.getByRole("heading", { name: "Ingested ✓" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Pasted content")).toBeVisible();
});
