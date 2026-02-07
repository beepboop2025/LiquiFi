"""PBoC (People's Bank of China) and Chinese market data scraper.

Data sources (all free, no API key needed):
1. ChinaMoney (CFETS) API — SHIBOR rates, LPR, bond yields
2. PBoC official website — Policy rate announcements
3. ChinaMoney HTML — Fallback for SHIBOR/LPR

China is India's major trade partner and competitor for capital flows.
PBoC policy directly affects EM risk appetite and USD strength.
"""

import logging
import re
from datetime import datetime, timezone
from typing import Dict, Optional

import httpx

from data import cache

logger = logging.getLogger("liquifi.pboc")

# ChinaMoney (CFETS) API endpoints — these return JSON directly
CHINAMONEY_SHIBOR = "https://www.chinamoney.com.cn/ags/ms/cm-u-bk-shibor/ShiborHis"
CHINAMONEY_LPR = "https://www.chinamoney.com.cn/ags/ms/cm-u-bk-currency/LprHis"

TIMEOUT = 20
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.chinamoney.com.cn/",
}

# Validation bounds
CN_RATE_BOUNDS = {
    "cn_lpr_1y": (1.0, 8.0),
    "cn_lpr_5y": (1.0, 8.0),
    "cn_shibor_on": (0.1, 12.0),
    "cn_shibor_1w": (0.1, 12.0),
    "cn_shibor_2w": (0.1, 12.0),
    "cn_shibor_1m": (0.1, 12.0),
    "cn_shibor_3m": (0.1, 12.0),
    "cn_shibor_6m": (0.1, 12.0),
    "cn_shibor_9m": (0.1, 12.0),
    "cn_shibor_1y": (0.1, 12.0),
}


def scrape_pboc() -> dict:
    """Scrape PBoC, SHIBOR, and LPR data from ChinaMoney (CFETS).

    Returns dict with keys like cn_lpr_1y, cn_shibor_on, etc.
    """
    cached = cache.get("pboc")
    if cached:
        logger.debug("Using cached PBoC data")
        return cached

    rates: dict = {}

    # Strategy 1: ChinaMoney SHIBOR API (most reliable)
    try:
        rates.update(_scrape_shibor())
    except Exception as exc:
        logger.warning("SHIBOR API scrape failed: %s", exc)

    # Strategy 2: ChinaMoney LPR API
    try:
        rates.update(_scrape_lpr())
    except Exception as exc:
        logger.warning("LPR API scrape failed: %s", exc)

    # Validate
    validated = {}
    for key, val in rates.items():
        bounds = CN_RATE_BOUNDS.get(key)
        if bounds:
            lo, hi = bounds
            if lo <= val <= hi:
                validated[key] = val
            else:
                logger.warning("CN rate %s=%.4f outside bounds, skipping", key, val)
        else:
            validated[key] = val

    if validated:
        logger.info("PBoC scraped %d fields: %s", len(validated), list(validated.keys()))
        cache.put("pboc", validated)
    else:
        logger.warning("No PBoC data scraped")

    return validated


def _scrape_shibor() -> dict:
    """Fetch SHIBOR rates from ChinaMoney CFETS API.

    API returns JSON with structure:
    {
        "records": [
            {
                "ON": "1.2770",
                "1W": "1.4350",
                "2W": "1.5040",
                "1M": "1.5500",
                "3M": "1.5800",
                "6M": "1.5970",
                "9M": "1.6058",
                "1Y": "1.6169",
                "showDateEN": "06 Feb 2026"
            },
            ...
        ]
    }
    """
    rates: dict = {}

    resp = httpx.get(CHINAMONEY_SHIBOR, headers=HEADERS, timeout=TIMEOUT, follow_redirects=True)
    if resp.status_code != 200:
        logger.debug("SHIBOR API returned %d", resp.status_code)
        return rates

    data = resp.json()
    records = data.get("records", [])
    if not records:
        return rates

    # Take the first record (most recent)
    latest = records[0]

    # Map ChinaMoney field names to our keys
    field_map = {
        "ON": "cn_shibor_on",
        "1W": "cn_shibor_1w",
        "2W": "cn_shibor_2w",
        "1M": "cn_shibor_1m",
        "3M": "cn_shibor_3m",
        "6M": "cn_shibor_6m",
        "9M": "cn_shibor_9m",
        "1Y": "cn_shibor_1y",
    }

    for src_key, dst_key in field_map.items():
        val_str = latest.get(src_key)
        if val_str:
            try:
                val = float(val_str)
                rates[dst_key] = round(val, 4)
            except (ValueError, TypeError):
                pass

    # Include the date for reference
    date_str = latest.get("showDateEN") or latest.get("showDateCN")
    if date_str:
        rates["_cn_shibor_date"] = date_str

    return rates


def _scrape_lpr() -> dict:
    """Fetch LPR (Loan Prime Rate) from ChinaMoney CFETS API.

    API returns JSON with structure:
    {
        "records": [
            {
                "1Y": "3.00",
                "5Y": "3.50",
                "showDateEN": "20 Jan 2026"
            },
            ...
        ]
    }
    """
    rates: dict = {}

    resp = httpx.get(CHINAMONEY_LPR, headers=HEADERS, timeout=TIMEOUT, follow_redirects=True)
    if resp.status_code != 200:
        logger.debug("LPR API returned %d", resp.status_code)
        return rates

    data = resp.json()
    records = data.get("records", [])
    if not records:
        return rates

    # Take the first record (most recent LPR fixing)
    latest = records[0]

    # LPR rates
    for src_key, dst_key in [("1Y", "cn_lpr_1y"), ("5Y", "cn_lpr_5y")]:
        val_str = latest.get(src_key)
        if val_str:
            try:
                val = float(val_str)
                rates[dst_key] = round(val, 4)
            except (ValueError, TypeError):
                pass

    date_str = latest.get("showDateEN") or latest.get("showDateCN")
    if date_str:
        rates["_cn_lpr_date"] = date_str

    return rates


# Convenience
scrape = scrape_pboc
