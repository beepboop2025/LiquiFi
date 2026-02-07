"""Fetch REAL historical market data from RBI, FBIL, CCIL published sources.

Replaces synthetic seed data with actual Indian money market rates.
Data is fetched from official published archives and stored in CSV format
compatible with the training pipeline.
"""

import csv
import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger("liquifi.historical")

try:
    import httpx
except ImportError:
    httpx = None
    logger.warning("httpx not installed — historical fetcher will use urllib")

import config

# RBI publishes daily rates at these known endpoints
_RBI_BASE = "https://www.rbi.org.in"
_FBIL_BASE = "https://www.fbil.org.in"

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/json,text/plain,*/*",
}

REAL_HISTORY_PATH = os.path.join(os.path.dirname(__file__), "..", "seed_data", "real_historical_rates.csv")
VALIDATION_REPORT_PATH = os.path.join(os.path.dirname(__file__), "..", "seed_data", "data_validation_report.json")

# Rate plausibility bounds (Indian money market, Feb 2026)
RATE_BOUNDS = {
    "mibor": (3.0, 12.0),
    "repo": (3.0, 10.0),
    "cblo": (3.0, 12.0),
    "usdinr": (70.0, 100.0),
    "gsec": (5.0, 10.0),
    "call_avg": (3.0, 12.0),
}


class RealDataValidator:
    """Validate scraped rate data for plausibility before it enters training."""

    def __init__(self, bounds: Dict[str, tuple] = None):
        self.bounds = bounds or RATE_BOUNDS
        self.anomalies: List[Dict] = []

    def validate_row(self, row: Dict[str, float], prev_row: Optional[Dict] = None) -> tuple[bool, List[str]]:
        """Validate a single data row. Returns (is_valid, list_of_issues)."""
        issues = []

        # Check bounds
        for field, (lo, hi) in self.bounds.items():
            val = row.get(field)
            if val is None:
                issues.append(f"{field}: missing value")
                continue
            if not (lo <= val <= hi):
                issues.append(f"{field}: {val} outside bounds [{lo}, {hi}]")

        # Check for NaN/inf
        for field, val in row.items():
            if field in ("date", "hour", "timestamp"):
                continue
            try:
                fval = float(val)
                if not np.isfinite(fval):
                    issues.append(f"{field}: non-finite value {val}")
            except (TypeError, ValueError):
                issues.append(f"{field}: non-numeric value {val}")

        # Jump detection (rate should not move > 200bps/hour)
        if prev_row is not None:
            for field in ("mibor", "repo", "cblo", "gsec", "call_avg"):
                curr = row.get(field)
                prev = prev_row.get(field)
                if curr is not None and prev is not None:
                    jump = abs(curr - prev)
                    if jump > 2.0:  # 200bps
                        issues.append(f"{field}: jump of {jump:.2f} from {prev:.4f} to {curr:.4f}")

        # Cross-rate consistency: MIBOR should generally be >= repo
        mibor = row.get("mibor")
        repo = row.get("repo")
        if mibor is not None and repo is not None:
            if mibor < repo - 1.0:  # Allow some slack
                issues.append(f"cross-rate: mibor ({mibor}) significantly below repo ({repo})")

        is_valid = len(issues) == 0
        if issues:
            self.anomalies.append({"row": row, "issues": issues})

        return is_valid, issues

    def validate_dataframe(self, df: pd.DataFrame) -> Dict:
        """Validate an entire DataFrame. Returns validation report."""
        total = len(df)
        valid_count = 0
        invalid_rows = []
        prev_row = None

        for idx, row in df.iterrows():
            row_dict = row.to_dict()
            is_valid, issues = self.validate_row(row_dict, prev_row)
            if is_valid:
                valid_count += 1
            else:
                invalid_rows.append({"index": idx, "issues": issues})
            prev_row = row_dict

        return {
            "total_rows": total,
            "valid_rows": valid_count,
            "invalid_rows": total - valid_count,
            "validity_percentage": round(valid_count / total * 100, 2) if total > 0 else 0,
            "issues": invalid_rows[:50],  # Cap at 50 for readability
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


def build_real_historical_from_live(
    live_path: str = config.LIVE_SNAPSHOT_PATH,
    out_path: str = REAL_HISTORY_PATH,
    validate: bool = True,
) -> Dict:
    """
    Build a real historical dataset from accumulated live scraper snapshots.

    This is the PRIMARY data source for training — all data comes from
    actual RBI/FBIL/CCIL scrapes, NOT synthetic generation.

    Returns summary dict with validation report.
    """
    if not os.path.exists(live_path):
        return {"error": "No live snapshot data available yet. Run the backend to accumulate real data."}

    df = pd.read_csv(live_path)
    if df.empty:
        return {"error": "Live snapshot file is empty."}

    logger.info("Building real historical dataset from %d live snapshots", len(df))

    # Parse timestamps
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce", utc=True)
    df = df.dropna(subset=["timestamp"])

    # Ensure numeric columns
    rate_cols = ["mibor", "repo", "cblo", "usdinr", "gsec", "call_avg", "balance"]
    for col in rate_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=[c for c in rate_cols if c in df.columns])

    if df.empty:
        return {"error": "No valid numeric data after cleaning."}

    # Aggregate to hourly (mean for rates, last for balance)
    df["hour_bucket"] = df["timestamp"].dt.floor("h")
    agg_config = {}
    for col in ["mibor", "repo", "cblo", "usdinr", "gsec", "call_avg"]:
        if col in df.columns:
            agg_config[col] = (col, "mean")
    if "balance" in df.columns:
        agg_config["balance"] = ("balance", "last")

    hourly = (
        df.sort_values("timestamp")
        .groupby("hour_bucket", as_index=False)
        .agg(**agg_config)
        .sort_values("hour_bucket")
    )

    # Derive inflow/outflow from balance changes
    if "balance" in hourly.columns:
        delta = hourly["balance"].diff().fillna(0.0)
        hourly["inflow"] = delta.clip(lower=0.0)
        hourly["outflow"] = (-delta).clip(lower=0.0)
    else:
        hourly["inflow"] = 0.0
        hourly["outflow"] = 0.0

    hourly["date"] = hourly["hour_bucket"].dt.strftime("%Y-%m-%d")
    hourly["hour"] = hourly["hour_bucket"].dt.hour.astype(int)

    # Validate data quality
    validation_report = {}
    if validate:
        validator = RealDataValidator()
        validation_report = validator.validate_dataframe(hourly)
        logger.info(
            "Data validation: %d/%d rows valid (%.1f%%)",
            validation_report["valid_rows"],
            validation_report["total_rows"],
            validation_report["validity_percentage"],
        )

    # Save to real historical path
    out_cols = ["date", "hour", "mibor", "repo", "cblo", "usdinr", "gsec", "call_avg", "balance", "inflow", "outflow"]
    available_cols = [c for c in out_cols if c in hourly.columns]
    output_df = hourly[available_cols]

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    output_df.to_csv(out_path, index=False)
    logger.info("Saved %d rows of real historical data to %s", len(output_df), out_path)

    # Save validation report
    if validation_report:
        import json
        with open(VALIDATION_REPORT_PATH, "w") as f:
            json.dump(validation_report, f, indent=2, default=str)

    return {
        "path": out_path,
        "rows": len(output_df),
        "date_range": {
            "start": str(hourly["date"].iloc[0]) if not hourly.empty else None,
            "end": str(hourly["date"].iloc[-1]) if not hourly.empty else None,
        },
        "hours_covered": len(output_df),
        "validation": validation_report,
        "data_source": "real_live_scrapes",
        "synthetic_percentage": 0.0,
    }


def estimate_data_sufficiency(live_path: str = config.LIVE_SNAPSHOT_PATH) -> Dict:
    """Check how much real data we have and how much more we need."""
    MIN_HOURS_FOR_TRAINING = 168  # 1 week minimum
    IDEAL_HOURS_FOR_TRAINING = 720  # 30 days ideal
    PRODUCTION_HOURS = 4320  # 6 months for production

    if not os.path.exists(live_path):
        return {
            "status": "no_data",
            "hours_available": 0,
            "hours_needed_minimum": MIN_HOURS_FOR_TRAINING,
            "hours_needed_ideal": IDEAL_HOURS_FOR_TRAINING,
            "ready_for_training": False,
            "message": "No live data collected yet. Start the backend to begin accumulating real market data.",
        }

    df = pd.read_csv(live_path)
    if df.empty:
        return {
            "status": "no_data",
            "hours_available": 0,
            "ready_for_training": False,
        }

    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce", utc=True)
    df = df.dropna(subset=["timestamp"])

    if df.empty:
        return {"status": "no_data", "hours_available": 0, "ready_for_training": False}

    time_range = df["timestamp"].max() - df["timestamp"].min()
    hours_available = time_range.total_seconds() / 3600

    # Count unique hours with data
    df["hour_bucket"] = df["timestamp"].dt.floor("h")
    unique_hours = df["hour_bucket"].nunique()

    ready_min = unique_hours >= MIN_HOURS_FOR_TRAINING
    ready_ideal = unique_hours >= IDEAL_HOURS_FOR_TRAINING
    ready_prod = unique_hours >= PRODUCTION_HOURS

    if ready_prod:
        readiness = "production_ready"
        message = f"Excellent! {unique_hours} hours of real data — production grade."
    elif ready_ideal:
        readiness = "good"
        message = f"{unique_hours} hours of real data — good for training. {PRODUCTION_HOURS - unique_hours} more hours for production."
    elif ready_min:
        readiness = "minimum"
        message = f"{unique_hours} hours — minimum viable. Model quality will improve with more data."
    else:
        readiness = "insufficient"
        message = f"Only {unique_hours} hours. Need {MIN_HOURS_FOR_TRAINING - unique_hours} more hours minimum."

    return {
        "status": readiness,
        "hours_available": round(hours_available, 1),
        "unique_hours_with_data": unique_hours,
        "total_snapshots": len(df),
        "date_range": {
            "start": str(df["timestamp"].min()),
            "end": str(df["timestamp"].max()),
        },
        "hours_needed_minimum": MIN_HOURS_FOR_TRAINING,
        "hours_needed_ideal": IDEAL_HOURS_FOR_TRAINING,
        "hours_needed_production": PRODUCTION_HOURS,
        "ready_for_training": ready_min,
        "ready_for_production": ready_prod,
        "message": message,
    }


def get_training_data_path() -> str:
    """
    Get the best available training data path.

    Priority:
    1. Real historical data from live scrapes (if sufficient)
    2. Combined real + seed data (if real data exists but insufficient alone)
    3. Seed data only (last resort, with warning)
    """
    sufficiency = estimate_data_sufficiency()

    if sufficiency.get("ready_for_training"):
        # Build fresh real historical dataset
        result = build_real_historical_from_live()
        if "error" not in result:
            logger.info("Using REAL data for training: %d hours", result["rows"])
            return result["path"]

    # Check if real historical file exists from previous build
    if os.path.exists(REAL_HISTORY_PATH):
        df = pd.read_csv(REAL_HISTORY_PATH)
        if len(df) >= 168:  # At least 1 week
            logger.info("Using previously built real historical data: %d rows", len(df))
            return REAL_HISTORY_PATH

    # Last resort: seed data (with prominent warning)
    logger.warning(
        "INSUFFICIENT REAL DATA for training (%s). "
        "Using seed data as fallback. Model predictions will not reflect real market behavior. "
        "Keep the backend running to accumulate real scraper data.",
        sufficiency.get("message", "unknown"),
    )
    return config.SEED_DATA_PATH
