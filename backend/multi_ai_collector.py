"""
Multi-AI Data Collection Orchestrator for LiquiFi.

Divides global data scraping work across multiple AI agents (Claude, Kimi, Codex)
running in parallel terminals. Each agent gets assigned a region to scrape.

Usage:
    # Run the full orchestrator (assigns regions automatically)
    python multi_ai_collector.py orchestrate

    # Run a specific region's collector (used by individual AI agents)
    python multi_ai_collector.py collect --region india
    python multi_ai_collector.py collect --region us
    python multi_ai_collector.py collect --region europe
    python multi_ai_collector.py collect --region china

    # Merge all collected data into unified dataset
    python multi_ai_collector.py merge

    # Check collection status
    python multi_ai_collector.py status

    # Run continuous collection loop (one region)
    python multi_ai_collector.py loop --region us --interval 300

AI Agent Assignment:
    Claude Code  → India (RBI, CCIL, FBIL, NSE) + orchestration
    Kimi         → US (FRED, Treasury.gov) + Europe (ECB)
    Codex        → China (PBoC, SHIBOR) + data validation
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Add backend to path
BACKEND_DIR = Path(__file__).parent
sys.path.insert(0, str(BACKEND_DIR))

import config

# Output directories
COLLECTION_DIR = os.path.join(BACKEND_DIR, "data", "collected")
REGION_FILES = {
    "india": os.path.join(COLLECTION_DIR, "india_rates.jsonl"),
    "us": os.path.join(COLLECTION_DIR, "us_rates.jsonl"),
    "europe": os.path.join(COLLECTION_DIR, "europe_rates.jsonl"),
    "china": os.path.join(COLLECTION_DIR, "china_rates.jsonl"),
    "yfinance": os.path.join(COLLECTION_DIR, "yfinance_rates.jsonl"),
    "bis": os.path.join(COLLECTION_DIR, "bis_rates.jsonl"),
    "akshare": os.path.join(COLLECTION_DIR, "akshare_rates.jsonl"),
    "worldbank": os.path.join(COLLECTION_DIR, "worldbank_rates.jsonl"),
    "mega": os.path.join(COLLECTION_DIR, "mega_rates.jsonl"),
}
MERGED_FILE = os.path.join(COLLECTION_DIR, "global_merged.jsonl")
STATUS_FILE = os.path.join(COLLECTION_DIR, "collection_status.json")


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def _use_db() -> bool:
    from models.database import DATABASE_URL
    return not DATABASE_URL.startswith("sqlite")


def _save_rate_snapshot(entry: dict) -> None:
    """Write a rate snapshot to the rate_snapshots table."""
    try:
        from models.database import get_db_context
        from models.data_store import RateSnapshot
        with get_db_context() as db:
            row = RateSnapshot(
                timestamp=entry["timestamp"],
                region=entry["region"],
                fields_count=entry["fields_count"],
                rates=json.dumps(entry["rates"], default=str),
            )
            db.add(row)
            db.commit()
    except Exception as exc:
        import logging
        logging.getLogger("liquifi.collector").warning(
            "DB rate snapshot write failed: %s", exc,
        )


def _update_status_db(region: str, fields_count: int, field_names: list) -> None:
    """Upsert collection_status row in the DB."""
    try:
        from models.database import get_db_context
        from models.data_store import CollectionStatus
        with get_db_context() as db:
            row = db.query(CollectionStatus).filter(
                CollectionStatus.region == region,
            ).first()
            now_iso = datetime.now(timezone.utc).isoformat()
            fields_json = json.dumps(field_names, default=str)
            if row is not None:
                row.last_collection = now_iso
                row.last_fields_count = fields_count
                row.last_fields = fields_json
            else:
                row = CollectionStatus(
                    region=region,
                    last_collection=now_iso,
                    last_fields_count=fields_count,
                    last_fields=fields_json,
                )
                db.add(row)
            db.commit()
    except Exception as exc:
        import logging
        logging.getLogger("liquifi.collector").warning(
            "DB status update failed for %s: %s", region, exc,
        )


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_collect(args):
    """Collect data for a specific region and append to JSONL file."""
    region = args.region
    os.makedirs(COLLECTION_DIR, exist_ok=True)

    print(f"[{datetime.now(timezone.utc).isoformat()}] Collecting {region} data...")

    if region == "india":
        from data.scrapers import scrape_all
        rates = scrape_all()
    elif region == "us":
        from data.scrapers.us_fed import scrape_us_fed
        rates = scrape_us_fed()
    elif region == "europe":
        from data.scrapers.ecb import scrape_ecb
        rates = scrape_ecb()
    elif region == "china":
        from data.scrapers.pboc import scrape_pboc
        rates = scrape_pboc()
    elif region == "yfinance":
        from data.scrapers.yfinance_global import scrape_yfinance
        rates = scrape_yfinance()
    elif region == "bis":
        from data.scrapers.mega_scraper import _scrape_bis_policy_rates
        rates = _scrape_bis_policy_rates()
    elif region == "akshare":
        from data.scrapers.mega_scraper import _scrape_akshare_china
        rates = _scrape_akshare_china()
    elif region == "worldbank":
        from data.scrapers.mega_scraper import _scrape_world_bank
        rates = _scrape_world_bank()
    elif region == "mega":
        from data.scrapers.mega_scraper import scrape_mega
        mega_result = scrape_mega()
        rates = mega_result.get("rates", {})
    else:
        print(f"Unknown region: {region}")
        return

    if not rates:
        print(f"  WARNING: No data scraped for {region}")
        return

    # Build entry
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "region": region,
        "fields_count": len(rates),
        "rates": rates,
    }

    # Write to DB (primary) + JSONL file (fallback)
    if _use_db():
        _save_rate_snapshot(entry)

    # Always append JSONL as fallback
    output_path = REGION_FILES[region]
    with open(output_path, "a") as f:
        f.write(json.dumps(entry, default=str) + "\n")

    # Update status
    _update_status(region, len(rates), list(rates.keys()))

    print(f"  Scraped {len(rates)} fields: {list(rates.keys())}")
    print(f"  Saved to: {output_path}")
    print(json.dumps(entry, indent=2, default=str))


def cmd_loop(args):
    """Run continuous collection loop for a region."""
    region = args.region
    interval = args.interval
    print(f"Starting continuous collection for {region} every {interval}s")
    print(f"Press Ctrl+C to stop\n")

    cycle = 0
    while True:
        cycle += 1
        print(f"\n--- Cycle {cycle} ---")
        try:
            cmd_collect(args)
        except Exception as exc:
            print(f"  ERROR: {exc}")

        print(f"  Sleeping {interval}s...")
        time.sleep(interval)


def cmd_merge(_args):
    """Merge all regional JSONL files into a unified dataset."""
    os.makedirs(COLLECTION_DIR, exist_ok=True)

    all_entries = []

    # Try DB first
    if _use_db():
        try:
            from models.database import get_db_context
            from models.data_store import RateSnapshot
            with get_db_context() as db:
                rows = db.query(RateSnapshot).order_by(RateSnapshot.timestamp).all()
                for row in rows:
                    all_entries.append({
                        "timestamp": row.timestamp,
                        "region": row.region,
                        "fields_count": row.fields_count,
                        "rates": json.loads(row.rates),
                    })
            if all_entries:
                print(f"  Loaded {len(all_entries)} entries from DB")
        except Exception as exc:
            print(f"  DB read failed, falling back to files: {exc}")
            all_entries = []

    # Fall back to JSONL files if DB is empty or unavailable
    if not all_entries:
        for region, filepath in REGION_FILES.items():
            if not os.path.exists(filepath):
                print(f"  {region}: no data file")
                continue
            count = 0
            with open(filepath) as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            entry = json.loads(line)
                            all_entries.append(entry)
                            count += 1
                        except json.JSONDecodeError:
                            pass
            print(f"  {region}: {count} entries")

    # Sort by timestamp
    all_entries.sort(key=lambda x: x.get("timestamp", ""))

    # Write merged JSONL
    with open(MERGED_FILE, "w") as f:
        for entry in all_entries:
            f.write(json.dumps(entry, default=str) + "\n")

    # Also build a unified CSV for training
    _build_training_csv(all_entries)

    result = {
        "command": "merge",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_entries": len(all_entries),
        "merged_file": MERGED_FILE,
    }
    print(json.dumps(result, indent=2, default=str))


def _build_training_csv(entries: list):
    """Build a training-compatible CSV from merged global data."""
    import pandas as pd

    if not entries:
        return

    rows = []
    for entry in entries:
        ts = entry.get("timestamp", "")
        rates = entry.get("rates", {})
        if not rates:
            continue

        row = {"timestamp": ts}
        row.update(rates)
        rows.append(row)

    if not rows:
        return

    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce", utc=True)
    df = df.dropna(subset=["timestamp"])
    df = df.sort_values("timestamp")

    csv_path = os.path.join(COLLECTION_DIR, "global_training_data.csv")
    df.to_csv(csv_path, index=False)
    print(f"  Training CSV: {csv_path} ({len(df)} rows, {len(df.columns)} columns)")


def cmd_status(_args):
    """Show collection status across all regions."""
    result = {
        "command": "status",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "regions": {},
    }

    # Try DB first for counts
    db_counts = {}
    if _use_db():
        try:
            from models.database import get_db_context
            from models.data_store import RateSnapshot
            from sqlalchemy import func
            with get_db_context() as db:
                rows = (
                    db.query(
                        RateSnapshot.region,
                        func.count(RateSnapshot.id),
                        func.min(RateSnapshot.timestamp),
                        func.max(RateSnapshot.timestamp),
                    )
                    .group_by(RateSnapshot.region)
                    .all()
                )
                for region, cnt, first_ts, last_ts in rows:
                    db_counts[region] = {
                        "entries": cnt,
                        "first_timestamp": first_ts,
                        "last_timestamp": last_ts,
                    }
        except Exception:
            pass

    for region, filepath in REGION_FILES.items():
        # Prefer DB data
        if region in db_counts:
            info = db_counts[region]
            result["regions"][region] = {
                "entries": info["entries"],
                "first_timestamp": info["first_timestamp"],
                "last_timestamp": info["last_timestamp"],
                "last_fields_count": 0,
                "status": "collecting" if info["entries"] > 0 else "no_data",
                "source": "db",
            }
            continue

        # Fall back to file
        if not os.path.exists(filepath):
            result["regions"][region] = {"entries": 0, "status": "no_data"}
            continue

        entries = 0
        first_ts = None
        last_ts = None
        last_fields = 0

        with open(filepath) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    entries += 1
                    ts = entry.get("timestamp")
                    if first_ts is None:
                        first_ts = ts
                    last_ts = ts
                    last_fields = entry.get("fields_count", 0)
                except json.JSONDecodeError:
                    pass

        result["regions"][region] = {
            "entries": entries,
            "first_timestamp": first_ts,
            "last_timestamp": last_ts,
            "last_fields_count": last_fields,
            "status": "collecting" if entries > 0 else "no_data",
        }

    # Load detailed status if available
    if os.path.exists(STATUS_FILE):
        try:
            with open(STATUS_FILE) as f:
                detailed = json.load(f)
            result["detailed"] = detailed
        except (json.JSONDecodeError, OSError):
            pass

    total = sum(r["entries"] for r in result["regions"].values())
    result["total_entries"] = total
    result["collection_dir"] = COLLECTION_DIR

    print(json.dumps(result, indent=2, default=str))


def cmd_orchestrate(_args):
    """Print orchestration instructions for multi-AI data collection."""
    py = sys.executable
    cd = f"cd '{BACKEND_DIR}'"
    instructions = {
        "command": "orchestrate",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_data_sources": 9,
        "total_possible_fields": "200+",
        "instructions": {
            "overview": (
                "Run these commands in separate terminals. Each AI agent collects data "
                "from its assigned regions. Use 'merge' to combine all data into unified JSONL + CSV."
            ),
            "agents": {
                "claude_code": {
                    "role": "Primary orchestrator + India data",
                    "assignment": "India (RBI, CCIL, FBIL, NSE) + yfinance + Orchestration + Merge",
                    "commands": [
                        f"{cd} && {py} multi_ai_collector.py loop --region india --interval 120",
                        f"{cd} && {py} multi_ai_collector.py loop --region yfinance --interval 600",
                    ],
                    "periodic_tasks": [
                        f"{cd} && {py} multi_ai_collector.py merge",
                        f"{cd} && {py} ai_bridge.py data-coverage --pretty",
                    ],
                },
                "kimi": {
                    "role": "US + Europe + World Bank data collector",
                    "assignment": "US (FRED, Treasury) + Europe (ECB, Euribor) + World Bank macro",
                    "commands": [
                        f"{cd} && {py} multi_ai_collector.py loop --region us --interval 300",
                        f"{cd} && {py} multi_ai_collector.py loop --region europe --interval 300",
                        f"{cd} && {py} multi_ai_collector.py loop --region worldbank --interval 3600",
                    ],
                    "single_scrape": {
                        "us": f"{cd} && {py} multi_ai_collector.py collect --region us",
                        "europe": f"{cd} && {py} multi_ai_collector.py collect --region europe",
                        "worldbank": f"{cd} && {py} multi_ai_collector.py collect --region worldbank",
                    },
                    "notes": "FRED public CSV works without API key. World Bank updates annually so scrape hourly.",
                },
                "codex": {
                    "role": "China + BIS + akshare data collector + validation",
                    "assignment": "China (PBoC, SHIBOR, LPR) + BIS (49 central banks) + akshare (China bonds)",
                    "commands": [
                        f"{cd} && {py} multi_ai_collector.py loop --region china --interval 300",
                        f"{cd} && {py} multi_ai_collector.py loop --region bis --interval 3600",
                        f"{cd} && {py} multi_ai_collector.py loop --region akshare --interval 1800",
                    ],
                    "single_scrape": {
                        "china": f"{cd} && {py} multi_ai_collector.py collect --region china",
                        "bis": f"{cd} && {py} multi_ai_collector.py collect --region bis",
                        "akshare": f"{cd} && {py} multi_ai_collector.py collect --region akshare",
                    },
                    "notes": "BIS updates daily. akshare has full China gov bond yield curve.",
                },
            },
            "quick_commands": {
                "scrape_everything_once": f"{cd} && {py} ai_bridge.py scrape-all --pretty",
                "check_coverage": f"{cd} && {py} ai_bridge.py data-coverage --pretty",
                "data_registry": f"{cd} && {py} ai_bridge.py data-registry --pretty",
                "merge_all": f"{cd} && {py} multi_ai_collector.py merge",
                "check_status": f"{cd} && {py} multi_ai_collector.py status",
            },
            "data_flow": (
                "Each region writes to data/collected/<region>_rates.jsonl. "
                "Merge combines all into global_merged.jsonl + global_training_data.csv. "
                "Training CSV is used by LSTM/GRU/Transformer models."
            ),
        },
        "environment": {
            "backend_dir": str(BACKEND_DIR),
            "python": py,
            "collection_dir": COLLECTION_DIR,
            "regions": list(REGION_FILES.keys()),
        },
    }

    print(json.dumps(instructions, indent=2, default=str))


def _update_status(region: str, fields_count: int, field_names: list):
    """Update the collection status (DB + file)."""
    # Write to DB if available
    if _use_db():
        _update_status_db(region, fields_count, field_names)

    # Always write file as fallback
    status = {}
    if os.path.exists(STATUS_FILE):
        try:
            with open(STATUS_FILE) as f:
                status = json.load(f)
        except (json.JSONDecodeError, OSError):
            pass

    status[region] = {
        "last_collection": datetime.now(timezone.utc).isoformat(),
        "last_fields_count": fields_count,
        "last_fields": field_names,
    }

    try:
        with open(STATUS_FILE, "w") as f:
            json.dump(status, f, indent=2, default=str)
    except OSError:
        pass


COMMANDS = {
    "collect": cmd_collect,
    "loop": cmd_loop,
    "merge": cmd_merge,
    "status": cmd_status,
    "orchestrate": cmd_orchestrate,
}


def main():
    parser = argparse.ArgumentParser(
        description="LiquiFi Multi-AI Data Collection Orchestrator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Divide data collection across AI agents:
  python multi_ai_collector.py orchestrate           # Get instructions for all agents
  python multi_ai_collector.py collect --region us    # Collect US data once
  python multi_ai_collector.py loop --region india    # Continuous India collection
  python multi_ai_collector.py merge                  # Merge all regional data
  python multi_ai_collector.py status                 # Check collection progress
        """,
    )
    parser.add_argument("command", choices=COMMANDS.keys(), help="Command to execute")
    parser.add_argument("--region", choices=list(REGION_FILES.keys()), default="india",
                        help="Region to collect data for")
    parser.add_argument("--interval", type=int, default=300,
                        help="Collection interval in seconds (for loop command)")
    args = parser.parse_args()

    COMMANDS[args.command](args)


if __name__ == "__main__":
    main()
