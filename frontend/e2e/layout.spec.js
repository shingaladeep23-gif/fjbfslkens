// Screens and access: laptop and phone sizes, keyboard use, accessibility and refresh.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { card, expectCardsToMatchApi, expectNoOverlap, JANUARY_END, JANUARY_START, pressSliderKey, setDates } from "./helpers.js";

// The page must never be wider than the window (no sideways scrolling).
async function expectNoSidewaysScroll(page) {
  const sizes = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, window: window.innerWidth }));
  expect(sizes.page).toBeLessThanOrEqual(sizes.window);
}

// The top edge of each headline card, in page order.
async function cardTops(page) {
  const tops = [];
  for (const element of await page.locator(".card").all()) {
    tops.push((await element.boundingBox()).y);
  }
  return tops;
}

for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
  test(`at ${width}×${height}: no sideways scroll, no overlapping text, cards in one row`, async ({ page, request }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, 24);
    await expectNoSidewaysScroll(page);
    const tops = await cardTops(page);
    expect(new Set(tops).size, "all three cards share one row").toBe(1);
    for (const chart of await page.locator(".recharts-wrapper").all()) {
      await expectNoOverlap(chart.locator(".recharts-cartesian-axis-tick-value"), "axis labels");
      await expectNoOverlap(chart.locator(".recharts-legend-item"), "legend items");
    }
    await expectNoOverlap(page.locator(".controls label"), "controls");
  });
}

test("on a phone (390×844) the page is readable and usable, with the cards stacked", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, 24);
  await expectNoSidewaysScroll(page);
  const tops = await cardTops(page);
  expect(tops[0]).toBeLessThan(tops[1]);
  expect(tops[1]).toBeLessThan(tops[2]);
  await setDates(page, "2026-01-10", "2026-01-12");
  await pressSliderKey(page, "ArrowRight");
  await expectCardsToMatchApi(page, request, "2026-01-10", "2026-01-12", 25);
  await expectNoSidewaysScroll(page);
});

test("keyboard only: Tab reaches From, To and the slider in that order, with a visible focus ring", async ({ page }) => {
  await page.goto("/");
  await expect(card(page, "Typical miss")).toBeVisible();
  const order = [];
  for (let i = 0; i < 12 && order.length < 3; i++) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const element = document.activeElement;
      const label = element.closest("label");
      return { name: label ? label.textContent.trim().slice(0, 4) : element.tagName, outline: getComputedStyle(element).outlineStyle };
    });
    expect(focused.outline, `focus ring on ${focused.name}`).not.toBe("none");
    if (order[order.length - 1] !== focused.name) {
      order.push(focused.name);
    }
  }
  expect(order).toEqual(["From", "To", "Fore"]);
});

test("accessibility: no serious or critical axe violations", async ({ page, request }) => {
  await page.goto("/");
  await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, 24);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = serious.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} element(s) — ${v.help}`);
  expect(summary).toEqual([]);
});

test("refreshing the browser mid-use reloads cleanly to the defaults", async ({ page, request }) => {
  await page.goto("/");
  await setDates(page, "2026-01-10", "2026-01-12");
  await pressSliderKey(page, "End");
  await expectCardsToMatchApi(page, request, "2026-01-10", "2026-01-12", 48);
  await page.reload();
  await expect(page.getByLabel("From", { exact: true })).toHaveValue(JANUARY_START);
  await expect(page.getByLabel("To", { exact: true })).toHaveValue(JANUARY_END);
  await expect(page.getByRole("slider")).toHaveValue("24");
  await expectCardsToMatchApi(page, request, JANUARY_START, JANUARY_END, 24);
});
