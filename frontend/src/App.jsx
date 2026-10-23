import { useEffect, useRef, useState } from "react";
import BreakdownCharts from "./components/BreakdownCharts.jsx";
import Controls from "./components/Controls.jsx";
import HeadlineCards from "./components/HeadlineCards.jsx";
import LeadTimeChart from "./components/LeadTimeChart.jsx";
import SeriesChart from "./components/SeriesChart.jsx";

const FIRST_DAY = "2026-01-01";
const LAST_DAY = "2026-02-03";
const DATE_RANGE_MESSAGE = "Choose dates between 1 Jan 2026 and 3 Feb 2026.";

// A message if a date can't be sent to the API (empty, half-typed or outside the data), else null.
// Date inputs give "" for an empty or half-typed date, and YYYY-MM-DD strings sort like dates.
// Start after end is left to the API, which explains that case itself.
function dateProblem(start, end) {
  for (const day of [start, end]) {
    if (day === "" || day < FIRST_DAY || day > LAST_DAY) {
      return DATE_RANGE_MESSAGE;
    }
  }
  return null;
}

// Get JSON from our API. If the API says no (e.g. a 400), throw its own message so we can show it.
async function fetchJson(url) {
  let response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error("Could not reach the server. Is the back end running?");
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null; // not JSON, e.g. the back end is not running
  }
  if (!response.ok) {
    const message = body && body.detail ? body.detail : `The server answered with an error (${response.status}).`;
    throw new Error(message);
  }
  return body;
}

// Load one API URL, and load it again when the URL changes, or when any control changes
// (changeCount goes up) while the last attempt had failed - so a failed part recovers by itself.
// Returns { data, error, loading }. The previous data stays on screen while new data loads.
function useApi(url, changeCount) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  // The URL whose answer is on screen and arrived without an error.
  const lastGoodUrl = useRef(null);

  useEffect(() => {
    // No URL means the inputs are not valid: ask the API nothing.
    if (url === null) {
      setLoading(false);
      return;
    }
    // Same URL as the answer already on screen: nothing to fetch (e.g. by-lead when the slider moves).
    if (url === lastGoodUrl.current) {
      return;
    }
    // If the URL changes before this request finishes, its answer is ignored.
    let ignore = false;
    setLoading(true);
    setError(null);
    fetchJson(url)
      .then((body) => {
        if (!ignore) {
          setData(body);
          lastGoodUrl.current = url;
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message);
          lastGoodUrl.current = null;
        }
      })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [url, changeCount]);

  return { data, error, loading };
}

// The whole page: controls at the top, then headline numbers, then the charts.
export default function App() {
  const [start, setStart] = useState("2026-01-01");
  const [end, setEnd] = useState("2026-01-31");
  const [leadHours, setLeadHours] = useState(24);
  // Goes up by one every time the user changes a control; lets failed requests retry.
  const [changeCount, setChangeCount] = useState(0);

  // Each control change updates its value and counts as a change.
  function changeStart(value) {
    setStart(value);
    setChangeCount(changeCount + 1);
  }
  function changeEnd(value) {
    setEnd(value);
    setChangeCount(changeCount + 1);
  }
  function changeLeadHours(value) {
    setLeadHours(value);
    setChangeCount(changeCount + 1);
  }

  const problem = dateProblem(start, end);
  // The URL to ask the API for, or null (ask nothing) while the dates are not valid.
  function urlFor(path, query) {
    return problem ? null : `${path}?${query}`;
  }
  const range = `start=${start}&end=${end}`;
  const rangeAndLead = `${range}&lead_hours=${leadHours}`;
  const series = useApi(urlFor("/api/series", rangeAndLead), changeCount);
  const metrics = useApi(urlFor("/api/metrics", rangeAndLead), changeCount);
  const byLead = useApi(urlFor("/api/metrics/by-lead", range), changeCount); // does not depend on the slider
  const byHour = useApi(urlFor("/api/metrics/by-hour", rangeAndLead), changeCount);
  const byLevel = useApi(urlFor("/api/metrics/by-level", rangeAndLead), changeCount);

  const requests = [series, metrics, byLead, byHour, byLevel];
  const loading = requests.some((request) => request.loading);
  // If nothing worked for the current inputs (each request failed or is still waiting, e.g. the server
  // is down or start is after end), say it once for the page instead of once per part.
  const failed = requests.find((request) => request.error);
  const nothingWorked = failed && requests.every((request) => request.error || request.loading);

  return (
    <main>
      <header>
        <h1>UK wind forecast monitor — January 2026</h1>
        <p className="intro">
          For each half-hour, how much wind power Great Britain actually produced, next to the forecast a
          buyer could have seen when they bought power ahead of time — and how far off that forecast was.
        </p>
      </header>

      <Controls
        start={start}
        end={end}
        leadHours={leadHours}
        firstDay={FIRST_DAY}
        lastDay={LAST_DAY}
        onStartChange={changeStart}
        onEndChange={changeEnd}
        onLeadHoursChange={changeLeadHours}
      />

      <p className="status" aria-live="polite">{loading ? "Loading…" : ""}</p>
      {problem && <p className="error">{problem}</p>}
      {!problem && nothingWorked && <p className="error">{failed.error}</p>}

      {!problem && !nothingWorked && (
        <>
          <Part requests={[metrics]}>
            <HeadlineCards metrics={metrics.data} />
          </Part>
          <Part title="Actual wind output vs the forecast available at decision time" requests={[series]}>
            <SeriesChart series={series.data} />
          </Part>
          <Part title="How accuracy changes with lead time (MW)" requests={[byLead]}>
            <LeadTimeChart rows={byLead.data} selectedLead={leadHours} />
          </Part>
          <Part title="Where the forecast misses most (MW)" requests={[byHour, byLevel]}>
            <BreakdownCharts byHour={byHour.data} byLevel={byLevel.data} />
          </Part>
          <Notes />
        </>
      )}
    </main>
  );
}

// One part of the page: its heading, then its own error, a loading line, or its content.
// Each part only waits for its own requests, so one slow or failing request can't blank the page.
function Part({ title, requests, children }) {
  const failed = requests.find((request) => request.error);
  const ready = requests.every((request) => request.data !== null);
  return (
    <section>
      {title && <h2>{title}</h2>}
      {failed && <p className="error">{failed.error}</p>}
      {!failed && !ready && <p className="muted">Loading…</p>}
      {!failed && ready && children}
    </section>
  );
}

// Short notes in plain words: what the numbers mean and what we assumed.
function Notes() {
  return (
    <section className="notes" id="notes">
      <h2>Notes</h2>
      <ul>
        <li>All times are UTC (the same as UK time in January).</li>
        <li>
          The forecast shown for each hour is the latest one published at least the chosen number of hours
          before that hour. Later forecasts are never used, because the buyer would not have had them.
        </li>
        <li>
          Forecasts are hourly; actual output is measured every half-hour. Accuracy numbers compare each
          hourly forecast with the actual output for the half-hour starting at that hour.
        </li>
        <li>
          Where no forecast was available in time, the chart shows a break and the hour is left out of the
          averages. In January this happens only late in the evening, at lead times above 42 hours.
        </li>
        <li>
          <strong>Forecast minus actual</strong>: a positive value means the forecast was higher than the
          measured output. We are still checking why the forecast tends to be higher, so this number should
          not yet be read as forecasting error.
        </li>
      </ul>
    </section>
  );
}
