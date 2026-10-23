"""Pick the forecast a buyer could actually have seen at decision time."""
import pandas as pd

# The N2EX GB day-ahead auction closes at 09:50 UK time on the day before delivery.
AUCTION_CLOSE = pd.Timedelta(hours=9, minutes=50)


# The rule: for each target time T, the forecast with the latest publishTime <= T's decision time.
# decision_times has one entry per forecast row: the decision time for that row's target.
# Targets with no such forecast are gaps (NaN), never filled with a later forecast.
def select_by_decision_time(forecasts, targets, decision_times):
    # Keep only forecasts that were already published at decision time.
    published_in_time = forecasts[forecasts["publishTime"] <= decision_times]

    # Sort oldest to newest, then keep the last (newest) row for each target time.
    # A stable sort keeps rows with the same publishTime in their original order,
    # so the result is the same every time.
    ordered = published_in_time.sort_values("publishTime", kind="stable")
    latest = ordered.drop_duplicates(subset="startTime", keep="last")

    # One row per requested target time. reindex puts NaN where a target has no forecast.
    latest = latest.set_index("startTime")
    target_index = pd.DatetimeIndex(targets, name="startTime")
    return latest[["publishTime", "generation"]].reindex(target_index)


# Fixed lead time: the decision is made lead_hours before each target time.
def select_forecasts(forecasts, targets, lead_hours):
    decision_times = forecasts["startTime"] - pd.Timedelta(hours=lead_hours)
    return select_by_decision_time(forecasts, targets, decision_times)


# Day-ahead auction: every hour of day D is bought at 09:50 on day D-1.
# Times are UTC. In January UK time is GMT, which equals UTC, so 09:50 UK time is 09:50 UTC.
# In summer (BST = UTC+1) it would be 08:50 UTC, and days would have to be split at UK midnight.
def auction_decision_times(target_times):
    start_of_target_day = target_times.dt.normalize()  # midnight at the start of the target's day
    return start_of_target_day - pd.Timedelta(days=1) + AUCTION_CLOSE


# Day-ahead auction mode: the same rule, with the auction's decision time for each target.
def select_forecasts_for_auction(forecasts, targets):
    decision_times = auction_decision_times(forecasts["startTime"])
    return select_by_decision_time(forecasts, targets, decision_times)
