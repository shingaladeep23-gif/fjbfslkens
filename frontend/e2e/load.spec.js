// First impression: what a user sees when the page opens.
import { expect, test } from "@playwright/test";
import { expectCardsToMatchApi, hoverMainChartPoint, JANUARY_END, JANUARY_START, pressSliderKey, setDates, wait } from "./helpers.js";

test("page title, header and explainer line are present", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("UK wind forecast monitor");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("UK wind forecast monitor — January 2026");
  await expect(page.locator(".intro")).toContainText("the forecast a buyer could have seen");
});

test("default state is 1–31 January at 24 h, and the cards match the API", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByLabel("From", { exact: true })).toHaveValue(JANUARY_START);
  await expect(page.getByLabel("To", { exact: true })).toHaveValue(JANUARY_END);
  await expect(page.getByRole("slider")).toHaveValue("24");
  await expect(page.getByText("Forecast made at least 24 h before delivery")).toBeVisible();
  await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, 24);
});

test("no console errors or failed requests during load and normal use", async ({ page, request }) => {
  const problems = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      problems.push(`console ${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
  page.on("requestfailed", (failed) => problems.push(`request failed: ${failed.url()}`));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      problems.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });

  await page.goto("/");
  await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, 24);
  await pressSliderKey(page, "ArrowRight");
  await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, 25);
  await setDates(page, "2026-01-10", "2026-01-12");
  await expectCardsToMatchApi(page, request, "2026-01-10", "2026-01-12", 25);
  await hoverMainChartPoint(page, 20, 144);
  expect(problems).toEqual([]);
});

test("a loading message is visible while the API is slow", async ({ page, request }) => {
  await page.route((url) => url.pathname === "/api/metrics", async (route) => {
    await wait(1500);
    await route.continue();
  });
  await page.goto("/");
  await expect(page.locator(".status")).toHaveText("Loading…");
  await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, 24);
  await expect(page.locator(".status")).toHaveText("");
});
