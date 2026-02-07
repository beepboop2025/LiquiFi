"""
AI Orchestration Bridge for LiquiFi Treasury Automation.

Enables CLI-based AI tools (Claude Code, Kimi, Codex) running in the terminal
to interact with the running LiquiFi backend via a unified command interface.

Usage from terminal:
    python ai_bridge.py status          # Get system health + data quality
    python ai_bridge.py rates           # Get current rate snapshot
    python ai_bridge.py forecast        # Get LSTM forecast
    python ai_bridge.py quality         # Get data quality report
    python ai_bridge.py retrain         # Trigger model retraining
    python ai_bridge.py train-status    # Check training metadata
    python ai_bridge.py diagnose        # Run full diagnostic
    python ai_bridge.py export-rates    # Export rate history to CSV
    python ai_bridge.py config          # Show current config

This bridge outputs structured JSON that AI tools can parse and act upon.
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


def _api_url():
    """Get the backend API URL."""
    host = config.HOST if config.HOST != "0.0.0.0" else "localhost"
    return f"http://{host}:{config.PORT}"


def _fetch(endpoint: str) -> dict | None:
    """Fetch from local backend API."""
    import urllib.request
    import urllib.error

    url = f"{_api_url()}/api/{endpoint}"
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.URLError as e:
        return {"error": f"Backend unreachable at {url}: {e}"}
    except Exception as e:
        return {"error": str(e)}


def cmd_status(_args):
    """Get system health + data quality."""
    health = _fetch("health")
    if not health:
        return {"error": "Could not reach backend"}
    return {
        "command": "status",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "health": health,
        "backend_url": _api_url(),
    }


def cmd_rates(_args):
    """Get current rate snapshot."""
    data = _fetch("rates")
    if not data:
        return {"error": "Could not fetch rates"}
    return {
        "command": "rates",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "rates": data.get("rates", {}),
        "data_quality": data.get("dataQuality", {}),
        "source": data.get("source", {}),
    }


def cmd_forecast(_args):
    """Get LSTM forecast."""
    data = _fetch("forecast")
    if not data:
        return {"error": "Could not fetch forecast"}
    return {
        "command": "forecast",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": data.get("source", "unknown"),
        "horizon_hours": config.FORECAST_HORIZON,
        "clock_data_points": len(data.get("clockData", [])),
        "clock_data": data.get("clockData", []),
    }


def cmd_quality(_args):
    """Get data quality report."""
    data = _fetch("data-quality")
    if not data:
        return {"error": "Could not fetch data quality"}
    return {
        "command": "quality",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **data,
    }


def cmd_retrain(_args):
    """Trigger model retraining."""
    import urllib.request
    import urllib.error

    url = f"{_api_url()}/api/model/retrain"
    api_key = config.RETRAIN_API_KEY
    try:
        req = urllib.request.Request(
            url,
            method="POST",
            headers={
                "Accept": "application/json",
                "X-Api-Key": api_key,
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())
            return {
                "command": "retrain",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                **result,
            }
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        return {"error": f"Retrain failed: HTTP {e.code}", "detail": body}
    except Exception as e:
        return {"error": str(e)}


def cmd_train_status(_args):
    """Check training metadata. Tries DB first, falls back to JSON file."""
    # Try DB first
    try:
        from models.database import DATABASE_URL, get_db_context
        if not DATABASE_URL.startswith("sqlite"):
            from models.data_store import TrainingMetadata
            with get_db_context() as db:
                row = (
                    db.query(TrainingMetadata)
                    .filter(TrainingMetadata.metadata_type == "training_meta")
                    .order_by(TrainingMetadata.created_at.desc())
                    .first()
                )
                if row is not None:
                    import json as _json
                    meta = _json.loads(row.payload)
                    return {
                        "command": "train-status",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "source": "db",
                        **meta,
                    }
    except Exception:
        pass

    # Fall back to JSON file
    meta_path = config.META_PATH
    if not os.path.exists(meta_path):
        return {"command": "train-status", "status": "no_model_trained", "meta_path": meta_path}
    with open(meta_path) as f:
        meta = json.load(f)
    return {
        "command": "train-status",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **meta,
    }


def cmd_diagnose(_args):
    """Run full diagnostic."""
    results = {
        "command": "diagnose",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": [],
    }

    # Check 1: Backend reachable
    health = _fetch("health")
    results["checks"].append({
        "name": "backend_reachable",
        "status": "pass" if health and "error" not in health else "fail",
        "detail": health,
    })

    # Check 2: Model loaded
    if health and "error" not in health:
        results["checks"].append({
            "name": "model_loaded",
            "status": "pass" if health.get("model_loaded") else "warn",
            "detail": f"model_loaded={health.get('model_loaded')}",
        })

        # Check 3: Data quality
        scraping = health.get("scraping", {})
        real_count = scraping.get("real_fields_count", 0)
        total = scraping.get("total_fields", 34)
        pct = (real_count / total * 100) if total > 0 else 0
        results["checks"].append({
            "name": "data_quality",
            "status": "pass" if pct >= 50 else ("warn" if pct >= 25 else "fail"),
            "detail": f"{real_count}/{total} real fields ({pct:.0f}%)",
            "fallback_fields": scraping.get("fallback_fields", []),
        })

        # Check 4: Scrape freshness
        staleness = scraping.get("staleness_seconds")
        results["checks"].append({
            "name": "scrape_freshness",
            "status": "pass" if staleness and staleness < 60 else "warn",
            "detail": f"Last scrape {staleness}s ago" if staleness else "Never scraped",
        })

    # Check 5: Model file exists
    results["checks"].append({
        "name": "model_file",
        "status": "pass" if os.path.exists(config.MODEL_PATH) else "fail",
        "detail": config.MODEL_PATH,
        "size_mb": round(os.path.getsize(config.MODEL_PATH) / 1024 / 1024, 2) if os.path.exists(config.MODEL_PATH) else 0,
    })

    # Check 6: Seed data exists
    results["checks"].append({
        "name": "seed_data",
        "status": "pass" if os.path.exists(config.SEED_DATA_PATH) else "warn",
        "detail": config.SEED_DATA_PATH,
    })

    # Check 7: Live snapshots
    live_path = config.LIVE_SNAPSHOT_PATH
    if os.path.exists(live_path):
        import pandas as pd
        df = pd.read_csv(live_path)
        results["checks"].append({
            "name": "live_snapshots",
            "status": "pass" if len(df) > 0 else "warn",
            "detail": f"{len(df)} rows",
            "last_timestamp": str(df["timestamp"].iloc[-1]) if "timestamp" in df.columns and len(df) > 0 else None,
        })
    else:
        results["checks"].append({
            "name": "live_snapshots",
            "status": "warn",
            "detail": "No live snapshots file yet",
        })

    # Summary
    statuses = [c["status"] for c in results["checks"]]
    if "fail" in statuses:
        results["overall"] = "unhealthy"
    elif "warn" in statuses:
        results["overall"] = "degraded"
    else:
        results["overall"] = "healthy"

    return results


def cmd_export_rates(_args):
    """Export rate history to CSV."""
    live_path = config.LIVE_SNAPSHOT_PATH
    if not os.path.exists(live_path):
        return {"error": "No live snapshot data available"}
    import pandas as pd
    df = pd.read_csv(live_path)
    export_path = os.path.join(BACKEND_DIR, "exports", f"rates_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv")
    os.makedirs(os.path.dirname(export_path), exist_ok=True)
    df.to_csv(export_path, index=False)
    return {
        "command": "export-rates",
        "exported_rows": len(df),
        "path": export_path,
    }


def cmd_config(_args):
    """Show current configuration."""
    return {
        "command": "config",
        "server": {
            "host": config.HOST,
            "port": config.PORT,
            "cors_origins": config.CORS_ORIGINS,
            "require_https": config.REQUIRE_HTTPS,
        },
        "scraping": {
            "interval_s": config.SCRAPE_INTERVAL_S,
            "push_interval_s": config.RATE_PUSH_INTERVAL_S,
            "cache_ttl_s": config.CACHE_TTL_S,
        },
        "ml": {
            "model_path": config.MODEL_PATH,
            "seq_len": config.SEQ_LEN,
            "forecast_horizon": config.FORECAST_HORIZON,
            "lstm_hidden": config.LSTM_HIDDEN,
            "lstm_layers": config.LSTM_LAYERS,
            "mc_paths": config.MC_PATHS,
        },
        "data": {
            "seed_data_path": config.SEED_DATA_PATH,
            "live_snapshot_path": config.LIVE_SNAPSHOT_PATH,
            "max_rate_history": config.MAX_RATE_HISTORY,
        },
        "paths": {
            "model_exists": os.path.exists(config.MODEL_PATH),
            "seed_data_exists": os.path.exists(config.SEED_DATA_PATH),
            "live_snapshots_exist": os.path.exists(config.LIVE_SNAPSHOT_PATH),
        },
    }


def cmd_scrape_global(_args):
    """Scrape global macro data from all regions (India, US, Europe, China)."""
    from data.scrapers.global_macro import scrape_global, get_global_summary
    global_data = scrape_global()
    summary = get_global_summary()
    return {
        "command": "scrape-global",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_fields": global_data.get("metadata", {}).get("total_fields", 0),
        "regions": global_data.get("metadata", {}).get("regions", {}),
        "sources": global_data.get("metadata", {}).get("sources", {}),
        "elapsed_seconds": global_data.get("metadata", {}).get("elapsed_seconds", 0),
        "summary": summary,
        "all_rates": global_data.get("rates", {}),
    }


def cmd_scrape_region(args):
    """Scrape a specific region: india, us, europe, china, yfinance, mega."""
    region = getattr(args, "region", "india")
    result = {"command": "scrape-region", "region": region, "timestamp": datetime.now(timezone.utc).isoformat()}

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
    elif region == "mega":
        from data.scrapers.mega_scraper import scrape_mega
        mega_result = scrape_mega()
        rates = mega_result.get("rates", {})
    else:
        return {"error": f"Unknown region: {region}. Use: india, us, europe, china, yfinance, mega"}

    result["fields_scraped"] = len(rates)
    result["rates"] = rates
    return result


def cmd_data_coverage(_args):
    """Show data coverage across all regions — what we have vs. what's possible."""
    from data.scrapers.global_macro import scrape_global, GLOBAL_RATE_FIELDS
    global_data = scrape_global()
    rates = global_data.get("rates", {})

    coverage = {}
    total_possible = 0
    total_have = 0

    for region, fields in GLOBAL_RATE_FIELDS.items():
        have = [f for f in fields if f in rates]
        missing = [f for f in fields if f not in rates]
        coverage[region] = {
            "possible": len(fields),
            "scraped": len(have),
            "missing": missing,
            "coverage_pct": round(len(have) / len(fields) * 100, 1) if fields else 0,
        }
        total_possible += len(fields)
        total_have += len(have)

    return {
        "command": "data-coverage",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_possible_fields": total_possible,
        "total_scraped_fields": total_have,
        "overall_coverage_pct": round(total_have / total_possible * 100, 1) if total_possible else 0,
        "regions": coverage,
    }


def cmd_scrape_mega(_args):
    """Scrape deep data from mega libraries (BIS, akshare, World Bank, IMF)."""
    from data.scrapers.mega_scraper import scrape_mega, get_mega_data_summary
    mega_data = scrape_mega()
    summary = get_mega_data_summary()
    return {
        "command": "scrape-mega",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_fields": mega_data.get("metadata", {}).get("total_fields", 0),
        "elapsed_seconds": mega_data.get("metadata", {}).get("elapsed_seconds", 0),
        "sources": mega_data.get("metadata", {}).get("sources", {}),
        "capabilities": summary,
        "all_rates": mega_data.get("rates", {}),
    }


def cmd_scrape_all(_args):
    """Scrape ALL data sources — India + Global + Mega. Maximum data collection."""
    from data.scrapers import scrape_all_extended
    result = scrape_all_extended()
    rates = result.get("rates", {})
    metadata = result.get("metadata", {})

    # Categorize all scraped fields
    categories = {
        "india": [], "us": [], "europe": [], "china": [],
        "yfinance": [], "bis": [], "akshare": [], "worldbank": [],
        "imf": [], "other": [],
    }
    for key in sorted(rates.keys()):
        if key.startswith(("repo", "reverse_repo", "mibor", "call_money", "cblo",
                          "treps", "tbill", "gsec", "usdinr", "ois_", "sdf", "msf")):
            categories["india"].append(key)
        elif key.startswith("us_"):
            categories["us"].append(key)
        elif key.startswith(("ecb_", "euribor_", "eu_yield_", "estr")):
            categories["europe"].append(key)
        elif key.startswith("cn_"):
            categories["china"].append(key)
        elif key.startswith("yf_"):
            categories["yfinance"].append(key)
        elif key.startswith("bis_"):
            categories["bis"].append(key)
        elif key.startswith("ak_"):
            categories["akshare"].append(key)
        elif key.startswith("wb_"):
            categories["worldbank"].append(key)
        elif key.startswith("imf_"):
            categories["imf"].append(key)
        else:
            categories["other"].append(key)

    return {
        "command": "scrape-all",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_fields": len(rates),
        "categories": {k: {"count": len(v), "fields": v} for k, v in categories.items() if v},
        "sources": metadata.get("sources", {}),
        "all_rates": rates,
    }


def cmd_data_registry(_args):
    """Show full data registry — structured catalog of all available data points.

    This is the command for AI agents to understand what data is available.
    """
    from data.scrapers.global_macro import GLOBAL_RATE_FIELDS, scrape_global

    # Get current data to check availability
    global_data = scrape_global()
    rates = global_data.get("rates", {})

    registry = {
        "command": "data-registry",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_registered_fields": 0,
        "total_available_now": len(rates),
        "sources": {},
    }

    source_meta = {
        "india": {"description": "Indian money market (RBI, CCIL, FBIL, NSE)", "frequency": "30s", "type": "real-time"},
        "us": {"description": "US Fed/Treasury (FRED public CSV)", "frequency": "daily", "type": "official"},
        "europe": {"description": "ECB SDW (policy rates, Euribor, yield curve)", "frequency": "daily", "type": "official"},
        "china": {"description": "ChinaMoney CFETS (SHIBOR, LPR)", "frequency": "daily", "type": "official"},
        "yfinance": {"description": "Yahoo Finance (FX, bonds, commodities, indices)", "frequency": "15min-delayed", "type": "market"},
        "bis": {"description": "BIS policy rates (49 central banks via sdmx1)", "frequency": "daily", "type": "official"},
        "akshare": {"description": "China gov bond yield curve (akshare)", "frequency": "daily", "type": "official"},
        "worldbank": {"description": "World Bank macro (inflation, GDP, interest rates)", "frequency": "annual", "type": "macro"},
        "imf": {"description": "IMF commodity prices", "frequency": "monthly", "type": "commodity"},
    }

    total_fields = 0
    for region, fields in GLOBAL_RATE_FIELDS.items():
        available = [f for f in fields if f in rates]
        meta = source_meta.get(region, {"description": region, "frequency": "unknown", "type": "unknown"})
        registry["sources"][region] = {
            **meta,
            "total_fields": len(fields),
            "available_now": len(available),
            "coverage_pct": round(len(available) / len(fields) * 100, 1) if fields else 0,
            "fields": {f: {"available": f in rates, "value": rates.get(f)} for f in fields},
        }
        total_fields += len(fields)

    registry["total_registered_fields"] = total_fields

    return registry


COMMANDS = {
    "status": cmd_status,
    "rates": cmd_rates,
    "forecast": cmd_forecast,
    "quality": cmd_quality,
    "retrain": cmd_retrain,
    "train-status": cmd_train_status,
    "diagnose": cmd_diagnose,
    "export-rates": cmd_export_rates,
    "config": cmd_config,
    "scrape-global": cmd_scrape_global,
    "scrape-region": cmd_scrape_region,
    "scrape-mega": cmd_scrape_mega,
    "scrape-all": cmd_scrape_all,
    "data-coverage": cmd_data_coverage,
    "data-registry": cmd_data_registry,
}


def main():
    parser = argparse.ArgumentParser(
        description="LiquiFi AI Bridge — CLI interface for AI tools (Claude Code, Kimi, Codex)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python ai_bridge.py status          # System health
  python ai_bridge.py rates           # Current Indian rates
  python ai_bridge.py scrape-global   # Global data (India+US+EU+CN+yfinance+mega)
  python ai_bridge.py scrape-region --region us   # Scrape US Fed/Treasury only
  python ai_bridge.py scrape-mega     # Deep data (BIS, akshare, World Bank, IMF)
  python ai_bridge.py scrape-all      # ALL sources combined (200+ fields)
  python ai_bridge.py data-coverage   # Coverage stats across all regions
  python ai_bridge.py data-registry   # Full structured catalog (for AI agents)
  python ai_bridge.py diagnose        # Full diagnostic
  python ai_bridge.py retrain         # Trigger model retraining
        """,
    )
    parser.add_argument("command", choices=COMMANDS.keys(), help="Command to execute")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")
    parser.add_argument("--region", choices=["india", "us", "europe", "china", "yfinance", "mega"],
                        default="india", help="Region for scrape-region command")
    args = parser.parse_args()

    result = COMMANDS[args.command](args)
    indent = 2 if args.pretty else None
    print(json.dumps(result, indent=indent, default=str))


if __name__ == "__main__":
    main()
