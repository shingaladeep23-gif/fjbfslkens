import { defineConfig, devices } from "@playwright/test";

// End-to-end tests. By default Playwright starts the FastAPI back end and the Vite dev server
// itself, waits until both answer, then drives Chromium through the page like a user would.
// To test an app that is already running instead (Docker, or the live site), set BASE_URL:
//   BASE_URL=http://localhost:8080 npx playwright test
const baseURL = process.env.BASE_URL || "http://localhost:5173";

// The two local servers to start when BASE_URL is not set.
const localServers = [
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
];

export default defineConfig({
  testDir: "./e2e",
  expect: { timeout: 10000 }, // patience for slower CI machines; the checks themselves are unchanged
  // Against an already-running server (Docker or live), use 2 browsers at a time, like CI.
  // More would make the suite an accidental load test of a cold server sharing this machine's CPU.
  workers: process.env.BASE_URL ? 2 : undefined,
  use: {
    baseURL: baseURL,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.BASE_URL ? undefined : localServers,
});
