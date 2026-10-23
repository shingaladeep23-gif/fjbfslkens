"""Vercel entry point: the same FastAPI app, run as a Python serverless function.

vercel.json sends every /api/... request here. FastAPI then routes it by its full path
(/api/metrics, /api/series, ...), exactly as it does locally and in Docker.
"""
import sys
from pathlib import Path

# Make backend/app importable as "app", the same way the tests and the Docker image run it.
sys.path.append(str(Path(__file__).resolve().parent.parent / "backend"))

from app.main import app  # noqa: E402,F401  (must come after the path is set; Vercel looks for "app")
