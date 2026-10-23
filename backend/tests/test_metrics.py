import math
from pathlib import Path

import pandas as pd

from app.metrics import (
    metrics_by_generation_level,
    metrics_by_hour_of_day,
    metrics_by_lead_time,
    pair_with_actuals,
    reliability,
    summary_metrics,
)

DATA = Path(__file__).resolve().parents[2] / "data"


# Build a table of pairs by hand: one row per (time, forecast, actual).
def make_pairs(rows):
    df = pd.DataFrame(rows, columns=["startTime", "forecast", "actual"])
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df = df.set_index("startTime")
    df["error"] = df["forecast"] - df["actual"]
    return df


# Four hours with errors +100, -100, +200, -200 against an actual of 1000 MW.
FOUR_HOURS = [
    ("2026-01-10 00:00", 1100, 1000),
    ("2026-01-10 01:00", 900, 1000),
    ("2026-01-10 02:00", 1200, 1000),
    ("2026-01-10 03:00", 800, 1000),
]


def test_pair_matches_on_the_hour_and_error_is_forecast_minus_actual():
    actuals = pd.DataFrame({
        "startTime": pd.to_datetime(["2026-01-10 12:00", "2026-01-10 12:30", "2026-01-10 13:00"], utc=True),
        "generation": [1000, 5000, 1300],
    })
    targets = pd.DatetimeIndex(pd.to_datetime(["2026-01-10 12:00", "2026-01-10 13:00"], utc=True), name="startTime")
    selected = pd.DataFrame({"publishTime": [pd.Timestamp("2026-01-09 09:30", tz="UTC"), pd.NaT],
                             "generation": [1100, None]}, index=targets)
    pairs = pair_with_actuals(selected, actuals)
    assert list(pairs.index) == list(targets)  # the 12:30 actual is not used
    assert pairs.loc[targets[0], "actual"] == 1000
    assert pairs.loc[targets[0], "error"] == 100
    assert math.isnan(pairs.loc[targets[1], "error"])  # gap stays a gap


def test_summary_metrics_by_hand():
    m = summary_metrics(make_pairs(FOUR_HOURS))
    assert m["hours"] == 4 and m["gaps"] == 0
    assert m["mae"] == 150                                  # (100+100+200+200)/4
    assert math.isclose(m["rmse"], 25000 ** 0.5)            # sqrt((1e4+1e4+4e4+4e4)/4)
    assert m["mean_forecast_minus_actual"] == 0
    # Sorted errors -200, -100, 100, 200 with linear interpolation between them.
    assert math.isclose(m["error_p10"], -170)
    assert math.isclose(m["error_p50"], 0)
    assert math.isclose(m["error_p90"], 170)
    assert m["mae_pct_of_mean_actual"] == 15                # 150 / 1000


def test_gaps_are_counted_but_left_out_of_averages():
    rows = FOUR_HOURS + [("2026-01-10 04:00", None, 1000)]
    m = summary_metrics(make_pairs(rows))
    assert m["hours"] == 5 and m["gaps"] == 1
    assert m["mae"] == 150


def test_mean_forecast_minus_actual_sign():
    m = summary_metrics(make_pairs([("2026-01-10 00:00", 1300, 1000), ("2026-01-10 01:00", 1100, 1000)]))
    assert m["mean_forecast_minus_actual"] == 200          # forecast higher -> positive


def test_by_hour_of_day_groups_across_days():
    pairs = make_pairs([
        ("2026-01-10 03:00", 1100, 1000),
        ("2026-01-11 03:00", 1300, 1000),
        ("2026-01-10 05:00", 1000, 1000),
    ])
    table = metrics_by_hour_of_day(pairs).set_index("hour")
    assert len(table) == 24
    assert table.loc[3, "mae"] == 200 and table.loc[3, "hours"] == 2
    assert table.loc[5, "mae"] == 0
    assert table.loc[4, "hours"] == 0


def test_by_generation_level_band_edges():
    pairs = make_pairs([
        ("2026-01-10 00:00", 5099, 4999),    # just under 5 GW
        ("2026-01-10 01:00", 5200, 5000),    # exactly 5 GW goes in the 5-10 band
        ("2026-01-10 02:00", 15300, 15000),
    ])
    table = metrics_by_generation_level(pairs).set_index("level")
    assert table.loc["under 5 GW", "mae"] == 100
    assert table.loc["5-10 GW", "mae"] == 200
    assert table.loc["10-15 GW", "hours"] == 0
    assert table.loc["15 GW and over", "mae"] == 300


def test_by_lead_time_uses_the_forecast_available_at_each_lead():
    t = pd.Timestamp("2026-01-10 12:00", tz="UTC")
    forecasts = pd.DataFrame({
        "publishTime": [t - pd.Timedelta(hours=30), t - pd.Timedelta(hours=2)],
        "startTime": [t, t],
        "generation": [100, 200],
    })
    actuals = pd.DataFrame({"startTime": [t], "generation": [150]})
    table = metrics_by_lead_time(forecasts, actuals, [t], [1, 24]).set_index("lead_hours")
    assert table.loc[1, "mean_forecast_minus_actual"] == 50     # 2 h old forecast: 200
    assert table.loc[24, "mean_forecast_minus_actual"] == -50   # 30 h old forecast: 100


def test_reliability_percentiles():
    actual = list(range(0, 101, 10))                       # 0, 10, ..., 100
    rows = [(f"2026-01-10 {h:02d}:00", a + 5, a) for h, a in enumerate(actual)]
    r = reliability(make_pairs(rows))
    assert math.isclose(r["actual_p10"], 10)
    assert math.isclose(r["actual_p90"], 90)
    assert math.isclose(r["forecast_p10"], 15)


# On the real data, the gap counts must match the numbers quoted in the README.
def test_snapshot_lead_time_table():
    forecasts = pd.read_csv(DATA / "forecasts.csv", parse_dates=["publishTime", "startTime"])
    actuals = pd.read_csv(DATA / "actuals.csv", parse_dates=["startTime"])
    targets = pd.date_range("2026-01-01", "2026-01-31 23:00", freq="h", tz="UTC")
    table = metrics_by_lead_time(forecasts, actuals, targets, range(1, 49)).set_index("lead_hours")
    assert len(table) == 48
    assert (table["hours"] == 744).all()
    assert table.loc[24, "gaps"] == 0
    assert table.loc[48, "gaps"] == 155
    assert (table["mae"] > 0).all()
