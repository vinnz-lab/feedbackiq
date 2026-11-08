import { expect, test } from "@playwright/test";

// Permissions check: the seeded viewer "Vera Viewer" can see the review queue but must not
// be able to approve, discard or run AI. Local only: needs ALLOW_DEV_LOGIN=true. Skips on GitHub.
test("a viewer can see the review queue but cannot approve or discard", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  const picker = page.getByRole("heading", { name: "Choose a profile" });
  const showsPicker = await picker.isVisible().catch(() => false);
  test.skip(!showsPicker, "Dev profile picker is off (ALLOW_DEV_LOGIN not set)");

  // Sign in as the viewer. Each profile is its own form containing the user's name.
  const viewerForm = page.locator("form", { hasText: "Vera Viewer" });
  test.skip(
    (await viewerForm.count()) === 0,
    "Vera Viewer is not in the local sample data (run npx tsx scripts/db-setup.ts)",
  );
  await viewerForm.locator("button[type=submit]").click();
  await expect(page).not.toHaveURL(/\/login/);

  await page.goto("/register?tab=review");

  // The page explains the read-only state.
  await expect(page.getByText("View only")).toBeVisible();

  // None of the editing buttons should be offered.
  await expect(page.getByRole("button", { name: "✓ Approve" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "🗑 Discard" })).toHaveCount(0);
});
