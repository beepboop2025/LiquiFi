"""Persist live snapshots and build a training-ready hourly dataset.

Dual-mode: writes/reads from PostgreSQL when available, CSV file as fallback.
"""

import csv
import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

import config
from data.validation import check_data_quality

logger = logging.getLogger("liquifi.training")

_LAST_APPEND_TS: dict[str, float] = {}

_LIVE_COLS = [
    "timestamp",
    "date",
    "hour",
    "mibor",
    "repo",
    "cblo",
    "usdinr",
    "gsec",
    "call_avg",
    "balance",
]

_TRAIN_COLS = [
    "date",
    "hour",
    "mibor",
    "repo",
    "cblo",
    "usdinr",
    "gsec",
    "call_avg",
    "balance",
    "inflow",
    "outflow",
]


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def _use_db() -> bool:
    from models.database import DATABASE_URL
    return not DATABASE_URL.startswith("sqlite")


def _db_append_live(row: dict) -> None:
    """Insert a live snapshot row into the live_snapshots table."""
    try:
        from models.database import get_db_context
        from models.data_store import LiveSnapshot
        with get_db_context() as db:
            snap = LiveSnapshot(
                timestamp=row["timestamp"],
                date=row["date"],
                hour=row["hour"],
                mibor=row["mibor"],
                repo=row["repo"],
                cblo=row["cblo"],
                usdinr=row["usdinr"],
                gsec=row["gsec"],
                call_avg=row["call_avg"],
                balance=row["balance"],
            )
            db.add(snap)
            db.commit()
    except Exception as exc:
        logger.warning("DB live snapshot write failed: %s", exc)


def _live_from_db() -> pd.DataFrame:
    """Read all live snapshots from the DB into a DataFrame."""
    try:
        from models.database import get_db_context
        from models.data_store import LiveSnapshot
        with get_db_context() as db:
            rows = db.query(LiveSnapshot).order_by(LiveSnapshot.timestamp).all()
            if not rows:
                return pd.DataFrame(columns=_LIVE_COLS)
            data = [
                {
                    "timestamp": r.timestamp,
                    "date": r.date,
                    "hour": r.hour,
                    "mibor": r.mibor,
                    "repo": r.repo,
                    "cblo": r.cblo,
                    "usdinr": r.usdinr,
                    "gsec": r.gsec,
                    "call_avg": r.call_avg,
                    "balance": r.balance,
                }
                for r in rows
            ]
            return pd.DataFrame(data)
    except Exception as exc:
        logger.warning("DB live snapshot read failed: %s", exc)
        return pd.DataFrame(columns=_LIVE_COLS)


def _get_live_stats_db() -> dict | None:
    """Get live stats from DB. Returns None if DB unavailable."""
    try:
        from models.database import get_db_context
        from models.data_store import LiveSnapshot
        from sqlalchemy import func
        with get_db_context() as db:
            count = db.query(func.count(LiveSnapshot.id)).scalar() or 0
            if count == 0:
                return {"rows": 0, "last_timestamp": None}
            last_ts = db.query(func.max(LiveSnapshot.timestamp)).scalar()
            return {"rows": count, "last_timestamp": last_ts}
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def append_live_snapshot(
    snapshot: dict,
    ts: datetime | None = None,
    path: str = config.LIVE_SNAPSHOT_PATH,
    min_gap_s: int = config.LIVE_DATA_MIN_GAP_S,
) -> bool:
    """Append one live snapshot row. Returns True if a row was written."""
    now = ts or datetime.now(timezone.utc)
    ts_epoch = now.timestamp()
    prev_ts = _LAST_APPEND_TS.get(path)
    if prev_ts is not None and ts_epoch - prev_ts < min_gap_s:
        return False

    # Validate data quality before storing
    quality_check = check_data_quality(snapshot)
    if quality_check["score"] < 50:
        logger.warning(
            f"Data quality too low ({quality_check['score']}), skipping storage. "
            f"Errors: {quality_check['errors']}"
        )
        return False

    row = {
        "timestamp": now.isoformat(),
        "date": now.date().isoformat(),
        "hour": int(now.hour),
        "mibor": float(snapshot.get("mibor_overnight", config.BASE_RATES["mibor_overnight"])),
        "repo": float(snapshot.get("repo", config.BASE_RATES["repo"])),
        "cblo": float(snapshot.get("cblo_bid", config.BASE_RATES["cblo_bid"])),
        "usdinr": float(snapshot.get("usdinr_spot", config.BASE_RATES["usdinr_spot"])),
        "gsec": float(snapshot.get("gsec_10y", config.BASE_RATES["gsec_10y"])),
        "call_avg": float(
            (snapshot.get("call_money_high", config.BASE_RATES["call_money_high"])
             + snapshot.get("call_money_low", config.BASE_RATES["call_money_low"])) / 2
        ),
        "balance": float(snapshot.get("_balance", 245.0)),
    }

    # Write to DB if available (only for the default path)
    if _use_db() and path == config.LIVE_SNAPSHOT_PATH:
        _db_append_live(row)

    # Always write CSV as fallback
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    write_header = not p.exists() or p.stat().st_size == 0
    with p.open("a", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=_LIVE_COLS)
        if write_header:
            writer.writeheader()
        writer.writerow(row)
    _LAST_APPEND_TS[path] = ts_epoch
    return True


def build_training_csv(
    base_path: str = config.SEED_DATA_PATH,
    live_path: str = config.LIVE_SNAPSHOT_PATH,
    out_path: str = config.TRAINING_DATA_PATH,
    holdout_hours: int = 48,
) -> dict:
    """
    Build training CSV by combining base historical data with hourly-aggregated live rows.

    Uses temporal split: the most recent `holdout_hours` of data are excluded from
    training to prevent data leakage. The holdout data is saved separately for validation.

    Returns summary stats: {"path", "rows", "base_rows", "live_rows", "holdout_rows", "holdout_path"}.
    """
    base_df = _read_base(base_path)

    # Try DB for live data first, fall back to CSV
    live_hourly = pd.DataFrame(columns=_TRAIN_COLS)
    if _use_db():
        db_df = _live_from_db()
        if not db_df.empty:
            live_hourly = _df_to_hourly(db_df)

    if live_hourly.empty:
        live_hourly = _live_to_hourly(live_path)

    merged = pd.concat([base_df, live_hourly], ignore_index=True)
    if not merged.empty:
        merged["date"] = pd.to_datetime(merged["date"], errors="coerce")
        merged["hour"] = merged["hour"].astype(int)
        merged = merged.sort_values(["date", "hour"]).drop_duplicates(subset=["date", "hour"], keep="last")

        # Temporal split: hold out the most recent N hours to prevent leakage
        total_rows = len(merged)
        if total_rows > holdout_hours:
            train_df = merged.iloc[:-holdout_hours].copy()
            holdout_df = merged.iloc[-holdout_hours:].copy()
        else:
            # Not enough data for holdout — use all for training
            train_df = merged.copy()
            holdout_df = pd.DataFrame(columns=_TRAIN_COLS)

        train_df["date"] = train_df["date"].dt.strftime("%Y-%m-%d")
        if not holdout_df.empty:
            holdout_df["date"] = holdout_df["date"].dt.strftime("%Y-%m-%d")
    else:
        train_df = pd.DataFrame(columns=_TRAIN_COLS)
        holdout_df = pd.DataFrame(columns=_TRAIN_COLS)

    train_df = train_df[_TRAIN_COLS] if not train_df.empty else pd.DataFrame(columns=_TRAIN_COLS)
    holdout_df = holdout_df[_TRAIN_COLS] if not holdout_df.empty else pd.DataFrame(columns=_TRAIN_COLS)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    train_df.to_csv(out_path, index=False)

    # Save holdout for walk-forward validation
    holdout_path = out_path.replace(".csv", "_holdout.csv")
    holdout_df.to_csv(holdout_path, index=False)

    return {
        "path": out_path,
        "rows": int(len(train_df)),
        "base_rows": int(len(base_df)),
        "live_rows": int(len(live_hourly)),
        "holdout_rows": int(len(holdout_df)),
        "holdout_path": holdout_path,
    }


def get_live_stats(path: str = config.LIVE_SNAPSHOT_PATH) -> dict:
    """Return quick stats for the live snapshot store."""
    # Try DB first (only for the default path)
    if _use_db() and path == config.LIVE_SNAPSHOT_PATH:
        stats = _get_live_stats_db()
        if stats is not None:
            return stats

    # Fall back to CSV
    if not os.path.exists(path):
        return {"rows": 0, "last_timestamp": None}
    df = pd.read_csv(path)
    if df.empty:
        return {"rows": 0, "last_timestamp": None}
    last_ts = str(df["timestamp"].iloc[-1]) if "timestamp" in df.columns else None
    return {"rows": int(len(df)), "last_timestamp": last_ts}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _read_base(base_path: str) -> pd.DataFrame:
    if not os.path.exists(base_path):
        return pd.DataFrame(columns=_TRAIN_COLS)
    df = pd.read_csv(base_path)
    for col in _TRAIN_COLS:
        if col not in df.columns:
            if col == "inflow" or col == "outflow":
                df[col] = 0.0
            elif col == "hour":
                df[col] = 0
            elif col == "date":
                df[col] = "1970-01-01"
            else:
                df[col] = 0.0
    return df[_TRAIN_COLS]


def _df_to_hourly(df: pd.DataFrame) -> pd.DataFrame:
    """Convert a live-snapshot DataFrame (from DB or file) into hourly aggregates."""
    if df.empty or "timestamp" not in df.columns:
        return pd.DataFrame(columns=_TRAIN_COLS)

    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce", utc=True)
    df = df.dropna(subset=["timestamp"])
    if df.empty:
        return pd.DataFrame(columns=_TRAIN_COLS)

    for col in ("mibor", "repo", "cblo", "usdinr", "gsec", "call_avg", "balance"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["mibor", "repo", "cblo", "usdinr", "gsec", "call_avg", "balance"])
    if df.empty:
        return pd.DataFrame(columns=_TRAIN_COLS)

    df["hour_bucket"] = df["timestamp"].dt.floor("h")
    agg = (
        df.sort_values("timestamp")
        .groupby("hour_bucket", as_index=False)
        .agg(
            mibor=("mibor", "mean"),
            repo=("repo", "mean"),
            cblo=("cblo", "mean"),
            usdinr=("usdinr", "mean"),
            gsec=("gsec", "mean"),
            call_avg=("call_avg", "mean"),
            balance=("balance", "last"),
        )
        .sort_values("hour_bucket")
    )
    if agg.empty:
        return pd.DataFrame(columns=_TRAIN_COLS)

    delta = agg["balance"].diff().fillna(0.0)
    agg["inflow"] = delta.clip(lower=0.0)
    agg["outflow"] = (-delta).clip(lower=0.0)
    agg["date"] = agg["hour_bucket"].dt.strftime("%Y-%m-%d")
    agg["hour"] = agg["hour_bucket"].dt.hour.astype(int)
    return agg[_TRAIN_COLS]


def _live_to_hourly(live_path: str) -> pd.DataFrame:
    if not os.path.exists(live_path):
        return pd.DataFrame(columns=_TRAIN_COLS)
    df = pd.read_csv(live_path)
    return _df_to_hourly(df)
