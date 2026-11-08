import { expect, test } from "@playwright/test";

test("login page shows the sign-in form", async ({ page }) => {
  const response = await page.goto("/login");
  expect(response, "no response from /login").not.toBeNull();
  expect(response!.status()).toBeLessThan(500);

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
