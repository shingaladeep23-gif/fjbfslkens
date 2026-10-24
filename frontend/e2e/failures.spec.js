// When things go wrong: the API down, one endpoint failing, recovery, and a very slow endpoint.
import { expect, test } from "@playwright/test";
import { formatMW } from "../src/format.js";
import { apiGet, card, expectCardsToMatchApi, JANUARY_END, JANUARY_START, pressSliderKey, query, wait } from "./helpers.js";

test("API down at load: a clear 'could not reach the server' message instead of a blank page", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".error")).toHaveText("Could not reach the server. Is the back end running?");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByLabel("From", { exact: true })).toBeEnabled();
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

test("slow lead-time chart: the rest of the page is usable while it waits", async ({ page, request }) => {
  await page.goto("/"); // load once first, so the reload below is quick even on a cold CI machine
  // Hold the lead-time chart's answer until the rest of the page has been checked, however long
  // that takes on this machine, then let it through.
  let releaseByLead;
  const byLeadHeld = new Promise((resolve) => { releaseByLead = resolve; });
  await page.route((url) => url.pathname === "/api/metrics/by-lead", async (route) => {
    await byLeadHeld;
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
  releaseByLead();
  await expect(leadChart.locator(".recharts-wrapper")).toBeVisible();
});

test("a slow request is not restarted when another control changes", async ({ page }) => {
  await page.goto("/"); // load once first, so the reload below is quick
  await expect(page.locator(".status")).toHaveText(""); // ...and let that first load's requests finish
  await page.route((url) => url.pathname === "/api/metrics/by-lead", async (route) => {
    await wait(3000);
    await route.continue();
  });
  const byLeadRequests = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/metrics/by-lead")) {
      byLeadRequests.push(r.url());
    }
  });
  await page.reload();
  await expect(card(page, "Typical miss").locator(".big")).not.toHaveText("");
  await pressSliderKey(page, "ArrowRight");
  await pressSliderKey(page, "ArrowRight");
  const leadChart = page.locator("section", { has: page.getByRole("heading", { name: "How accuracy changes with lead time" }) });
  await expect(leadChart.locator(".recharts-wrapper")).toBeVisible();
  expect(byLeadRequests).toHaveLength(1); // the one slow request finished and was used
});
