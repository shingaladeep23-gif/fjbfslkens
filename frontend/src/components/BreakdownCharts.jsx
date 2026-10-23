import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMW } from "../format.js";
import { DIFFERENCE_COLOUR, MISS_COLOUR } from "./LeadTimeChart.jsx";

// One small bar chart: typical miss and forecast minus actual for each group (an hour or a band).
function ErrorBars({ title, rows, groupKey, tooltipLabel }) {
  return (
    <div className="small-chart">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="#e7e6e2" vertical={false} />
          <XAxis dataKey={groupKey} interval={groupKey === "level" ? 0 : "preserveEnd"} />
          <YAxis tickFormatter={(value) => value.toLocaleString("en-GB")} width={56} />
          <Tooltip formatter={(value) => formatMW(value)} labelFormatter={(label, payload) => tooltipLabel(label, payload)} itemSorter={null} />
          <Legend verticalAlign="top" itemSorter={null} />
          <ReferenceLine y={0} stroke="#8a8984" />
          <Bar dataKey="mae" name="Typical miss" fill={MISS_COLOUR} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="mean_forecast_minus_actual" name="Forecast minus actual" fill={DIFFERENCE_COLOUR} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Tooltip heading for an hour of the day, e.g. "17:00–17:59 UTC".
function hourLabel(hour) {
  return `${hour}:00–${hour}:59 UTC`;
}

// Tooltip heading for a generation band, with how many hours it covers so a small band isn't over-trusted.
function levelLabel(level, payload) {
  if (!payload || payload.length === 0) {
    return level;
  }
  return `${level} (${payload[0].payload.hours} hours)`;
}

// The two breakdowns side by side: by hour of day, and by how windy it actually was.
export default function BreakdownCharts({ byHour, byLevel }) {
  return (
    <section>
      <h2>Where the forecast misses most (MW)</h2>
      <div className="two-columns">
        <ErrorBars title="By hour of day (UTC)" rows={byHour} groupKey="hour" tooltipLabel={hourLabel} />
        <ErrorBars title="By actual wind output" rows={byLevel} groupKey="level" tooltipLabel={levelLabel} />
      </div>
    </section>
  );
}
