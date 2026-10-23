from pathlib import Path

import pandas as pd
import pytest

from app.selection import select_forecasts

T = pd.Timestamp("2026-01-10 12:00", tz="UTC")


def fc(rows):
    """rows: (publishTime, startTime, generation) with naive UTC strings."""
    df = pd.DataFrame(rows, columns=["publishTime", "startTime", "generation"])
    for col in ("publishTime", "startTime"):
        df[col] = pd.to_datetime(df[col], utc=True)
    return df


def pick(rows, lead, targets=(T,)):
    return select_forecasts(fc(rows), list(targets), lead)


def test_latest_eligible_publish_wins():
    out = pick([
        ("2026-01-09 07:30", "2026-01-10 12:00", 100),
        ("2026-01-09 11:30", "2026-01-10 12:00", 200),  # latest <= T-24h
        ("2026-01-09 15:30", "2026-01-10 12:00", 300),  # too late for 24 h ahead
    ], lead=24)
    assert out.loc[T, "generation"] == 200
    assert out.loc[T, "publishTime"] == pd.Timestamp("2026-01-09 11:30", tz="UTC")


def test_exact_boundary_is_included():
    out = pick([
        ("2026-01-09 09:30", "2026-01-10 12:00", 100),
        ("2026-01-09 12:00", "2026-01-10 12:00", 200),  # publishTime == T-24h exactly
    ], lead=24)
    assert out.loc[T, "generation"] == 200


def test_one_minute_after_boundary_is_excluded():
    out = pick([
        ("2026-01-09 09:30", "2026-01-10 12:00", 100),
        ("2026-01-09 12:01", "2026-01-10 12:00", 200),
    ], lead=24)
    assert out.loc[T, "generation"] == 100


def test_no_eligible_forecast_is_a_gap_not_a_later_forecast():
    out = pick([("2026-01-10 02:30", "2026-01-10 12:00", 100)], lead=24)
    assert pd.isna(out.loc[T, "generation"])
    assert pd.isna(out.loc[T, "publishTime"])


def test_target_with_no_forecasts_at_all_is_a_gap():
    other = T + pd.Timedelta(hours=1)
    out = pick([("2026-01-09 02:30", "2026-01-10 12:00", 100)], lead=24, targets=(T, other))
    assert list(out.index) == [T, other]
    assert out.loc[T, "generation"] == 100
    assert pd.isna(out.loc[other, "generation"])


def test_forecasts_for_other_targets_are_ignored():
    out = pick([
        ("2026-01-09 02:30", "2026-01-10 12:00", 100),
        ("2026-01-09 07:30", "2026-01-10 13:00", 999),  # later publish, different target
    ], lead=24)
    assert out.loc[T, "generation"] == 100


def test_several_rows_with_the_same_publish_time_pick_the_last_one():
    out = pick([
        ("2026-01-09 07:30", "2026-01-10 12:00", 100),
        ("2026-01-09 07:30", "2026-01-10 12:00", 150),
    ], lead=24)
    assert out.loc[T, "generation"] == 150


def test_shorter_lead_sees_newer_forecast():
    rows = [
        ("2026-01-09 07:30", "2026-01-10 12:00", 100),
        ("2026-01-10 09:30", "2026-01-10 12:00", 200),
    ]
    assert pick(rows, lead=24).loc[T, "generation"] == 100
    assert pick(rows, lead=1).loc[T, "generation"] == 200


def test_input_order_does_not_matter():
    rows = [
        ("2026-01-09 11:30", "2026-01-10 12:00", 200),
        ("2026-01-08 22:30", "2026-01-10 12:00", 50),
        ("2026-01-09 07:30", "2026-01-10 12:00", 100),
    ]
    assert pick(rows, lead=24).loc[T, "generation"] == 200


SNAPSHOT = Path(__file__).resolve().parents[2] / "data" / "forecasts.csv"


@pytest.mark.skipif(not SNAPSHOT.exists(), reason="no data snapshot")
@pytest.mark.parametrize("lead", [1, 24, 48])
def test_snapshot_never_leaks_future_forecasts(lead):
    df = pd.read_csv(SNAPSHOT, parse_dates=["publishTime", "startTime"])
    targets = pd.date_range("2026-01-02", "2026-01-31 23:00", freq="h", tz="UTC")
    out = select_forecasts(df, targets, lead).dropna()
    assert len(out) > 0
    assert (out.publishTime <= out.index - pd.Timedelta(hours=lead)).all()
