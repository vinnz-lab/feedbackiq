import { defineConfig } from "@playwright/test";

// Browser smoke tests. Run locally with the app already started (npm run dev),
// or point BASE_URL at a deployed copy.
export default defineConfig({
  testDir: "./e2e-smoke",
  timeout: 30_000,
  // One at a time: the local test database is a single file, and parallel sign-ins
  // against it can clash, which makes sign-in tests fail at random.
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
});
