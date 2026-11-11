import { expect, test } from "@playwright/test";

// Security check: the incoming feedback webhook is open to anyone who posts to it,
// so a request to a made-up address must be refused. This stays off the database
// on purpose, so it runs on GitHub without secrets.
test("webhook refuses a request to an unknown address", async ({ request }) => {
  const response = await request.post("/api/hooks/feedback/x", {
    headers: { "content-type": "application/json" },
    data: { feedback: "test" },
  });
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body.ok).toBe(false);
});

// A plain GET should explain how to use the webhook, not accept data.
test("webhook help page explains that POST is required", async ({ request }) => {
  const response = await request.get("/api/hooks/feedback/x");
  expect(response.status()).toBe(405);
  expect(response.headers()["allow"]).toBe("POST");
  const body = await response.json();
  expect(body.error).toContain("POST");
});
