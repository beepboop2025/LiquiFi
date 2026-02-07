"""US Federal Reserve and Treasury data scraper.

Data sources (all free, NO API key needed):
1. FRED public CSV — Fed Funds, SOFR, full Treasury curve, VIX, DXY, commodities
2. FRED JSON API — same data with optional API key (richer queries)
3. Treasury.gov Fiscal Data API — aggregate Treasury rates

These are the most liquid and transparent rates in the world.
They directly affect INR rates via carry trade dynamics and USD/INR.
"""

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

import httpx

from data import cache

logger = logging.getLogger("liquifi.us_fed")

# FRED public CSV (no API key needed!)
FRED_CSV_BASE = "https://fred.stlouisfed.org/graph/fredgraph.csv"

# FRED JSON API (optional, needs free key from fred.stlouisfed.org)
FRED_API_KEY = os.getenv("FRED_API_KEY", "")
FRED_API_BASE = "https://api.stlouisfed.org/fred/series/observations"

TIMEOUT = 20
HEADERS = {
    "User-Agent": "LiquiFi/1.0 (Treasury Automation Research)",
    "Accept": "*/*",
}

# FRED series IDs for key US rates
FRED_SERIES = {
    # Federal Reserve rates
    "us_fed_funds": "DFF",              # Fed Funds Effective Rate
    "us_fed_target_upper": "DFEDTARU",  # Fed Funds Target Upper
    "us_fed_target_lower": "DFEDTARL",  # Fed Funds Target Lower
    "us_sofr": "SOFR",                  # Secured Overnight Financing Rate

    # Treasury yields (full curve)
    "us_tsy_1m": "DGS1MO",   # 1-Month Treasury
    "us_tsy_3m": "DGS3MO",   # 3-Month Treasury
    "us_tsy_6m": "DGS6MO",   # 6-Month Treasury
    "us_tsy_1y": "DGS1",     # 1-Year Treasury
    "us_tsy_2y": "DGS2",     # 2-Year Treasury
    "us_tsy_5y": "DGS5",     # 5-Year Treasury
    "us_tsy_10y": "DGS10",   # 10-Year Treasury (global benchmark)
    "us_tsy_30y": "DGS30",   # 30-Year Treasury

    # Spreads and indicators
    "us_tsy_10y2y_spread": "T10Y2Y",  # 10Y-2Y spread (recession indicator)

    # Market indicators
    "us_vix": "VIXCLS",        # VIX Volatility Index
    "us_dxy": "DTWEXBGS",      # Trade Weighted Dollar Index (Broad)

    # Commodities (affect inflation expectations)
    "us_wti_crude": "DCOILWTICO",  # WTI Crude Oil

    # Credit spreads
    "us_hy_spread": "BAMLH0A0HYM2",  # ICE BofA HY OAS
}

# Validation bounds
US_RATE_BOUNDS = {
    "us_fed_funds": (0.0, 10.0),
    "us_fed_target_upper": (0.0, 10.0),
    "us_fed_target_lower": (0.0, 10.0),
    "us_sofr": (0.0, 10.0),
    "us_tsy_1m": (0.0, 10.0),
    "us_tsy_3m": (0.0, 10.0),
    "us_tsy_6m": (0.0, 10.0),
    "us_tsy_1y": (0.0, 10.0),
    "us_tsy_2y": (0.0, 10.0),
    "us_tsy_5y": (0.0, 10.0),
    "us_tsy_10y": (0.0, 10.0),
    "us_tsy_30y": (0.0, 10.0),
    "us_tsy_10y2y_spread": (-3.0, 5.0),
    "us_vix": (5.0, 100.0),
    "us_dxy": (70.0, 160.0),
    "us_wti_crude": (10.0, 200.0),
    "us_hy_spread": (1.0, 25.0),
}


def scrape_us_fed() -> dict:
    """Scrape US Federal Reserve and Treasury data.

    Returns dict with keys like us_fed_funds, us_tsy_10y, us_sofr, etc.
    """
    cached = cache.get("us_fed")
    if cached:
        logger.debug("Using cached US Fed data")
        return cached

    rates: dict = {}

    # Strategy 1: FRED public CSV (no API key needed, most reliable)
    try:
        rates.update(_scrape_fred_csv())
    except Exception as exc:
        logger.warning("FRED CSV scrape failed: %s", exc)

    # Strategy 2: FRED JSON API (needs API key, richer queries)
    if FRED_API_KEY and len(rates) < 5:
        try:
            api_rates = _scrape_fred_api()
            for k, v in api_rates.items():
                rates.setdefault(k, v)
        except Exception as exc:
            logger.warning("FRED API scrape failed: %s", exc)

    # Validate bounds
    validated = {}
    for key, val in rates.items():
        bounds = US_RATE_BOUNDS.get(key)
        if bounds:
            lo, hi = bounds
            if lo <= val <= hi:
                validated[key] = val
            else:
                logger.warning("US rate %s=%.4f outside bounds [%.1f, %.1f], skipping", key, val, lo, hi)
        else:
            validated[key] = val

    if validated:
        logger.info("US Fed/Treasury scraped %d fields: %s", len(validated), list(validated.keys()))
        cache.put("us_fed", validated)
    else:
        logger.warning("No US data scraped")

    return validated


def _scrape_fred_csv() -> dict:
    """Fetch latest values from FRED public CSV download (no API key needed).

    FRED exposes CSV files at https://fred.stlouisfed.org/graph/fredgraph.csv?id=SERIES_ID
    Each CSV has columns: DATE, SERIES_ID with daily observations.
    """
    rates: dict = {}

    with httpx.Client(timeout=TIMEOUT, headers=HEADERS, follow_redirects=True) as client:
        for rate_key, series_id in FRED_SERIES.items():
            try:
                resp = client.get(FRED_CSV_BASE, params={"id": series_id})
                if resp.status_code != 200:
                    continue

                lines = resp.text.strip().split("\n")
                if len(lines) < 2:
                    continue

                # Walk backwards to find last non-empty value
                for line in reversed(lines):
                    parts = line.split(",")
                    if len(parts) < 2:
                        continue
                    val_str = parts[1].strip()
                    if val_str and val_str != ".":
                        try:
                            val = float(val_str)
                            rates[rate_key] = round(val, 4)
                            break
                        except ValueError:
                            continue

            except Exception as exc:
                logger.debug("FRED CSV %s failed: %s", series_id, exc)

    return rates


def _scrape_fred_api() -> dict:
    """Fetch latest observations from FRED JSON API (needs API key)."""
    rates: dict = {}
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")

    with httpx.Client(timeout=TIMEOUT, headers=HEADERS) as client:
        for rate_key, series_id in FRED_SERIES.items():
            try:
                params = {
                    "series_id": series_id,
                    "api_key": FRED_API_KEY,
                    "file_type": "json",
                    "sort_order": "desc",
                    "limit": 5,
                    "observation_start": week_ago,
                }
                resp = client.get(FRED_API_BASE, params=params)
                if resp.status_code != 200:
                    continue

                data = resp.json()
                observations = data.get("observations", [])

                for obs in observations:
                    val_str = obs.get("value", "")
                    if val_str and val_str != ".":
                        rates[rate_key] = round(float(val_str), 4)
                        break

            except Exception as exc:
                logger.debug("FRED API %s failed: %s", series_id, exc)

    return rates


# Convenience
scrape = scrape_us_fed
