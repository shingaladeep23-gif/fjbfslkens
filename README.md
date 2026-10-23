# Wind forecast monitor

Shows the national wind generation forecast a GB day-ahead buyer could actually see when they made each January 2026 purchase decision, and measures how accurate it was. Data: Elexon BMRS.

> Built with help from AI tools (Claude Code).

## Layout

| Path | What it is |
|---|---|
| `scripts/fetch_data.py` | Refreshes the snapshot in `data/` from the BMRS API |
| `data/actuals.csv` | FUELHH wind outturn, half-hourly, 1 Jan – 3 Feb 2026 |
| `data/forecasts.csv` | WINDFOR forecasts published 30 Dec 2025 – 31 Jan 2026 |
| `backend/app/selection.py` | The rule that picks the forecast available at decision time |
| `backend/app/metrics.py` | Accuracy metrics (error = forecast − actual) and breakdowns by lead time, hour and generation level |
| `backend/tests/` | pytest suite |

## Running the tests

```
cd backend
pip install -r requirements.txt
python -m pytest
```

## Assumptions

- **Time zone.** Everything is UTC. In January, UK local time equals UTC.
- **Forecast available at decision time.** For target time T and lead time H, use the forecast with the latest `publishTime ≤ T − H` among forecasts for T. If none exists, the slot is a gap. A gap is never filled with a later forecast, because that would use information the buyer did not have.
- **Default lead time: 24 h.** The GB day-ahead auction closes around 11:00 the day before delivery, so the next day's half-hours sit roughly 13–37 h after the decision. 24 h is the middle of that range. The slider covers 1–48 h.
- **Hourly forecast vs half-hourly actuals.** WINDFOR is hourly and FUELHH is half-hourly. Accuracy metrics compare each forecast only with the actual at the same hour (e.g. the 14:00 forecast with the 14:00–14:30 actual). The :30 actuals are left out of the metrics rather than compared with an interpolated forecast nobody published. The chart still draws every half-hourly actual and draws the forecast as hourly points joined by a line.
- **Error sign.** Error = forecast − actual, so a positive value means the forecast was higher. The average is reported as "mean forecast minus actual", not as bias, until the coverage and curtailment question is checked.
- **Gaps in metrics.** Hours with no forecast are counted and reported, but left out of averages.
- **Past hours in a publish.** Each WINDFOR publish restates a few hours before its publish time. Those rows are dropped; they are not forecasts.

## Data notes

- **Publish schedule.** WINDFOR was published 8 times a day in January 2026, at 02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30 and 22:30 UTC. The longest wait between two publishes is 4 h. One publish was off schedule: 12:25 instead of 11:30 (one day out of 33). The API docs list the times as 03:30 … 23:30, exactly one hour later than what the data shows.
- **Forecast horizon.** Every publish runs until 21:00 two days later (Elexon's interface spec: "21:00 on the current day to 21:00 on day+2"). So the real lead time ranges from 0.5 to 66.5 h, but late-evening targets cannot have a forecast at very long leads. Of the 744 January target hours, the number with no forecast is: 0 up to H = 42 h, 31 at 44 h, 93 at 46 h, 155 at 48 h (all between 22:00 and 02:00).
- **Effective lead is longer than H.** Because publishes come every 2–4 h, the forecast picked at H = 24 h was on average (median) made 25.5 h before the target, and at most 27.5 h.
- **Coverage.** WINDFOR covers "wind farms which are visible to the ESO and have operational metering" (BMRS API spec). FUELHH is also built from operational metering. Both leave out small embedded wind farms that have no operational metering.
