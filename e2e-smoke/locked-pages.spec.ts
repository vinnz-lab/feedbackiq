import { expect, test } from "@playwright/test";

// Security check: a signed-out visitor who opens an app page must be sent to login.
// Needs no secrets, so it runs on GitHub.
test("app pages send signed-out visitors to the login page", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
