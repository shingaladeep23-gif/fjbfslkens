// When things go wrong: the API down, one endpoint failing, recovery, and a very slow endpoint.
import { expect, test } from "@playwright/test";
import { formatMW } from "../src/format.js";
import { apiGet, card, expectCardsToMatchApi, JANUARY_END, JANUARY_START, pressSliderKey, query, wait } from "./helpers.js";

test("API down at load: a clear 'could not reach the server' message instead of a blank page", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".error")).toHaveText("Could not reach the server. Is the back end running?");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByLabel("From")).toBeEnabled();
});

test("one endpoint returning 500: that section shows an error and the rest of the page still works", async ({ page, request }) => {
  await page.route((url) => url.pathname === "/api/metrics/by-hour", (route) => route.fulfill({ status: 500, body: "Internal Server Error" }));
  await page.goto("/");
  await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, 24);
  const breakdown = page.locator("section", { has: page.getByRole("heading", { name: "Where the forecast misses most" }) });
  await expect(breakdown.locator(".error")).toContainText("500");
  await expect(page.locator(".error")).toHaveCount(1);
  await expect(page.locator(".recharts-wrapper").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "How accuracy changes with lead time" })).toBeVisible();
  await pressSliderKey(page, "ArrowRight");
  await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, 25);
});

test("API back after failing: the next control change recovers every section without a reload", async ({ page, request }) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".error")).toHaveText("Could not reach the server. Is the back end running?");
  await page.unroute("**/api/**");
  await pressSliderKey(page, "ArrowRight");
  await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, 25);
  await expect(page.locator(".error")).toHaveCount(0);
  const leadChart = page.locator("section", { has: page.getByRole("heading", { name: "How accuracy changes with lead time" }) });
  await expect(leadChart.locator(".recharts-wrapper")).toBeVisible();
});

test("slow lead-time chart (5 s): the rest of the page is usable meanwhile", async ({ page, request }) => {
  await page.goto("/"); // load once first, so the reload below is quick even on a cold CI machine
  await page.route((url) => url.pathname === "/api/metrics/by-lead", async (route) => {
    await wait(5000);
    await route.continue();
  });
  await page.reload();
  const at24 = await apiGet(request, `/api/metrics?${query(JANUARY_START, JANUARY_END, 24)}`);
  await expect(card(page, "Typical miss").locator(".big")).toHaveText(formatMW(at24.mae));
  await expect(page.locator(".recharts-wrapper").first()).toBeVisible();
  await pressSliderKey(page, "ArrowRight");
  const at25 = await apiGet(request, `/api/metrics?${query(JANUARY_START, JANUARY_END, 25)}`);
  await expect(card(page, "Typical miss").locator(".big")).toHaveText(formatMW(at25.mae));
  // All of the above happened while the lead-time chart was still waiting for its answer.
  const leadChart = page.locator("section", { has: page.getByRole("heading", { name: "How accuracy changes with lead time" }) });
  await expect(leadChart).toContainText("Loading…");
  await expect(leadChart.locator(".recharts-wrapper")).toBeVisible({ timeout: 10000 });
});
