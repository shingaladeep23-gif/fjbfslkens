"""Refresh the data snapshot in data/ from the Elexon BMRS API.

Usage: python scripts/fetch_data.py

Writes data/actuals.csv (FUELHH, fuelType=WIND) and data/forecasts.csv (WINDFOR).
All times are UTC.
"""
from pathlib import Path

import pandas as pd
import requests

API = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
DATA = Path(__file__).resolve().parent.parent / "data"

# Target times we keep: January decisions plus up to 48 h ahead.
TARGET_FROM = pd.Timestamp("2026-01-01", tz="UTC")
TARGET_TO = pd.Timestamp("2026-02-04", tz="UTC")  # exclusive
# Forecasts that could be "latest available" for a decision made in January.
PUBLISH_FROM = "2025-12-30T00:00:00Z"
PUBLISH_TO = "2026-02-01T00:00:00Z"


def get(dataset: str, **params) -> pd.DataFrame:
    r = requests.get(f"{API}/{dataset}/stream", params=params, timeout=120)
    r.raise_for_status()
    df = pd.DataFrame(r.json())
    for col in ("startTime", "publishTime"):
        df[col] = pd.to_datetime(df[col], utc=True)
    return df


def fetch_actuals() -> pd.DataFrame:
    # Settlement dates are UK local dates; in January that equals UTC.
    # Start a day early so the 00:00 UTC slot is never cut off.
    df = get("FUELHH", settlementDateFrom="2025-12-31", settlementDateTo="2026-02-03", fuelType="WIND")
    df = df.dropna(subset=["generation"])
    # Keep the latest revision if a slot was published more than once.
    df = df.sort_values("publishTime").drop_duplicates("startTime", keep="last")
    df = df[(df.startTime >= TARGET_FROM) & (df.startTime < TARGET_TO)]
    return df[["startTime", "generation"]].sort_values("startTime").reset_index(drop=True)


def fetch_forecasts() -> pd.DataFrame:
    df = get("WINDFOR", publishDateTimeFrom=PUBLISH_FROM, publishDateTimeTo=PUBLISH_TO)
    df = df.dropna(subset=["generation"])
    df = df.drop_duplicates(["publishTime", "startTime"], keep="last")
    # Each publish also restates a few past hours; those are not forecasts.
    df = df[df.startTime >= df.publishTime]
    df = df[(df.startTime >= TARGET_FROM) & (df.startTime < TARGET_TO)]
    return df[["publishTime", "startTime", "generation"]].sort_values(["startTime", "publishTime"]).reset_index(drop=True)


def summarise(name: str, df: pd.DataFrame, step: str) -> None:
    print(f"\n{name}: {len(df)} rows")
    for col in ("startTime", "publishTime"):
        if col in df:
            print(f"  {col}: {df[col].min()} -> {df[col].max()}")
    print(f"  generation MW: min {df.generation.min()}, mean {df.generation.mean():.0f}, max {df.generation.max()}")
    slots = df.startTime.drop_duplicates()
    expected = pd.date_range(slots.min(), slots.max(), freq=step)
    missing = expected.difference(slots)
    print(f"  distinct startTimes: {len(slots)} of {len(expected)} expected at {step}; missing: {len(missing)}")
    if len(missing):
        print("   ", list(missing[:10]))


def main() -> None:
    DATA.mkdir(exist_ok=True)
    actuals, forecasts = fetch_actuals(), fetch_forecasts()
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    actuals.to_csv(DATA / "actuals.csv", index=False, date_format=fmt)
    forecasts.to_csv(DATA / "forecasts.csv", index=False, date_format=fmt)
    summarise("actuals (FUELHH WIND)", actuals, "30min")
    summarise("forecasts (WINDFOR)", forecasts, "1h")
    print(f"  distinct publishTimes: {forecasts.publishTime.nunique()}")
    lead_h = (forecasts.startTime - forecasts.publishTime).dt.total_seconds() / 3600
    print(f"  lead time h: min {lead_h.min():.1f}, max {lead_h.max():.1f}")


if __name__ == "__main__":
    main()
