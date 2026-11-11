import { expect, test } from "@playwright/test";

// Public pages that need no sign-in, so they run in CI without secrets.

test("privacy page explains how data is handled", async ({ page }) => {
  const response = await page.goto("/privacy");
  expect(response!.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Privacy", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How AI is used" })).toBeVisible();
});

test("forgot-password page offers a reset form", async ({ page }) => {
  const response = await page.goto("/forgot-password");
  expect(response!.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();
});

test("forgot-password page links back to sign in", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByRole("link", { name: "Back to sign in" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("unknown address returns a 404 page", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response!.status()).toBe(404);
});
