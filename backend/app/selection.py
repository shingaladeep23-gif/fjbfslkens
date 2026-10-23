"""Pick the forecast a buyer could actually have seen at decision time."""
import pandas as pd


# For each target time T, return the forecast with the latest publishTime <= T - lead_hours.
# Targets with no such forecast are gaps (NaN), never filled with a later forecast.
def select_forecasts(forecasts, targets, lead_hours):
    lead = pd.Timedelta(hours=lead_hours)

    # Keep only forecasts that were already published at decision time (T - lead).
    decision_time = forecasts["startTime"] - lead
    published_in_time = forecasts[forecasts["publishTime"] <= decision_time]

    # Sort oldest to newest, then keep the last (newest) row for each target time.
    # A stable sort keeps rows with the same publishTime in their original order,
    # so the result is the same every time.
    ordered = published_in_time.sort_values("publishTime", kind="stable")
    latest = ordered.drop_duplicates(subset="startTime", keep="last")

    # One row per requested target time. reindex puts NaN where a target has no forecast.
    latest = latest.set_index("startTime")
    target_index = pd.DatetimeIndex(targets, name="startTime")
    return latest[["publishTime", "generation"]].reindex(target_index)
