"""Tests for live snapshot persistence and training CSV build."""

import os
import sys
from datetime import datetime, timedelta, timezone

import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from data.training_store import append_live_snapshot, build_training_csv, get_live_stats


def test_append_live_snapshot_and_stats(tmp_path):
    live_path = tmp_path / "live.csv"
    ts = datetime(2026, 2, 7, 10, 0, tzinfo=timezone.utc)
    snap = {
        "mibor_overnight": 6.8,
        "repo": 6.5,
        "cblo_bid": 6.6,
        "usdinr_spot": 83.3,
        "gsec_10y": 7.1,
        "call_money_high": 6.9,
        "call_money_low": 6.7,
        "_balance": 252.0,
    }

    wrote_first = append_live_snapshot(snap, ts=ts, path=str(live_path), min_gap_s=0)
    wrote_second = append_live_snapshot(snap, ts=ts + timedelta(seconds=30), path=str(live_path), min_gap_s=0)

    assert wrote_first is True
    assert wrote_second is True
    stats = get_live_stats(str(live_path))
    assert stats["rows"] == 2
    assert stats["last_timestamp"] is not None


def test_build_training_csv_merges_live_hourly(tmp_path):
    base_path = tmp_path / "base.csv"
    live_path = tmp_path / "live.csv"
    out_path = tmp_path / "training.csv"

    base_df = pd.DataFrame(
        [
            {
                "date": "2026-02-06",
                "hour": 23,
                "mibor": 6.75,
                "repo": 6.5,
                "cblo": 6.55,
                "usdinr": 83.2,
                "gsec": 7.1,
                "call_avg": 6.7,
                "balance": 245.0,
                "inflow": 5.0,
                "outflow": 4.0,
            }
        ]
    )
    base_df.to_csv(base_path, index=False)

    ts = datetime(2026, 2, 7, 9, 5, tzinfo=timezone.utc)
    snap = {
        "mibor_overnight": 6.85,
        "repo": 6.5,
        "cblo_bid": 6.62,
        "usdinr_spot": 83.35,
        "gsec_10y": 7.14,
        "call_money_high": 6.95,
        "call_money_low": 6.75,
        "_balance": 255.0,
    }
    append_live_snapshot(snap, ts=ts, path=str(live_path), min_gap_s=0)
    append_live_snapshot(snap, ts=ts + timedelta(minutes=20), path=str(live_path), min_gap_s=0)

    summary = build_training_csv(base_path=str(base_path), live_path=str(live_path), out_path=str(out_path))
    assert summary["rows"] >= 2
    assert summary["live_rows"] >= 1

    out_df = pd.read_csv(out_path)
    required = {"date", "hour", "mibor", "repo", "cblo", "usdinr", "gsec", "call_avg", "balance", "inflow", "outflow"}
    assert required.issubset(set(out_df.columns))
