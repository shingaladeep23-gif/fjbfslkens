import pandas as pd
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# Call the API and check it answered 200; return the JSON body.
def get_ok(url):
    response = client.get(url)
    assert response.status_code == 200, response.text
    return response.json()


# Call the API, check it answered 400, and return the error message.
def get_400(url):
    response = client.get(url)
    assert response.status_code == 400, response.text
    return response.json()["detail"]


def test_series_one_day():
    body = get_ok("/api/series?start=2026-01-10&end=2026-01-10&lead_hours=24")
    assert body["lead_hours"] == 24
    assert len(body["actuals"]) == 48           # every half-hour
    assert len(body["forecasts"]) == 24         # every hour
    assert body["actuals"][1]["time"] == "2026-01-10T00:30:00Z"
    for row in body["forecasts"]:
        target = pd.Timestamp(row["time"])
        published = pd.Timestamp(row["publishTime"])
        assert published <= target - pd.Timedelta(hours=24)   # no future information


def test_series_gaps_are_null():
    body = get_ok("/api/series?start=2026-01-10&end=2026-01-10&lead_hours=48")
    by_time = {row["time"]: row for row in body["forecasts"]}
    assert by_time["2026-01-10T23:00:00Z"]["generation"] is None
    assert by_time["2026-01-10T23:00:00Z"]["publishTime"] is None
    assert by_time["2026-01-10T12:00:00Z"]["generation"] is not None


def test_metrics_january_default():
    body = get_ok("/api/metrics")              # defaults: January, 24 h
    assert body["hours"] == 744
    assert body["gaps"] == 0
    assert body["mae"] == 2050.2
    assert body["mean_forecast_minus_actual"] == 1854.2
    assert body["actual_p10"] == 5608.7         # reliability is included too


def test_metrics_with_only_gaps_returns_nulls_not_an_error():
    body = get_ok("/api/metrics?start=2026-02-03&end=2026-02-03&lead_hours=24")
    assert body["hours"] == 24 and body["gaps"] == 24
    assert body["mae"] is None


def test_metrics_by_lead():
    rows = get_ok("/api/metrics/by-lead")
    assert [row["lead_hours"] for row in rows] == list(range(1, 49))
    assert rows[47]["gaps"] == 155              # 48 h lead, see README


def test_metrics_by_hour_and_level():
    hours = get_ok("/api/metrics/by-hour?lead_hours=6")
    assert [row["hour"] for row in hours] == list(range(24))
    levels = get_ok("/api/metrics/by-level?lead_hours=6")
    assert [row["level"] for row in levels] == ["under 5 GW", "5-10 GW", "10-15 GW", "15 GW and over"]


def test_bad_lead_hours():
    assert "between 1 and 48" in get_400("/api/series?lead_hours=0")
    assert "between 1 and 48" in get_400("/api/metrics?lead_hours=49")
    assert "lead_hours" in get_400("/api/metrics?lead_hours=abc")


def test_bad_dates():
    assert "must not be after" in get_400("/api/metrics?start=2026-01-05&end=2026-01-02")
    assert "between 2026-01-01 and 2026-02-03" in get_400("/api/series?start=2025-12-01&end=2026-01-02")
    assert "between 2026-01-01 and 2026-02-03" in get_400("/api/metrics/by-lead?start=2026-01-01&end=2026-03-01")
    assert "start" in get_400("/api/metrics?start=2026-13-01")


# ---- mode=auction: decisions at 09:50 UTC the day before ----

def test_series_auction_mode_uses_forecasts_from_before_0950_the_day_before():
    body = get_ok("/api/series?start=2026-01-10&end=2026-01-11&mode=auction")
    assert body["mode"] == "auction"
    assert len(body["forecasts"]) == 48
    for row in body["forecasts"]:
        target = pd.Timestamp(row["time"])
        decision = target.normalize() - pd.Timedelta(days=1) + pd.Timedelta(hours=9, minutes=50)
        assert row["generation"] is not None
        assert pd.Timestamp(row["publishTime"]) <= decision


def test_metrics_auction_mode_ignores_lead_hours():
    january = get_ok("/api/metrics?mode=auction")
    assert january["hours"] == 744 and january["gaps"] == 0
    assert get_ok("/api/metrics?mode=auction&lead_hours=1") == january
    assert get_ok("/api/metrics?mode=auction&lead_hours=48") == january


def test_default_mode_is_lead():
    assert get_ok("/api/metrics") == get_ok("/api/metrics?mode=lead")
    assert get_ok("/api/metrics") != get_ok("/api/metrics?mode=auction")


def test_auction_mode_works_on_every_endpoint_that_selects_forecasts():
    assert len(get_ok("/api/metrics/by-hour?mode=auction")) == 24
    assert len(get_ok("/api/metrics/by-level?mode=auction")) == 4


def test_bad_mode():
    assert "mode must be 'lead' or 'auction'" in get_400("/api/metrics?mode=noon")
    assert "got ''" in get_400("/api/series?mode=")
    assert "mode must be" in get_400("/api/metrics/by-hour?mode=AUCTION")
