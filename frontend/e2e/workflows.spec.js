import { expect, test } from "@playwright/test";
import { formatMW, formatPercent, formatSignedMW } from "../src/format.js";

const JANUARY_24H = "start=2026-01-01&end=2026-01-31&lead_hours=24";

// Ask the API directly, through the same /api proxy the page uses.
async function apiGet(request, path) {
  const response = await request.get(path);
  return response.json();
}

// The card with this title, e.g. "Typical miss".
function card(page, title) {
  return page.locator(".card", { hasText: title });
}

// Check the three cards show exactly what /api/metrics returns for this query.
async function expectCardsToMatchApi(page, request, query) {
  const metrics = await apiGet(request, `/api/metrics?${query}`);
  await expect(card(page, "Typical miss").locator(".big")).toHaveText(formatMW(metrics.mae));
  await expect(card(page, "Typical miss")).toContainText(formatPercent(metrics.mae_pct_of_mean_actual));
  await expect(card(page, "Forecast minus actual").locator(".big")).toHaveText(formatSignedMW(metrics.mean_forecast_minus_actual));
  await expect(card(page, "Wind you can count on").locator(".big")).toHaveText(formatMW(metrics.actual_p10));
  // The cards may update before the charts; wait until nothing is loading any more.
  await expect(page.locator(".status")).toHaveText("");
  return metrics;
}

// Pick a date range the way a user would, in the two date inputs.
async function setDates(page, start, end) {
  await page.getByLabel("From").fill(start);
  await page.getByLabel("To").fill(end);
}

// Move the slider to 48 h with the keyboard and release it (End key = maximum).
async function moveSliderTo48(page) {
  await page.getByRole("slider").focus();
  await page.keyboard.press("End");
}

// Hover the main chart a number of hours after its first day tick and return the tooltip.
// Only valid for short ranges, where the day ticks are exactly one day apart.
async function hoverMainChart(page, hoursAfterFirstTick) {
  const chart = page.locator(".recharts-wrapper").first();
  const tickLines = chart.locator(".recharts-xAxis .recharts-cartesian-axis-tick-line");
  const firstDay = await tickLines.nth(0).boundingBox();
  const secondDay = await tickLines.nth(1).boundingBox();
  const pixelsPerHour = (secondDay.x - firstDay.x) / 24;
  const box = await chart.boundingBox();
  await page.mouse.move(firstDay.x + pixelsPerHour * hoursAfterFirstTick, box.y + box.height / 3);
  return page.locator(".tooltip");
}

test("default load shows the API's January numbers at 24 h", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("UK wind forecast monitor — January 2026");
  const metrics = await expectCardsToMatchApi(page, request, JANUARY_24H);
  await expect(page.getByText(`Based on ${metrics.hours} hours with a forecast available.`)).toBeVisible();
});

test("moving the slider to 48 h updates the cards and reports the gaps", async ({ page, request }) => {
  await page.goto("/");
  await expectCardsToMatchApi(page, request, JANUARY_24H);
  await moveSliderTo48(page);
  await expect(page.getByText("Forecast made at least 48 h before delivery")).toBeVisible();
  await expectCardsToMatchApi(page, request, "start=2026-01-01&end=2026-01-31&lead_hours=48");
  await expect(page.getByText("155 hours had no forecast")).toBeVisible();
});

test("no look-ahead: each hovered forecast was published at least the lead time before its target", async ({ page, request }) => {
  await page.goto("/");
  await setDates(page, "2026-01-10", "2026-01-11");
  await expectCardsToMatchApi(page, request, "start=2026-01-10&end=2026-01-11&lead_hours=24");

  for (const lead of [24, 48]) {
    if (lead === 48) {
      await moveSliderTo48(page);
      await expectCardsToMatchApi(page, request, "start=2026-01-10&end=2026-01-11&lead_hours=48");
    }
    for (const hour of [3, 9, 15, 21, 27, 33]) {
      const tooltip = await hoverMainChart(page, hour);
      const target = new Date(await tooltip.getAttribute("data-time"));
      const published = new Date(await tooltip.getAttribute("data-published"));
      // The hover landed on the hour we meant, and that hour has a forecast.
      expect(target.getTime()).toBe(Date.UTC(2026, 0, 10, hour));
      const hoursBefore = (target - published) / 3600000;
      expect(hoursBefore).toBeGreaterThanOrEqual(lead);
    }
  }
});

test("a start date after the end date shows the API's message and the page keeps working", async ({ page, request }) => {
  await page.goto("/");
  await setDates(page, "2026-01-20", "2026-01-10");
  const apiError = await apiGet(request, "/api/metrics?start=2026-01-20&end=2026-01-10&lead_hours=24");
  await expect(page.locator(".error")).toHaveText(apiError.detail);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Fixing the end date brings the numbers back.
  await page.getByLabel("To").fill("2026-01-25");
  await expect(page.locator(".error")).toHaveCount(0);
  await expectCardsToMatchApi(page, request, "start=2026-01-20&end=2026-01-25&lead_hours=24");
});

test("if the API cannot be reached, the page says so instead of going blank", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".error")).toHaveText("Could not reach the server. Is the back end running?");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByLabel("From")).toBeVisible();
});

test("picking 10-12 January changes the chart range and the cards", async ({ page, request }) => {
  await page.goto("/");
  await expectCardsToMatchApi(page, request, JANUARY_24H);
  await setDates(page, "2026-01-10", "2026-01-12");
  await expectCardsToMatchApi(page, request, "start=2026-01-10&end=2026-01-12&lead_hours=24");
  const dayLabels = page.locator(".recharts-wrapper").first().locator(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value");
  await expect(dayLabels).toHaveText(["10 Jan", "11 Jan", "12 Jan"]);
});
