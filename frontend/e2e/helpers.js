// Shared helpers for the end-to-end tests. Each one does a single thing a test needs.
import { expect } from "@playwright/test";
import { formatMW, formatPercent, formatSignedMW } from "../src/format.js";

export const JANUARY_START = "2026-01-01";
export const JANUARY_END = "2026-01-31";

// The query string the page sends, e.g. "start=2026-01-01&end=2026-01-31&lead_hours=24".
export function query(start, end, lead) {
  return `start=${start}&end=${end}&lead_hours=${lead}`;
}

// Ask the API directly, through the same /api proxy the page uses, and return the JSON.
export async function apiGet(request, path) {
  const response = await request.get(path);
  return response.json();
}

// Wait the given number of milliseconds (used inside page.route to slow a response down).
export function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// The headline card with this title, e.g. "Typical miss".
export function card(page, title) {
  return page.locator(".card", { hasText: title });
}

// Check the three cards show exactly what /api/metrics returns, then wait until nothing is loading.
export async function expectCardsToMatchApi(page, request, start, end, lead) {
  const metrics = await apiGet(request, `/api/metrics?${query(start, end, lead)}`);
  await expect(card(page, "Typical miss").locator(".big")).toHaveText(formatMW(metrics.mae));
  await expect(card(page, "Typical miss")).toContainText(formatPercent(metrics.mae_pct_of_mean_actual));
  await expect(card(page, "Forecast minus actual").locator(".big")).toHaveText(formatSignedMW(metrics.mean_forecast_minus_actual));
  await expect(card(page, "Wind you can count on").locator(".big")).toHaveText(formatMW(metrics.actual_p10));
  await expect(page.locator(".status")).toHaveText("");
  return metrics;
}

// Pick a date range the way a user would, in the two date inputs.
export async function setDates(page, start, end) {
  await page.getByLabel("From").fill(start);
  await page.getByLabel("To").fill(end);
}

// Press one key on the lead-time slider (e.g. "End" = 48 h, "Home" = 1 h, "ArrowRight" = +1 h).
export async function pressSliderKey(page, key) {
  await page.getByRole("slider").focus();
  await page.keyboard.press(key);
}

// Record every /api request the page makes, as URL objects, from now on.
export function recordApiRequests(page) {
  const requests = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) {
      requests.push(url);
    }
  });
  return requests;
}

// Hover the main chart at point number `index` out of `count` half-hour points, and return the tooltip.
// The points span the x-axis line; we stay 1 px inside its ends, because Recharts only shows a
// tooltip strictly inside the plot area.
export async function hoverMainChartPoint(page, index, count) {
  const chart = page.locator(".recharts-wrapper").first();
  await chart.scrollIntoViewIfNeeded(); // the mouse can only hover what is on screen
  const axisLine = chart.locator(".recharts-xAxis .recharts-cartesian-axis-line");
  const box = await axisLine.boundingBox();
  const x = box.x + 1 + ((box.width - 2) * index) / (count - 1);
  await page.mouse.move(x, box.y - 120);
  return page.locator(".tooltip");
}

// True if two boxes share any area.
function boxesOverlap(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

// Check that no two of the matched elements overlap on screen; a failure names both texts.
export async function expectNoOverlap(locator, description) {
  const items = [];
  for (const element of await locator.all()) {
    const box = await element.boundingBox();
    if (box) {
      items.push({ box: box, text: (await element.textContent()).trim() });
    }
  }
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const message = `${description}: "${items[i].text}" overlaps "${items[j].text}"`;
      expect(boxesOverlap(items[i].box, items[j].box), message).toBe(false);
    }
  }
}
