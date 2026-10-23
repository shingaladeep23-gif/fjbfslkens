import { formatMW, formatPercent, formatSignedMW } from "../format.js";

// The three numbers a buyer cares about most, in plain words.
export default function HeadlineCards({ metrics }) {
  const hoursWithForecast = metrics.hours - metrics.gaps;
  return (
    <>
      <div className="cards">
        <div className="card">
          <h3>Typical miss</h3>
          <p className="big">{formatMW(metrics.mae)}</p>
          <p>{formatPercent(metrics.mae_pct_of_mean_actual)} of average output</p>
        </div>
        <div className="card">
          <h3>Forecast minus actual (average)</h3>
          <p className="big">{formatSignedMW(metrics.mean_forecast_minus_actual)}</p>
          <p className="muted">
            Not yet explained, see <a href="#notes">notes</a>
          </p>
        </div>
        <div className="card">
          <h3>Wind you can count on</h3>
          <p className="big">{formatMW(metrics.actual_p10)}</p>
          <p>9 hours in 10, output was at least this much</p>
        </div>
      </div>
      <p className="muted">
        Based on {hoursWithForecast} hours with a forecast available
        {metrics.gaps > 0 ? `; ${metrics.gaps} hours had no forecast at this lead time` : ""}.
      </p>
    </>
  );
}
