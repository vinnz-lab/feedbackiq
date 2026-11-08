import { expect, test } from "@playwright/test";

// Signs in with a development profile. Only works when the app runs locally with
// ALLOW_DEV_LOGIN=true. On GitHub (no picker) the test is skipped, not failed.
test("choosing a dev profile signs in and leaves the login page", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  const picker = page.getByRole("heading", { name: "Choose a profile" });
  const showsPicker = await picker.isVisible().catch(() => false);
  test.skip(!showsPicker, "Dev profile picker is off (ALLOW_DEV_LOGIN not set)");

  // Each profile is a submit button inside its own form.
  await page.locator("form button[type=submit]").first().click();

  await expect(page).not.toHaveURL(/\/login/);
});
