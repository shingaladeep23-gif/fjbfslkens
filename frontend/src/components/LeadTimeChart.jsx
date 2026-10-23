import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMW } from "../format.js";

export const MISS_COLOUR = "#4a3aa7";
export const DIFFERENCE_COLOUR = "#008300";

// How accuracy changes as the forecast gets older: typical miss and forecast minus actual
// for every lead time from 1 to 48 h. A dashed line marks the lead time chosen on the slider.
export default function LeadTimeChart({ rows, selectedLead }) {
  return (
    <section>
      <h2>How accuracy changes with lead time (MW)</h2>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 16, left: 8 }}>
          <CartesianGrid stroke="#e7e6e2" vertical={false} />
          <XAxis
            dataKey="lead_hours"
            type="number"
            domain={[1, 48]}
            ticks={[1, 6, 12, 18, 24, 30, 36, 42, 48]}
            label={{ value: "Hours between forecast and delivery", position: "insideBottom", offset: -8 }}
          />
          <YAxis tickFormatter={(value) => value.toLocaleString("en-GB")} width={56} />
          <Tooltip formatter={(value) => formatMW(value)} labelFormatter={(lead) => `${lead} h before delivery`} itemSorter={null} />
          <Legend verticalAlign="top" itemSorter={null} />
          <ReferenceLine x={selectedLead} stroke="#8a8984" strokeDasharray="4 4" />
          <ReferenceLine y={0} stroke="#8a8984" />
          <Line dataKey="mae" name="Typical miss (MAE)" stroke={MISS_COLOUR} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="mean_forecast_minus_actual" name="Forecast minus actual (average)" stroke={DIFFERENCE_COLOUR} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}
