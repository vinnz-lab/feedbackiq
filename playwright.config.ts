import { defineConfig } from "@playwright/test";

// Browser smoke tests. Run locally with the app already started (npm run dev),
// or point BASE_URL at a deployed copy. Not yet wired into CI.
export default defineConfig({
  testDir: "./e2e-smoke",
  timeout: 30_000,
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
});
