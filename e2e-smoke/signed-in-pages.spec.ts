import { expect, test, type Page } from "@playwright/test";

// These run only locally with ALLOW_DEV_LOGIN=true. On GitHub (no picker) they are skipped, not failed.

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

test("dashboard loads after signing in", async ({ page }) => {
  test.skip(!(await signInWithProfile(page)), "Dev profile picker is off (ALLOW_DEV_LOGIN not set)");
  const response = await page.goto("/dashboard");
  expect(response!.status()).toBeLessThan(500);
  await expect(page.getByText("Dashboard").first()).toBeVisible();
});

test("roadmap and settings pages load after signing in", async ({ page }) => {
  test.skip(!(await signInWithProfile(page)), "Dev profile picker is off (ALLOW_DEV_LOGIN not set)");
  for (const path of ["/roadmap", "/settings"]) {
    const response = await page.goto(path);
    expect(response!.status(), path).toBeLessThan(500);
    await expect(page, path).not.toHaveURL(/\/login/);
  }
});
