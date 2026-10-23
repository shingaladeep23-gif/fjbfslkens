# Wind forecast monitor

Shows the national wind generation forecast a GB day-ahead buyer could actually see when they made each January 2026 purchase decision, and measures how accurate it was. Data: Elexon BMRS.

> Built with help from AI tools (Claude Code).

**Live app: https://fjbfslkens.vercel.app**

## Layout

| Path | What it is |
|---|---|
| `scripts/fetch_data.py` | Refreshes the snapshot in `data/` from the BMRS API |
| `scripts/fetch_december.py` | Downloads December 2025 into `analysis/data/december/` (same cleaning), used only by the notebook |
| `data/actuals.csv` | FUELHH wind outturn, half-hourly, 1 Jan – 3 Feb 2026 |
| `data/forecasts.csv` | WINDFOR forecasts published 30 Dec 2025 – 31 Jan 2026 |
| `analysis/wind_forecast_analysis.ipynb` | The analysis behind the findings below, saved with its outputs so it reads on GitHub |
| `analysis/data/december/` | December 2025 actuals and forecasts, kept out of `data/` so the app stays January-only |
| `backend/app/selection.py` | The rule that picks the forecast available at decision time |
| `backend/app/metrics.py` | Accuracy metrics (error = forecast − actual) and breakdowns by lead time, hour and generation level |
| `backend/app/main.py` | FastAPI app: loads the CSVs once and serves the `/api/...` endpoints |
| `backend/tests/` | pytest suite |
| `.github/workflows/tests.yml` | GitHub Actions on every push: pytest and Playwright, plus a job that builds the Docker images and checks the API through nginx |
| `api/index.py`, `vercel.json`, `requirements.txt`, `.python-version` | Vercel deployment: the same FastAPI app as a Python function, the Vite site, and `/api` routed to the function on one domain |
| `docker-compose.yml` | Runs the whole app in two containers: `docker compose up --build` |
| `backend/Dockerfile`, `backend/Dockerfile.dockerignore` | API image: Python slim, the app code and the January data, uvicorn with 4 workers |
| `frontend/Dockerfile`, `frontend/nginx.conf`, `frontend/.dockerignore` | Page image: built with Node, served by nginx, which passes `/api` on to the API |
| `frontend/` | React page (Vite, plain JavaScript, Recharts): `src/App.jsx` loads the data, `src/components/` has one file per part of the page, `src/styles.css` is the only stylesheet, `e2e/` holds the Playwright tests (one file per theme: load, controls, charts, failures, layout; shared helpers in `helpers.js`) |

## How to start

### With Docker (recommended)

Needs only Docker. From the repo root:

```
docker compose up --build
```

Open http://localhost:8080. nginx serves the page and passes `/api` on to the FastAPI container, so it's one site, just like in development and production. The first build takes about a minute and a half; stop with `Ctrl+C`, or `docker compose down`.

### Locally, without Docker

Needs Python 3.11 or newer (CI and Docker use 3.12; the pinned pandas 3.1 needs 3.11+) and Node 22.

#### The API


```
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Interactive docs: http://127.0.0.1:8000/docs. All endpoints take `start` and `end` as dates (`YYYY-MM-DD`, whole UTC days, both included, default 1–31 Jan 2026). Where it applies, they also take `lead_hours` (1–48, default 24) and `mode`: `lead` (default, decide `lead_hours` before each hour) or `auction` (decide every hour of a day at 09:50 the day before; `lead_hours` is then ignored). Bad inputs get a 400 with a one-line message.

| Endpoint | Returns |
|---|---|
| `GET /api/series` | Half-hourly actuals and the hourly forecast available `lead_hours` before each target (`null` = gap) |
| `GET /api/metrics` | MAE, RMSE, mean forecast minus actual, error P10/P50/P90, MAE % of mean actual, hours and gaps, plus P10/P50/P90 of actual and forecast output |
| `GET /api/metrics/by-lead` | The same metrics for every lead time from 1 to 48 h |
| `GET /api/metrics/by-hour` | The same metrics for each hour of the day (UTC) |
| `GET /api/metrics/by-level` | The same metrics for each band of actual generation |

#### The front end

Start the API first (see above, port 8000), then in a second terminal:

```
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. In development, Vite passes every `/api` request on to the API on port 8000 (see `frontend/vite.config.js`), so the browser sees one site and no CORS setup is needed.

## Deployment (Vercel)

The live app runs on Vercel, built from this repo on every push to `main`:

- `vercel.json` builds `frontend/` with Vite into a static site and rewrites `/api/*` to one Python function, `api/index.py`, which imports the same FastAPI app. Page and API share one domain, so there is no CORS.
- The function's packages are listed in the root `requirements.txt` with the same pinned versions as `backend/requirements.txt` (a test checks they match). The January CSVs in `data/` are bundled with the function.
- The function runs in Vercel's `iad1` region (US East). A cold start takes about 2.5 s; warm answers take about 0.4–0.8 s from Europe or Asia, most of that the network distance. Results are cached per function instance.

To deploy your own copy: `npx vercel login`, then `npx vercel deploy --prod` from a clean clone of the repo.

## Running the tests

Back-end unit tests:

```
cd backend
pip install -r requirements.txt
python -m pytest
```

End-to-end browser tests (Playwright, Chromium, about 30 tests, under a minute locally). One command starts the API and the front end itself, then runs the tests:

```
cd frontend
npm install
npx playwright install chromium
npx playwright test
```

To run the same browser tests against an app that is already running (for example the Docker one), point them at it; Playwright then starts no servers of its own:

```
cd frontend
BASE_URL=http://localhost:8080 npx playwright test
BASE_URL=https://fjbfslkens.vercel.app npx playwright test   # the live site
```

Both sets run on every push in GitHub Actions (`.github/workflows/tests.yml`), along with a job that builds the Docker images and checks the API through nginx.

## Findings

Full analysis, with charts and the code behind every number: [`analysis/wind_forecast_analysis.ipynb`](analysis/wind_forecast_analysis.ipynb). Its numbers match the app's for the same settings; a check cell compares them.

- **Accuracy fades slowly with lead time.** The typical miss (MAE) is 1,801 MW one hour ahead, 2,050 MW a day ahead and 2,380 MW two days ahead (16%, 18% and 21% of average output). It worsens fastest between 24 and 36 hours ahead.
- **Most of the miss is a steady offset.** The forecast is about 1.6–2.0 GW above measured output at every lead time, even one hour ahead, and the gap grows with wind. Output never went above 17.8 GW in January, while the forecast often did. This is consistent with curtailment or a difference in which wind farms each dataset covers; it is not proven.
- **A simple correction helps, tested honestly.** Subtracting the average offset learned from December 2025 alone cuts January's day-ahead typical miss from 2,050 MW to 1,343 MW (−35%).
- **What a buyer can count on.** Learned from December: count on about 73% of the day-ahead forecast. In January, output reached that level in 89% of hours, close to the 9-in-10 target, though less reliably when the forecast is very low or very high.

To rerun the notebook: `pip install -r analysis/requirements.txt`, then open it from the `analysis/` folder and run all cells.

## Assumptions

- **Time zone.** Everything is UTC. In January, UK local time equals UTC.
- **Forecast available at decision time.** For target time T and lead time H, use the forecast with the latest `publishTime ≤ T − H` among forecasts for T. If none exists, the slot is a gap. A gap is never filled with a later forecast, because that would use information the buyer did not have.
- **Default lead time: 24 h.** Nord Pool's N2EX GB day-ahead auction closes at 09:50 UK time the day before delivery ([Nord Pool](https://support.nordpoolgroup.com/support/solutions/articles/8000088463-about-the-day-ahead-gb-auction)). The next day's hours are then about 14–38 h after that decision, so 24 h is close to the middle. Buyers may also trade in other auctions or at other times, so the slider covers 1–48 h.
- **Day-ahead auction mode.** The page can also pick forecasts the way a day-ahead buyer actually decides: every hour of day D uses the latest forecast published by **09:50 on day D−1**, when Nord Pool's N2EX GB day-ahead auction closes. Only the decision time changes; the rule (latest `publishTime ≤ decision time`) is the same. January is GMT, so 09:50 UK time is 09:50 UTC. In summer (BST, UTC+1) the auction would close at 08:50 UTC, and days would start at UK midnight (23:00 UTC), so the code would need a UK time zone conversion.
- **Hourly forecast vs half-hourly actuals.** WINDFOR is hourly and FUELHH is half-hourly. Accuracy metrics compare each forecast only with the actual at the same hour (e.g. the 14:00 forecast with the 14:00–14:30 actual). The :30 actuals are left out of the metrics rather than compared with an interpolated forecast nobody published. The chart still draws every half-hourly actual and draws the forecast as hourly points joined by a line.
- **Error sign.** Error = forecast − actual, so a positive value means the forecast was higher. The average is reported as "mean forecast minus actual", not as bias, until the coverage and curtailment question is checked.
- **Gaps in metrics.** Hours with no forecast are counted and reported, but left out of averages.
- **Same January hours at every lead time.** The brief says "decisions made in January"; we score the same January target hours at every lead so each lead is compared on the same weather, which means early-January targets at long leads use forecasts published on 30–31 Dec.
- **Past hours in a publish.** Each WINDFOR publish restates a few hours before its publish time. Those rows are dropped; they are not forecasts.

## Data notes

- **Publish schedule.** WINDFOR was published 8 times a day in January 2026, at 02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30 and 22:30 UTC. The longest wait between two publishes is 4 h. One publish was off schedule: 12:25 instead of 11:30 (one day out of 33). The API docs list the times as 03:30 … 23:30, exactly one hour later than what the data shows.
- **Forecast horizon.** Every publish runs until 21:00 two days later (Elexon's interface spec: "21:00 on the current day to 21:00 on day+2"). So the real lead time ranges from 0.5 to 66.5 h, but late-evening targets cannot have a forecast at very long leads. Of the 744 January target hours, the number with no forecast is: 0 up to H = 42 h, 31 at 44 h, 93 at 46 h, 155 at 48 h (all between 22:00 and 02:00).
- **Effective lead is longer than H.** Because publishes come every 2–4 h, the forecast picked at H = 24 h was on average (median) made 25.5 h before the target, and at most 27.5 h.
- **Coverage.** WINDFOR covers "wind farms which are visible to the ESO and have operational metering" (BMRS API spec). FUELHH is also built from operational metering. Both leave out small embedded wind farms that have no operational metering.
