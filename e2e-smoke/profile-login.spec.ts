import { expect, test } from "@playwright/test";

// These run only locally with ALLOW_DEV_LOGIN=true. On GitHub (no picker) they are skipped, not failed.

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

test("signing out returns you to the login page", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  const picker = page.getByRole("heading", { name: "Choose a profile" });
  const showsPicker = await picker.isVisible().catch(() => false);
  test.skip(!showsPicker, "Dev profile picker is off (ALLOW_DEV_LOGIN not set)");

  await page.locator("form button[type=submit]").first().click();
  await expect(page).not.toHaveURL(/\/login/);

  // The avatar is the round button in the top bar; it opens the account menu.
  await page.locator("header button.rounded-full").click();
  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/login/);
});
