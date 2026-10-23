"""Accuracy metrics: compare the forecast available at decision time with what actually happened."""
import pandas as pd

from app.selection import select_forecasts

# Bands of actual generation for the "error by generation level" breakdown, in MW.
# right=False in pd.cut makes each band include its lower edge, e.g. 5000 MW is in "5-10 GW".
LEVEL_EDGES = [0, 5000, 10000, 15000, 100000]
LEVEL_LABELS = ["under 5 GW", "5-10 GW", "10-15 GW", "15 GW and over"]


# Put each selected forecast next to the actual for the same time and work out the error.
# Only targets on the hour have forecasts, so :30 actuals are never used here.
def pair_with_actuals(selected, actuals):
    actual_by_time = actuals.set_index("startTime")["generation"]
    pairs = pd.DataFrame(index=selected.index)
    pairs["publishTime"] = selected["publishTime"]
    pairs["forecast"] = selected["generation"]
    pairs["actual"] = actual_by_time.reindex(selected.index)
    # Error is forecast minus actual: positive means the forecast was higher than what happened.
    pairs["error"] = pairs["forecast"] - pairs["actual"]
    return pairs


# Turn a table of pairs into the headline accuracy numbers.
# Gaps (no forecast) are counted but left out of every average.
def summary_metrics(pairs):
    complete = pairs.dropna(subset=["forecast", "actual"])
    errors = complete["error"]
    mae = errors.abs().mean()
    return {
        "hours": len(pairs),
        "gaps": int(pairs["forecast"].isna().sum()),
        "mae": mae,
        "rmse": (errors ** 2).mean() ** 0.5,
        "mean_forecast_minus_actual": errors.mean(),
        "error_p10": errors.quantile(0.10),
        "error_p50": errors.quantile(0.50),
        "error_p90": errors.quantile(0.90),
        # MAE as a share of average generation; unlike MAPE it does not blow up when wind is low.
        "mae_pct_of_mean_actual": 100 * mae / complete["actual"].mean(),
    }


# Accuracy at every lead time over the same target hours, so differences
# come from the lead time and not from comparing different days.
def metrics_by_lead_time(forecasts, actuals, targets, leads):
    rows = []
    for lead in leads:
        selected = select_forecasts(forecasts, targets, lead)
        pairs = pair_with_actuals(selected, actuals)
        row = summary_metrics(pairs)
        row["lead_hours"] = lead
        rows.append(row)
    return pd.DataFrame(rows)


# Accuracy for each hour of the day (0-23, UTC), to show when forecasts are weakest.
def metrics_by_hour_of_day(pairs):
    rows = []
    for hour in range(24):
        in_hour = pairs[pairs.index.hour == hour]
        row = summary_metrics(in_hour)
        row["hour"] = hour
        rows.append(row)
    return pd.DataFrame(rows)


# Accuracy grouped by how much wind actually generated, using fixed GW bands.
def metrics_by_generation_level(pairs):
    levels = pd.cut(pairs["actual"], bins=LEVEL_EDGES, labels=LEVEL_LABELS, right=False)
    rows = []
    for label in LEVEL_LABELS:
        in_level = pairs[levels == label]
        row = summary_metrics(in_level)
        row["level"] = label
        rows.append(row)
    return pd.DataFrame(rows)


# How much wind could be counted on. actual_p10 is the level generation stayed
# above 90% of the time. The forecast percentiles over the same hours show
# whether the forecast's spread matches reality.
def reliability(pairs):
    complete = pairs.dropna(subset=["forecast", "actual"])
    return {
        "actual_p10": complete["actual"].quantile(0.10),
        "actual_p50": complete["actual"].quantile(0.50),
        "actual_p90": complete["actual"].quantile(0.90),
        "forecast_p10": complete["forecast"].quantile(0.10),
        "forecast_p50": complete["forecast"].quantile(0.50),
        "forecast_p90": complete["forecast"].quantile(0.90),
    }
