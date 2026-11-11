import { expect, test } from "@playwright/test";

test("home page loads without a server error", async ({ page }) => {
  const response = await page.goto("/");
  expect(response, "no response from /").not.toBeNull();
  expect(response!.status()).toBeLessThan(500);
  await expect(page.locator("body")).toBeVisible();
});
