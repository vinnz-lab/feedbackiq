import { expect, test } from "@playwright/test";

// /login shows one of three screens depending on settings:
//   - "Sign in" form (Supabase configured)
//   - "Choose a profile" (development sign-in)
//   - "Sign-in isn't configured" (no settings)
// CI has no secrets, so it usually gets one of the last two. Accept any of them.
test("login page renders a sign-in screen", async ({ page }) => {
  const response = await page.goto("/login");
  expect(response, "no response from /login").not.toBeNull();
  expect(response!.status()).toBeLessThan(500);

  const heading = page.getByRole("heading").first();
  await expect(heading).toBeVisible();
  const title = ((await heading.textContent()) ?? "").trim();
  expect(title).toMatch(/Sign in|Choose a profile|isn.t configured/);

  if (title === "Sign in") {
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  }
});
