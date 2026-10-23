"""Refresh the data snapshot in data/ from the Elexon BMRS API.

Usage: python scripts/fetch_data.py

Writes data/actuals.csv (FUELHH, fuelType=WIND) and data/forecasts.csv (WINDFOR).
All times are UTC. scripts/fetch_december.py reuses these functions for December.
"""
from pathlib import Path

import pandas as pd
import requests

API = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
TIME_FORMAT = "%Y-%m-%dT%H:%M:%SZ"

# The dates to download for the January snapshot the app uses.
JANUARY = {
    # Target times we keep: January decisions plus up to 48 h ahead (end is exclusive).
    "target_from": "2026-01-01",
    "target_to": "2026-02-04",
    # Settlement dates are UK local dates; in winter they equal UTC dates.
    # Start a day early so the 00:00 UTC slot on the first day is never cut off.
    "settlement_from": "2025-12-31",
    "settlement_to": "2026-02-03",
    # Forecasts that could be the "latest available" one for a decision in the month.
    "publish_from": "2025-12-30T00:00:00Z",
    "publish_to": "2026-02-01T00:00:00Z",
}


# Download one BMRS dataset and return it as a table with UTC timestamps.
def download(dataset, params):
    url = f"{API}/{dataset}/stream"
    response = requests.get(url, params=params, timeout=120)
    response.raise_for_status()  # stop with an error if the API call failed
    df = pd.DataFrame(response.json())
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True)
    return df


# Keep only rows whose target time falls inside the window.
def keep_target_window(df, window):
    target_from = pd.Timestamp(window["target_from"], tz="UTC")
    target_to = pd.Timestamp(window["target_to"], tz="UTC")
    inside = (df["startTime"] >= target_from) & (df["startTime"] < target_to)
    return df[inside]


# Download half-hourly wind actuals and keep one value per half-hour.
def fetch_actuals(window):
    params = {"settlementDateFrom": window["settlement_from"], "settlementDateTo": window["settlement_to"], "fuelType": "WIND"}
    df = download("FUELHH", params)
    df = df.dropna(subset=["generation"])

    # If a half-hour was published more than once, keep the newest version.
    df = df.sort_values("publishTime")
    df = df.drop_duplicates(subset="startTime", keep="last")

    df = keep_target_window(df, window)
    df = df[["startTime", "generation"]].sort_values("startTime")
    return df.reset_index(drop=True)


# Download every wind forecast published in the window and clean it.
def fetch_forecasts(window):
    params = {"publishDateTimeFrom": window["publish_from"], "publishDateTimeTo": window["publish_to"]}
    df = download("WINDFOR", params)
    df = df.dropna(subset=["generation"])
    df = df.drop_duplicates(subset=["publishTime", "startTime"], keep="last")

    # Each publish also restates a few past hours; those are not forecasts.
    df = df[df["startTime"] >= df["publishTime"]]

    df = keep_target_window(df, window)
    df = df[["publishTime", "startTime", "generation"]].sort_values(["startTime", "publishTime"])
    return df.reset_index(drop=True)


# Print row counts, time ranges and missing slots so the snapshot can be checked by eye.
def print_summary(name, df, step):
    print(f"\n{name}: {len(df)} rows")
    print(f"  startTime: {df['startTime'].min()} -> {df['startTime'].max()}")
    if "publishTime" in df.columns:
        print(f"  publishTime: {df['publishTime'].min()} -> {df['publishTime'].max()}")
    gen = df["generation"]
    print(f"  generation MW: min {gen.min()}, mean {gen.mean():.0f}, max {gen.max()}")

    # Compare the target times we have against a complete, regular time grid.
    have = pd.DatetimeIndex(df["startTime"].unique())
    expected = pd.date_range(have.min(), have.max(), freq=step)
    missing = expected.difference(have)
    print(f"  distinct startTimes: {len(have)} of {len(expected)} expected at {step}; missing: {len(missing)}")
    if len(missing) > 0:
        print("  first missing:", list(missing[:10]))


# Fetch both datasets for one window, save them as CSV in the folder and print a summary.
def save_snapshot(window, folder):
    folder.mkdir(parents=True, exist_ok=True)
    actuals = fetch_actuals(window)
    forecasts = fetch_forecasts(window)
    actuals.to_csv(folder / "actuals.csv", index=False, date_format=TIME_FORMAT)
    forecasts.to_csv(folder / "forecasts.csv", index=False, date_format=TIME_FORMAT)

    print_summary("actuals (FUELHH WIND)", actuals, "30min")
    print_summary("forecasts (WINDFOR)", forecasts, "1h")
    print(f"  distinct publishTimes: {forecasts['publishTime'].nunique()}")
    lead_hours = (forecasts["startTime"] - forecasts["publishTime"]).dt.total_seconds() / 3600
    print(f"  lead time h: min {lead_hours.min():.1f}, max {lead_hours.max():.1f}")


if __name__ == "__main__":
    save_snapshot(JANUARY, DATA_DIR)
