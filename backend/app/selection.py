"""Pick the forecast a buyer could actually have seen at decision time."""
import pandas as pd


def select_forecasts(forecasts: pd.DataFrame, targets, lead_hours: float) -> pd.DataFrame:
    """For each target time T, the forecast with the latest publishTime <= T - lead_hours.

    forecasts: columns publishTime, startTime, generation (tz-aware UTC).
    targets: target times to return, one row each.
    Returns a frame indexed by startTime with columns publishTime, generation.
    A target with no eligible forecast is a gap (NaN/NaT). It is never filled
    with a later forecast, because the buyer did not have that information.
    """
    targets = pd.DatetimeIndex(targets, name="startTime")
    cutoff = forecasts.startTime - pd.Timedelta(hours=lead_hours)
    eligible = forecasts[forecasts.publishTime <= cutoff]
    # Stable sort, then last row per target: ties on publishTime keep input order.
    latest = eligible.sort_values("publishTime", kind="stable").groupby("startTime").tail(1)
    return latest.set_index("startTime")[["publishTime", "generation"]].reindex(targets)
