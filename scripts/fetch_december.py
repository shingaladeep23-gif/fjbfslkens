"""Download December 2025 actuals and forecasts for the analysis notebook.

Usage: python scripts/fetch_december.py

Writes analysis/data/december/actuals.csv and analysis/data/december/forecasts.csv.
Same cleaning as the January snapshot (fetch_data.py), but kept outside data/ so the
app stays January-only. The notebook learns its correction from December only.
"""
from pathlib import Path

from fetch_data import save_snapshot

ANALYSIS_DATA_DIR = Path(__file__).resolve().parent.parent / "analysis" / "data" / "december"

# December decisions only: target times 1-31 December, nothing in January.
DECEMBER = {
    "target_from": "2025-12-01",
    "target_to": "2026-01-01",  # exclusive, so no January target time is kept
    "settlement_from": "2025-11-30",
    "settlement_to": "2025-12-31",
    # Forecasts that could be the "latest available" one for a December target at up to 48 h.
    "publish_from": "2025-11-28T00:00:00Z",
    "publish_to": "2026-01-01T00:00:00Z",
}

if __name__ == "__main__":
    save_snapshot(DECEMBER, ANALYSIS_DATA_DIR)
