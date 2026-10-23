// Dates and slider: every way a user can change the inputs, including racing and bad values.
import { expect, test } from "@playwright/test";
import {
  apiGet,
  card,
  expectCardsToMatchApi,
  JANUARY_END,
  JANUARY_START,
  hoverMainChartPoint,
  pressSliderKey,
  query,
  recordApiRequests,
  setDates,
  wait,
} from "./helpers.js";

test("lead time at the boundaries: 1 h and 48 h both work and update the cards", async ({ page, request }) => {
  await page.goto("/");
  await pressSliderKey(page, "Home");
  await expect(page.getByText("Forecast made at least 1 h before delivery")).toBeVisible();
  await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, 1);
  await pressSliderKey(page, "End");
  await expect(page.getByText("Forecast made at least 48 h before delivery")).toBeVisible();
  await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, 48);
});

test("slider by keyboard: arrows, Home and End each fetch exactly once", async ({ page, request }) => {
  await page.goto("/");
  await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, 24);
  const requests = recordApiRequests(page);
  const steps = [["ArrowRight", 25], ["ArrowLeft", 24], ["ArrowUp", 25], ["Home", 1], ["End", 48]];
  for (const [key, lead] of steps) {
    await pressSliderKey(page, key);
    await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, lead);
  }
  const metricsCalls = requests.filter((url) => url.pathname === "/api/metrics");
  expect(metricsCalls.map((url) => url.searchParams.get("lead_hours"))).toEqual(["25", "24", "25", "1", "48"]);
});

test("moving the slider quickly ends on the last value even if older answers arrive late", async ({ page, request }) => {
  await page.goto("/");
  await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, 24);
  // From now on, answers for the first new lead arrive after 2 s, the second after 1 s, the third at once.
  const leadsInOrder = [];
  await page.route("**/api/**", async (route) => {
    const lead = new URL(route.request().url()).searchParams.get("lead_hours");
    if (lead !== null && !leadsInOrder.includes(lead)) {
      leadsInOrder.push(lead);
    }
    await wait([2000, 1000][leadsInOrder.indexOf(lead)] ?? 0);
    await route.continue();
  });
  const slider = page.getByRole("slider");
  const box = await slider.boundingBox();
  for (const fraction of [0.1, 0.9, 0.5]) {
    await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
  }
  await expect.poll(() => leadsInOrder.length).toBe(3);
  // Wait until the oldest, slowest answer has arrived, then check it didn't overwrite the newest.
  await page.waitForResponse((r) => r.url().includes("/api/metrics?") && r.url().endsWith(`lead_hours=${leadsInOrder[0]}`));
  const lastLead = Number(await slider.inputValue());
  expect(String(lastLead)).toBe(leadsInOrder[2]);
  await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, lastLead);
});

test("changing dates quickly ends on the last range even if older answers arrive late", async ({ page, request }) => {
  await page.goto("/");
  await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, 24);
  // Answers for the first new start date arrive after 2 s, the second after 1 s, the third at once.
  const startsInOrder = [];
  await page.route("**/api/**", async (route) => {
    const start = new URL(route.request().url()).searchParams.get("start");
    if (!startsInOrder.includes(start)) {
      startsInOrder.push(start);
    }
    await wait([2000, 1000][startsInOrder.indexOf(start)] ?? 0);
    await route.continue();
  });
  for (const start of ["2026-01-05", "2026-01-10", "2026-01-15"]) {
    await page.getByLabel("From", { exact: true }).fill(start);
  }
  await page.waitForResponse((r) => r.url().includes("/api/metrics?start=2026-01-05&"));
  await expectCardsToMatchApi(page, request, "2026-01-15", JANUARY_END, 24);
});

test("a single-day range (start = end) works", async ({ page, request }) => {
  await page.goto("/");
  await setDates(page, "2026-01-15", "2026-01-15");
  const metrics = await expectCardsToMatchApi(page, request, "2026-01-15", "2026-01-15", 24);
  expect(metrics.hours).toBe(24);
  await expect(page.getByText("Based on 24 hours with a forecast available.")).toBeVisible();
});

test("3 February at 48 h: every hour is a gap, the page says so and nothing crashes", async ({ page, request }) => {
  await page.goto("/");
  await setDates(page, "2026-02-03", "2026-02-03");
  await pressSliderKey(page, "End");
  const metrics = await apiGet(request, `/api/metrics?${query("2026-02-03", "2026-02-03", 48)}`);
  expect(metrics.gaps).toBe(metrics.hours);
  await expect(page.getByText(`Based on 0 hours with a forecast available; ${metrics.gaps} hours had no forecast`)).toBeVisible();
  await expect(card(page, "Typical miss").locator(".big")).toHaveText("–");
  const tooltip = await hoverMainChartPoint(page, 24, 48); // 12:00
  await expect(tooltip).toContainText("Forecast: none available in time");
  await expect(page.locator(".error")).toHaveCount(0);
});

test("start after end shows the API's message, and fixing the dates clears it", async ({ page, request }) => {
  await page.goto("/");
  await setDates(page, "2026-01-20", "2026-01-10");
  const apiError = await apiGet(request, `/api/metrics?${query("2026-01-20", "2026-01-10", 24)}`);
  await expect(page.locator(".error")).toHaveText(apiError.detail);
  await page.getByLabel("To", { exact: true }).fill("2026-01-25");
  await expect(page.locator(".error")).toHaveCount(0);
  await expectCardsToMatchApi(page, request, "2026-01-20", "2026-01-25", 24);
});

test("an empty, invalid or out-of-range date shows a clear message and sends no bad request", async ({ page, request }) => {
  await page.goto("/");
  await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, 24);
  const requests = recordApiRequests(page);
  const message = page.locator(".error");

  await page.getByLabel("From", { exact: true }).fill("");                 // cleared
  await expect(message).toContainText("Choose dates between 1 Jan 2026 and 3 Feb 2026");
  await page.getByLabel("From", { exact: true }).fill(JANUARY_START);
  await page.getByLabel("To", { exact: true }).fill("2026-03-01");         // after the data ends
  await expect(message).toContainText("Choose dates between 1 Jan 2026 and 3 Feb 2026");
  await page.getByLabel("To", { exact: true }).fill(JANUARY_END);
  await page.getByLabel("To", { exact: true }).press("Backspace");         // typing breaks the date
  await expect(message).toContainText("Choose dates between 1 Jan 2026 and 3 Feb 2026");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  for (const url of requests) {
    expect(url.searchParams.get("start"), url.href).toMatch(/^2026-01-01$/);
    expect(url.searchParams.get("end"), url.href).toMatch(/^2026-01-31$/);
  }
});

test("the date inputs' min and max come from the data range", async ({ page, request }) => {
  // The API's own error message names the range it has data for.
  const apiError = await apiGet(request, "/api/metrics?start=2000-01-01&end=2000-01-02");
  const [, firstDay, lastDay] = apiError.detail.match(/between (\S+) and (\S+)/);
  await page.goto("/");
  for (const label of ["From", "To"]) {
    await expect(page.getByLabel(label, { exact: true })).toHaveAttribute("min", firstDay);
    await expect(page.getByLabel(label, { exact: true })).toHaveAttribute("max", lastDay);
  }
});
