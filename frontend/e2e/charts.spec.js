// What's drawn: tooltips, the no-look-ahead rule, gaps, and the three accuracy charts.
import { expect, test } from "@playwright/test";
import { formatMW, formatTime } from "../src/format.js";
import {
  apiGet,
  expectCardsToMatchApi,
  hoverMainChartPoint,
  JANUARY_END,
  JANUARY_START,
  pressSliderKey,
  query,
  recordApiRequests,
  setDates,
} from "./helpers.js";

// The page section whose heading has this text.
function section(page, heading) {
  return page.locator("section", { has: page.getByRole("heading", { name: heading }) });
}

test("main chart tooltip is right at the first point, last point, an on-the-hour point and a :30 point", async ({ page, request }) => {
  await page.goto("/");
  await setDates(page, "2026-01-10", "2026-01-11");
  await expectCardsToMatchApi(page, request, "2026-01-10", "2026-01-11", 24);
  const series = await apiGet(request, `/api/series?${query("2026-01-10", "2026-01-11", 24)}`);
  const forecastByTime = {};
  for (const forecast of series.forecasts) {
    forecastByTime[forecast.time] = forecast;
  }
  const count = series.actuals.length;
  for (const index of [0, count - 1, 30, 31]) { // 10 Jan 00:00, 11 Jan 23:30, 10 Jan 15:00, 10 Jan 15:30
    const actual = series.actuals[index];
    const tooltip = await hoverMainChartPoint(page, index, count);
    await expect(tooltip).toHaveAttribute("data-time", actual.time);
    await expect(tooltip).toContainText(`Actual: ${formatMW(actual.generation)}`);
    const forecast = forecastByTime[actual.time];
    if (forecast) {
      await expect(tooltip).toContainText(`Forecast: ${formatMW(forecast.generation)} (published ${formatTime(forecast.publishTime)} UTC)`);
    } else {
      await expect(tooltip).toContainText("Forecast: only on the hour");
    }
  }
});

test("no look-ahead: across all of January, every hovered forecast was published at least the lead time before its target", async ({ page, request }) => {
  await page.goto("/");
  for (const lead of [24, 48]) {
    if (lead === 48) {
      await pressSliderKey(page, "End");
    }
    await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, lead);
    const checkedTimes = [];
    for (let step = 0; step <= 40; step++) {
      const tooltip = await hoverMainChartPoint(page, Math.round((1487 * step) / 40), 1488);
      const target = new Date(await tooltip.getAttribute("data-time"));
      const published = await tooltip.getAttribute("data-published");
      if (published) {
        const hoursBefore = (target - new Date(published)) / 3600000;
        expect(hoursBefore, `target ${target.toISOString()}`).toBeGreaterThanOrEqual(lead);
        checkedTimes.push(target);
      }
    }
    // The checks really covered the whole month, not just its first half.
    expect(checkedTimes.length).toBeGreaterThan(10);
    expect(checkedTimes[checkedTimes.length - 1].getTime()).toBeGreaterThan(Date.UTC(2026, 0, 30));
  }
});

test("gaps at 48 h: the tooltip says none was available and the gap count matches the API", async ({ page, request }) => {
  await page.goto("/");
  await setDates(page, "2026-01-10", "2026-01-11");
  await pressSliderKey(page, "End");
  const metrics = await expectCardsToMatchApi(page, request, "2026-01-10", "2026-01-11", 48);
  expect(metrics.gaps).toBeGreaterThan(0);
  await expect(page.getByText(`${metrics.gaps} hours had no forecast`)).toBeVisible();
  const tooltip = await hoverMainChartPoint(page, 46, 96); // 10 Jan 23:00
  await expect(tooltip).toHaveAttribute("data-time", "2026-01-10T23:00:00Z");
  await expect(tooltip).toContainText("Forecast: none available in time");
});

test("lead-time chart has all 48 lead times and is not fetched again when the slider moves", async ({ page, request }) => {
  await page.goto("/");
  await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, 24);
  const chart = section(page, "How accuracy changes with lead time");
  await chart.scrollIntoViewIfNeeded(); // the mouse can only hover what is on screen
  const axis = await chart.locator(".recharts-xAxis .recharts-cartesian-axis-line").boundingBox();
  for (let lead = 1; lead <= 48; lead++) {
    await page.mouse.move(axis.x + 1 + ((axis.width - 2) * (lead - 1)) / 47, axis.y - 60); // 1 px inside the plot
    await expect(chart.locator(".recharts-tooltip-label")).toHaveText(`${lead} h before delivery`);
  }
  const requests = recordApiRequests(page);
  await pressSliderKey(page, "ArrowRight");
  await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, 25);
  expect(requests.filter((url) => url.pathname === "/api/metrics/by-lead")).toEqual([]);
});

test("breakdown charts: 24 hour-of-day bars per series, and every generation band is labelled", async ({ page, request }) => {
  await page.goto("/");
  await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, 24);
  const hourChart = page.locator(".small-chart", { hasText: "By hour of day" });
  await expect(hourChart.locator(".recharts-bar").nth(0).locator(".recharts-bar-rectangle")).toHaveCount(24);
  await expect(hourChart.locator(".recharts-bar").nth(1).locator(".recharts-bar-rectangle")).toHaveCount(24);
  const levels = await apiGet(request, `/api/metrics/by-level?${query(JANUARY_START, JANUARY_END, 24)}`);
  const levelChart = page.locator(".small-chart", { hasText: "By actual wind output" });
  await expect(levelChart.locator(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value")).toHaveText(levels.map((row) => row.level));
});

test("every legend lists its series in the order they are drawn", async ({ page, request }) => {
  await page.goto("/");
  await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, 24);
  const legends = page.locator(".recharts-legend-wrapper");
  await expect(legends.nth(0).locator(".recharts-legend-item-text")).toHaveText(["Actual (every half-hour)", "Forecast (hourly)"]);
  await expect(legends.nth(1).locator(".recharts-legend-item-text")).toHaveText(["Typical miss (MAE)", "Forecast minus actual (average)"]);
  await expect(legends.nth(2).locator(".recharts-legend-item-text")).toHaveText(["Typical miss", "Forecast minus actual"]);
  await expect(legends.nth(3).locator(".recharts-legend-item-text")).toHaveText(["Typical miss", "Forecast minus actual"]);
});
