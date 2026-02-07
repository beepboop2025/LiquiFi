#!/usr/bin/env python3
"""One-time migration: import flat files into PostgreSQL tables.

Usage:
    DATABASE_URL=postgresql://liquifi_dev:devpassword@localhost:5433/liquifi_dev \
        python scripts/migrate_files_to_pg.py

Imports:
  1. 8 JSONL files -> rate_snapshots table (batch 500)
  2. live_snapshots.csv -> live_snapshots table
  3. data/_cache/*.json -> scraper_cache table
  4. collection_status.json -> collection_status table
  5. training_meta.json + ensemble_weights.json -> training_metadata table
"""

import csv
import json
import os
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from models.database import DATABASE_URL, SessionLocal
from models.data_store import (
    RateSnapshot, LiveSnapshot, ScraperCache,
    CollectionStatus, TrainingMetadata,
)

COLLECTION_DIR = BACKEND_DIR / "data" / "collected"
CACHE_DIR = BACKEND_DIR / "data" / "_cache"
LIVE_CSV = BACKEND_DIR / "seed_data" / "live_snapshots.csv"
STATUS_FILE = COLLECTION_DIR / "collection_status.json"
META_FILE = BACKEND_DIR / "models" / "training_meta.json"
WEIGHTS_FILE = BACKEND_DIR / "models" / "ensemble_weights.json"

REGION_JSONL = {
    "india": COLLECTION_DIR / "india_rates.jsonl",
    "us": COLLECTION_DIR / "us_rates.jsonl",
    "europe": COLLECTION_DIR / "europe_rates.jsonl",
    "china": COLLECTION_DIR / "china_rates.jsonl",
    "yfinance": COLLECTION_DIR / "yfinance_rates.jsonl",
    "bis": COLLECTION_DIR / "bis_rates.jsonl",
    "akshare": COLLECTION_DIR / "akshare_rates.jsonl",
    "worldbank": COLLECTION_DIR / "worldbank_rates.jsonl",
}

BATCH_SIZE = 500


def migrate_rate_snapshots(session):
    """Import JSONL files -> rate_snapshots table."""
    total = 0
    for region, path in REGION_JSONL.items():
        if not path.exists():
            print(f"  {region}: no file, skipping")
            continue
        batch = []
        count = 0
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                batch.append(RateSnapshot(
                    timestamp=entry.get("timestamp", ""),
                    region=entry.get("region", region),
                    fields_count=entry.get("fields_count", 0),
                    rates=json.dumps(entry.get("rates", {}), default=str),
                ))
                count += 1
                if len(batch) >= BATCH_SIZE:
                    session.bulk_save_objects(batch)
                    session.flush()
                    batch = []
        if batch:
            session.bulk_save_objects(batch)
            session.flush()
        print(f"  {region}: {count} entries")
        total += count
    session.commit()
    print(f"  -> rate_snapshots: {total} total rows inserted")


def migrate_live_snapshots(session):
    """Import live_snapshots.csv -> live_snapshots table."""
    if not LIVE_CSV.exists():
        print("  live_snapshots.csv not found, skipping")
        return
    batch = []
    count = 0
    with open(LIVE_CSV, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                batch.append(LiveSnapshot(
                    timestamp=row.get("timestamp", ""),
                    date=row.get("date", ""),
                    hour=int(row.get("hour", 0)),
                    mibor=float(row.get("mibor", 0)),
                    repo=float(row.get("repo", 0)),
                    cblo=float(row.get("cblo", 0)),
                    usdinr=float(row.get("usdinr", 0)),
                    gsec=float(row.get("gsec", 0)),
                    call_avg=float(row.get("call_avg", 0)),
                    balance=float(row.get("balance", 0)),
                ))
                count += 1
            except (ValueError, KeyError) as exc:
                print(f"  Skipping bad row: {exc}")
                continue
            if len(batch) >= BATCH_SIZE:
                session.bulk_save_objects(batch)
                session.flush()
                batch = []
    if batch:
        session.bulk_save_objects(batch)
    session.commit()
    print(f"  -> live_snapshots: {count} rows inserted")


def migrate_cache(session):
    """Import data/_cache/*.json -> scraper_cache table."""
    if not CACHE_DIR.exists():
        print("  Cache dir not found, skipping")
        return
    count = 0
    for path in CACHE_DIR.glob("*.json"):
        try:
            data = json.loads(path.read_text())
            key = path.stem
            session.add(ScraperCache(
                key=key,
                payload=json.dumps(data.get("payload", {}), default=str),
                created_at=data.get("_ts", time.time()),
                ttl=data.get("_ttl"),
            ))
            count += 1
        except (json.JSONDecodeError, OSError) as exc:
            print(f"  Skipping cache file {path.name}: {exc}")
    session.commit()
    print(f"  -> scraper_cache: {count} entries inserted")


def migrate_collection_status(session):
    """Import collection_status.json -> collection_status table."""
    if not STATUS_FILE.exists():
        print("  collection_status.json not found, skipping")
        return
    try:
        data = json.loads(STATUS_FILE.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        print(f"  Error reading status file: {exc}")
        return
    count = 0
    for region, info in data.items():
        session.add(CollectionStatus(
            region=region,
            last_collection=info.get("last_collection", ""),
            last_fields_count=info.get("last_fields_count", 0),
            last_fields=json.dumps(info.get("last_fields", []), default=str),
        ))
        count += 1
    session.commit()
    print(f"  -> collection_status: {count} regions inserted")


def migrate_training_metadata(session):
    """Import training_meta.json + ensemble_weights.json -> training_metadata table."""
    count = 0
    for meta_type, path in [("training_meta", META_FILE), ("ensemble_weights", WEIGHTS_FILE)]:
        if not path.exists():
            print(f"  {path.name} not found, skipping")
            continue
        try:
            data = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError) as exc:
            print(f"  Error reading {path.name}: {exc}")
            continue
        session.add(TrainingMetadata(
            metadata_type=meta_type,
            payload=json.dumps(data, default=str),
            created_at=time.time(),
        ))
        count += 1
    session.commit()
    print(f"  -> training_metadata: {count} entries inserted")


def main():
    if DATABASE_URL.startswith("sqlite"):
        print(f"ERROR: DATABASE_URL is SQLite ({DATABASE_URL})")
        print("Set DATABASE_URL to a PostgreSQL URL before running this script.")
        sys.exit(1)

    print(f"Migrating files to PostgreSQL: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else DATABASE_URL}")
    print()

    session = SessionLocal()
    try:
        print("1/5  Rate snapshots (JSONL -> rate_snapshots)")
        migrate_rate_snapshots(session)
        print()

        print("2/5  Live snapshots (CSV -> live_snapshots)")
        migrate_live_snapshots(session)
        print()

        print("3/5  Scraper cache (JSON -> scraper_cache)")
        migrate_cache(session)
        print()

        print("4/5  Collection status (JSON -> collection_status)")
        migrate_collection_status(session)
        print()

        print("5/5  Training metadata (JSON -> training_metadata)")
        migrate_training_metadata(session)
        print()

        print("Migration complete!")
    except Exception as exc:
        session.rollback()
        print(f"MIGRATION FAILED: {exc}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
