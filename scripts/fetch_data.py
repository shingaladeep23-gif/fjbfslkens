"""Refresh the data snapshot in data/ from the Elexon BMRS API.

Usage: python scripts/fetch_data.py

Writes data/actuals.csv (FUELHH, fuelType=WIND) and data/forecasts.csv (WINDFOR).
All times are UTC.
"""
from pathlib import Path

import pandas as pd
import requests

API = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
TIME_FORMAT = "%Y-%m-%dT%H:%M:%SZ"

# Target times we keep: January decisions plus up to 48 h ahead.
TARGET_FROM = pd.Timestamp("2026-01-01", tz="UTC")
TARGET_TO = pd.Timestamp("2026-02-04", tz="UTC")  # exclusive
# Forecasts that could be the "latest available" one for a decision made in January.
PUBLISH_FROM = "2025-12-30T00:00:00Z"
PUBLISH_TO = "2026-02-01T00:00:00Z"


# Download one BMRS dataset and return it as a table with UTC timestamps.
def download(dataset, params):
    url = f"{API}/{dataset}/stream"
    response = requests.get(url, params=params, timeout=120)
    response.raise_for_status()  # stop with an error if the API call failed
    df = pd.DataFrame(response.json())
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True)
    return df


# Keep only rows whose target time falls inside our analysis window.
def keep_target_window(df):
    inside = (df["startTime"] >= TARGET_FROM) & (df["startTime"] < TARGET_TO)
    return df[inside]


# Download half-hourly wind actuals and keep one value per half-hour.
def fetch_actuals():
    # Settlement dates are UK local dates; in January that equals UTC.
    # Start a day early so the 00:00 UTC slot on 1 Jan is never cut off.
    params = {"settlementDateFrom": "2025-12-31", "settlementDateTo": "2026-02-03", "fuelType": "WIND"}
    df = download("FUELHH", params)
    df = df.dropna(subset=["generation"])

    # If a half-hour was published more than once, keep the newest version.
    df = df.sort_values("publishTime")
    df = df.drop_duplicates(subset="startTime", keep="last")

    df = keep_target_window(df)
    df = df[["startTime", "generation"]].sort_values("startTime")
    return df.reset_index(drop=True)


# Download every wind forecast published around January and clean it.
def fetch_forecasts():
    params = {"publishDateTimeFrom": PUBLISH_FROM, "publishDateTimeTo": PUBLISH_TO}
    df = download("WINDFOR", params)
    df = df.dropna(subset=["generation"])
    df = df.drop_duplicates(subset=["publishTime", "startTime"], keep="last")

    # Each publish also restates a few past hours; those are not forecasts.
    df = df[df["startTime"] >= df["publishTime"]]

    df = keep_target_window(df)
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


# Fetch both datasets, save them as CSV and print a summary.
def main():
    DATA_DIR.mkdir(exist_ok=True)
    actuals = fetch_actuals()
    forecasts = fetch_forecasts()
    actuals.to_csv(DATA_DIR / "actuals.csv", index=False, date_format=TIME_FORMAT)
    forecasts.to_csv(DATA_DIR / "forecasts.csv", index=False, date_format=TIME_FORMAT)

    print_summary("actuals (FUELHH WIND)", actuals, "30min")
    print_summary("forecasts (WINDFOR)", forecasts, "1h")
    print(f"  distinct publishTimes: {forecasts['publishTime'].nunique()}")
    lead_hours = (forecasts["startTime"] - forecasts["publishTime"]).dt.total_seconds() / 3600
    print(f"  lead time h: min {lead_hours.min():.1f}, max {lead_hours.max():.1f}")


if __name__ == "__main__":
    main()
