import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDay, formatGW, formatMW, formatTime } from "../format.js";

const ACTUAL_COLOUR = "#2a78d6";
const FORECAST_COLOUR = "#eb6834";
const HALF_HOUR_MS = 30 * 60 * 1000;

// Pick axis ticks at midnight, skipping days so there are at most about 10 labels.
function midnightTicks(actuals) {
  const midnights = [];
  for (const row of actuals) {
    if (row.time.endsWith("T00:00:00Z")) {
      midnights.push(row.time);
    }
  }
  const step = Math.ceil(midnights.length / 10);
  const ticks = [];
  for (let i = 0; i < midnights.length; i += step) {
    ticks.push(midnights[i]);
  }
  return ticks;
}

// Build a lookup from time to row, so the tooltip can find values for any hovered time.
function byTime(rows) {
  const lookup = {};
  for (const row of rows) {
    lookup[row.time] = row;
  }
  return lookup;
}

// Shift an API time like "2026-01-10T12:30:00Z" by some milliseconds, keeping the same format.
function shiftTime(isoTime, milliseconds) {
  const shifted = new Date(new Date(isoTime).getTime() + milliseconds);
  return shifted.toISOString().replace(".000Z", "Z");
}

// One row per half-hour for drawing. On the hour, forecastLine is the published forecast.
// At :30 there is no forecast, so forecastLine is the average of the hours either side:
// exactly the point a straight line between them passes through, so the drawing is the same.
// If either hour is a gap, :30 stays empty and the line breaks. The tooltip never shows forecastLine.
function chartRows(actuals, forecastByTime) {
  const rows = [];
  for (const actual of actuals) {
    let forecastLine = null;
    if (actual.time.endsWith(":00:00Z")) {
      const forecast = forecastByTime[actual.time];
      forecastLine = forecast ? forecast.generation : null;
    } else {
      const before = forecastByTime[shiftTime(actual.time, -HALF_HOUR_MS)];
      const after = forecastByTime[shiftTime(actual.time, HALF_HOUR_MS)];
      if (before && after && before.generation !== null && after.generation !== null) {
        forecastLine = (before.generation + after.generation) / 2;
      }
    }
    rows.push({ time: actual.time, actual: actual.generation, forecastLine: forecastLine });
  }
  return rows;
}

// Tooltip for one hovered time: the actual, and the published forecast with when it was published.
function SeriesTooltip({ active, label, actualByTime, forecastByTime }) {
  if (!active || !label) {
    return null;
  }
  const actual = actualByTime[label];
  const forecast = forecastByTime[label];
  let forecastText = "only on the hour";
  if (forecast && forecast.generation === null) {
    forecastText = "none available in time";
  } else if (forecast) {
    forecastText = `${formatMW(forecast.generation)} (published ${formatTime(forecast.publishTime)} UTC)`;
  }
  // The data- attributes hold the exact times, so the end-to-end tests can check them.
  return (
    <div className="tooltip" data-time={label} data-published={forecast ? forecast.publishTime || "" : ""}>
      <strong>{formatTime(label)} UTC</strong>
      <div>Actual: {actual ? formatMW(actual.generation) : "–"}</div>
      <div>Forecast: {forecastText}</div>
    </div>
  );
}

// Main chart: actual output every half-hour, and the forecast available at decision time every hour.
// A gap in the forecast breaks its line instead of dropping to zero.
export default function SeriesChart({ series }) {
  const actualByTime = byTime(series.actuals);
  const forecastByTime = byTime(series.forecasts);
  const rows = chartRows(series.actuals, forecastByTime);
  return (
    <section>
      <h2>Actual wind output vs the forecast available at decision time</h2>
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="#e7e6e2" vertical={false} />
          <XAxis dataKey="time" ticks={midnightTicks(series.actuals)} tickFormatter={formatDay} />
          <YAxis domain={[0, 25000]} ticks={[0, 5000, 10000, 15000, 20000, 25000]} tickFormatter={formatGW} width={56} />
          <Tooltip content={<SeriesTooltip actualByTime={actualByTime} forecastByTime={forecastByTime} />} />
          <Legend itemSorter={null} />
          <Line dataKey="actual" name="Actual (every half-hour)" stroke={ACTUAL_COLOUR} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="forecastLine" name="Forecast (hourly)" stroke={FORECAST_COLOUR} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="muted">Times in UTC. Breaks in the forecast line are hours with no forecast available in time.</p>
    </section>
  );
}
