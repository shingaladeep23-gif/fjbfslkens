import { defineConfig, devices } from "@playwright/test";

// End-to-end tests. Playwright starts the FastAPI back end and the Vite dev server itself,
// waits until both answer, then drives Chromium through the page like a user would.
export default defineConfig({
  testDir: "./e2e",
  expect: { timeout: 10000 }, // patience for slower CI machines; the checks themselves are unchanged
  use: {
    baseURL: "http://localhost:5173",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      command: "python -m uvicorn app.main:app --port 8000",
      cwd: "../backend",
      url: "http://localhost:8000/api/metrics",
      reuseExistingServer: !process.env.CI, // locally, reuse servers you already have running
    },
    {
      command: "npm run dev -- --port 5173 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
