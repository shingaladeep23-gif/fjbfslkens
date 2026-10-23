"""FastAPI back end: actual wind, the forecast available at decision time, and accuracy metrics."""
from datetime import date
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.metrics import (
    metrics_by_generation_level,
    metrics_by_hour_of_day,
    metrics_by_lead_time,
    pair_with_actuals,
    summary_metrics,
)
from app.selection import select_forecasts

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
DEFAULT_START = date(2026, 1, 1)
DEFAULT_END = date(2026, 1, 31)
DEFAULT_LEAD_HOURS = 24
MIN_LEAD_HOURS = 1
MAX_LEAD_HOURS = 48
TIME_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


# Read the two snapshot CSVs. Runs once, when the server starts.
def load_data():
    actuals = pd.read_csv(DATA_DIR / "actuals.csv", parse_dates=["startTime"])
    forecasts = pd.read_csv(DATA_DIR / "forecasts.csv", parse_dates=["publishTime", "startTime"])
    return actuals, forecasts


ACTUALS, FORECASTS = load_data()
# First and last day with actuals; requests outside these days are rejected.
FIRST_DAY = ACTUALS["startTime"].min().date()
LAST_DAY = ACTUALS["startTime"].max().date()

app = FastAPI(title="Wind forecast monitor")

# Let the Vite dev server, which runs on a different port, call this API from the browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET"],
)


# FastAPI answers wrongly typed inputs (e.g. lead_hours=abc) with 422.
# We answer every bad input with 400 and one readable sentence instead.
@app.exception_handler(RequestValidationError)
def bad_input_handler(request, error):
    first_problem = error.errors()[0]
    name = first_problem["loc"][-1]
    message = f"Invalid value for '{name}': {first_problem['msg']}"
    return JSONResponse(status_code=400, content={"detail": message})


# Stop with a 400 if the date range is backwards or outside the data we have.
def check_dates(start, end):
    if start > end:
        raise HTTPException(400, f"start ({start}) must not be after end ({end})")
    if start < FIRST_DAY or end > LAST_DAY:
        raise HTTPException(400, f"Dates must be between {FIRST_DAY} and {LAST_DAY}")


# Stop with a 400 if the lead time is outside the 1-48 h the app supports.
def check_lead_hours(lead_hours):
    if lead_hours < MIN_LEAD_HOURS or lead_hours > MAX_LEAD_HOURS:
        raise HTTPException(400, f"lead_hours must be between {MIN_LEAD_HOURS} and {MAX_LEAD_HOURS}, got {lead_hours}")


# Every hour from start 00:00 to end 23:00 UTC. Forecasts only exist on the hour.
def hourly_targets(start, end):
    first = pd.Timestamp(start, tz="UTC")
    last = pd.Timestamp(end, tz="UTC") + pd.Timedelta(hours=23)
    return pd.date_range(first, last, freq="h")


# The selected forecast and the actual side by side for every target hour in the range.
def get_pairs(start, end, lead_hours):
    selected = select_forecasts(FORECASTS, hourly_targets(start, end), lead_hours)
    return pair_with_actuals(selected, ACTUALS)


# Format a timestamp for JSON; a missing one (a gap) becomes null.
def time_to_json(value):
    if pd.isna(value):
        return None
    return value.strftime(TIME_FORMAT)


# Make a number JSON-safe: NaN becomes null, whole numbers become ints (744, not 744.0),
# everything else is rounded to 0.1. Without this, a NaN would make the JSON response fail.
def number_to_json(value):
    if pd.isna(value):
        return None
    if float(value).is_integer():
        return int(value)
    return round(float(value), 1)


# Make every value in a metrics dict JSON-safe. Text labels (e.g. "5-10 GW") pass through.
def dict_to_json(values):
    result = {}
    for key, value in values.items():
        if isinstance(value, str):
            result[key] = value
        else:
            result[key] = number_to_json(value)
    return result


# Turn a metrics table (one row per lead time, hour or band) into a list of JSON-safe dicts.
def table_to_json(table):
    rows = []
    for row in table.to_dict(orient="records"):
        rows.append(dict_to_json(row))
    return rows


# All half-hourly actuals from start 00:00 up to the end of the end day.
def actuals_to_json(start, end):
    first = pd.Timestamp(start, tz="UTC")
    after_last = pd.Timestamp(end, tz="UTC") + pd.Timedelta(days=1)
    in_range = ACTUALS[(ACTUALS["startTime"] >= first) & (ACTUALS["startTime"] < after_last)]
    rows = []
    for _, row in in_range.iterrows():
        rows.append({"time": time_to_json(row["startTime"]), "generation": number_to_json(row["generation"])})
    return rows


# The hourly forecast available at decision time; generation and publishTime are null for a gap.
def forecasts_to_json(start, end, lead_hours):
    selected = select_forecasts(FORECASTS, hourly_targets(start, end), lead_hours)
    rows = []
    for time, row in selected.iterrows():
        rows.append({
            "time": time_to_json(time),
            "generation": number_to_json(row["generation"]),
            "publishTime": time_to_json(row["publishTime"]),
        })
    return rows


# Chart data: half-hourly actuals plus the hourly forecast a buyer had lead_hours before.
@app.get("/api/series")
def get_series(start: date = DEFAULT_START, end: date = DEFAULT_END, lead_hours: int = DEFAULT_LEAD_HOURS):
    check_dates(start, end)
    check_lead_hours(lead_hours)
    return {
        "lead_hours": lead_hours,
        "actuals": actuals_to_json(start, end),
        "forecasts": forecasts_to_json(start, end, lead_hours),
    }


# Headline accuracy numbers for one lead time over the date range.
@app.get("/api/metrics")
def get_metrics(start: date = DEFAULT_START, end: date = DEFAULT_END, lead_hours: int = DEFAULT_LEAD_HOURS):
    check_dates(start, end)
    check_lead_hours(lead_hours)
    return dict_to_json(summary_metrics(get_pairs(start, end, lead_hours)))


# Accuracy at every lead time from 1 to 48 h, over the same target hours.
@app.get("/api/metrics/by-lead")
def get_metrics_by_lead(start: date = DEFAULT_START, end: date = DEFAULT_END):
    check_dates(start, end)
    leads = range(MIN_LEAD_HOURS, MAX_LEAD_HOURS + 1)
    table = metrics_by_lead_time(FORECASTS, ACTUALS, hourly_targets(start, end), leads)
    return table_to_json(table)


# Accuracy for each hour of the day (UTC) at one lead time.
@app.get("/api/metrics/by-hour")
def get_metrics_by_hour(start: date = DEFAULT_START, end: date = DEFAULT_END, lead_hours: int = DEFAULT_LEAD_HOURS):
    check_dates(start, end)
    check_lead_hours(lead_hours)
    return table_to_json(metrics_by_hour_of_day(get_pairs(start, end, lead_hours)))


# Accuracy for each band of actual generation at one lead time.
@app.get("/api/metrics/by-level")
def get_metrics_by_level(start: date = DEFAULT_START, end: date = DEFAULT_END, lead_hours: int = DEFAULT_LEAD_HOURS):
    check_dates(start, end)
    check_lead_hours(lead_hours)
    return table_to_json(metrics_by_generation_level(get_pairs(start, end, lead_hours)))
