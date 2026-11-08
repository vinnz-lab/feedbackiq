import { expect, test } from "@playwright/test";

// Data-path check: the owner creates a webhook address, another app posts feedback to it,
// and the feedback appears under Needs review. Local only: needs ALLOW_DEV_LOGIN=true
// and the sample data. Skips on GitHub.
test("feedback sent to the webhook appears under Needs review", async ({ page, request }) => {
  test.setTimeout(120_000);

  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  const picker = page.getByRole("heading", { name: "Choose a profile" });
  const showsPicker = await picker.isVisible().catch(() => false);
  test.skip(!showsPicker, "Dev profile picker is off (ALLOW_DEV_LOGIN not set)");

  // Sign in as the workspace owner, who is the only one who can set up the webhook.
  const ownerForm = page.locator("form", { hasText: "Jamie Lee" });
  test.skip((await ownerForm.count()) === 0, "Jamie Lee (owner) is not in the local sample data");
  await ownerForm.locator("button[type=submit]").click();
  await expect(page).not.toHaveURL(/\/login/);

  // Get a fresh address the test can read. Create one, or replace the existing one.
  await page.goto("/integrations");
  const create = page.getByRole("button", { name: "Create webhook address" });
  if (await create.isVisible().catch(() => false)) {
    await create.click();
  } else {
    await page.getByRole("button", { name: "Get a new address" }).click();
    await page.getByRole("button", { name: "Replace it" }).click();
  }
  const url = ((await page.getByTestId("webhook-url").textContent()) ?? "").trim();
  expect(url).toMatch(/\/api\/hooks\/feedback\//);

  // Post one unique piece of feedback, as another app would.
  const sentence = `Webhook test ${Date.now()}: the export button is hard to find.`;
  const response = await request.post(url, {
    headers: { "content-type": "application/json" },
    data: { feedback: sentence, customer: "Test Ltd" },
  });
  expect(response.status()).toBe(200);
  expect((await response.json()).ok).toBe(true);

  // It should be waiting in Needs review.
  await page.goto("/register?tab=review");
  await expect(page.getByText(sentence)).toBeVisible();
});
