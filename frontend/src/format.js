// Number and time formatting shared by every part of the page, so values always look the same.

// 2050.2 -> "2,050 MW". Missing values show as a dash.
export function formatMW(value) {
  if (value === null || value === undefined) {
    return "–";
  }
  return Math.round(value).toLocaleString("en-GB") + " MW";
}

// Like formatMW, but always shows the sign: "+1,854 MW" or "−288 MW".
export function formatSignedMW(value) {
  if (value === null || value === undefined) {
    return "–";
  }
  if (value > 0) {
    return "+" + formatMW(value);
  }
  if (value < 0) {
    return "−" + formatMW(-value);
  }
  return formatMW(0);
}

// 17.73 -> "17.7%".
export function formatPercent(value) {
  if (value === null || value === undefined) {
    return "–";
  }
  return value.toFixed(1) + "%";
}

// "2026-01-10T12:00:00Z" -> "10 Jan, 12:00". Always shown in UTC.
export function formatTime(isoTime) {
  return new Date(isoTime).toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// "2026-01-10T00:00:00Z" -> "10 Jan".
export function formatDay(isoTime) {
  return new Date(isoTime).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
}

// 12160 -> "12 GW", for chart axes.
export function formatGW(value) {
  return Math.round(value / 1000) + " GW";
}
