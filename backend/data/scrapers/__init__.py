"""Money market and global macro data scrapers.

This package provides scrapers for multiple sources across 4 regions:

India:
- FBIL (Financial Benchmarks India): MIBOR and reference rates
- RBI (Reserve Bank of India): Policy rates and key statistics
- CCIL (Clearing Corporation of India): Call money and TREPS rates
- NSE (National Stock Exchange): Additional money market data

US:
- Federal Reserve (FRED API): Fed Funds, SOFR, Treasury curve, VIX, DXY
- Treasury.gov: Treasury yields and auction data

Europe:
- ECB (European Central Bank): Policy rates, ESTR, Euribor
- Bundesbank: German Bund yields

China:
- PBoC (People's Bank of China): LPR, MLF, policy rates
- ChinaMoney (CFETS): SHIBOR, bond yields

Usage:
    from data.scrapers import scrape_all, scrape_global

    # India only (original behavior)
    rates = scrape_all()

    # Full global macro snapshot (Bloomberg-level)
    global_data = scrape_global()
"""

import logging
from typing import Dict, Any

# India scrapers
from data.scrapers.rbi import scrape_rbi
from data.scrapers.fbil import scrape_fbil
from data.scrapers.ccil import scrape_ccil
from data.scrapers.nse import scrape_nse

# Global scrapers
from data.scrapers.us_fed import scrape_us_fed
from data.scrapers.ecb import scrape_ecb
from data.scrapers.pboc import scrape_pboc
from data.scrapers.yfinance_global import scrape_yfinance

# Mega data libraries (BIS, akshare, World Bank, IMF)
from data.scrapers.mega_scraper import scrape_mega

# US Treasury Fiscal Data
from data.scrapers.us_treasury_fiscal import scrape_us_treasury_fiscal

# Unified global macro
from data.scrapers.global_macro import (
    scrape_global,
    get_global_summary,
    GLOBAL_RATE_FIELDS,
    get_all_field_names,
)

logger = logging.getLogger("liquifi.scrapers")


def scrape_all() -> Dict[str, Any]:
    """Scrape money market rates from all Indian sources (backwards compatible).

    For full global data, use scrape_global() instead.
    """
    rates: Dict[str, Any] = {}
    source_log: Dict[str, list] = {}

    # Source 1: RBI (most authoritative for policy rates)
    try:
        rbi_data = scrape_rbi()
        rates.update(rbi_data)
        source_log["rbi"] = list(rbi_data.keys())
        logger.info("RBI scraped %d fields", len(rbi_data))
    except Exception as exc:
        logger.warning("RBI scraper failed: %s", exc)
        source_log["rbi"] = []

    # Source 2: FBIL (authoritative for MIBOR)
    try:
        fbil_data = scrape_fbil()
        for key, value in fbil_data.items():
            if key not in rates or "mibor" in key:
                rates[key] = value
        source_log["fbil"] = list(fbil_data.keys())
        logger.info("FBIL scraped %d fields", len(fbil_data))
    except Exception as exc:
        logger.warning("FBIL scraper failed: %s", exc)
        source_log["fbil"] = []

    # Source 3: CCIL (best for call money rates)
    try:
        ccil_data = scrape_ccil()
        priority_fields = {"call_money_high", "call_money_low", "cblo_bid", "cblo_ask"}
        for key, value in ccil_data.items():
            if key in priority_fields or key not in rates:
                rates[key] = value
        source_log["ccil"] = list(ccil_data.keys())
        logger.info("CCIL scraped %d fields", len(ccil_data))
    except Exception as exc:
        logger.warning("CCIL scraper failed: %s", exc)
        source_log["ccil"] = []

    # Source 4: NSE (fallback/confirmation)
    try:
        nse_data = scrape_nse()
        for key, value in nse_data.items():
            if key not in rates:
                rates[key] = value
        source_log["nse"] = list(nse_data.keys())
        logger.info("NSE scraped %d fields", len(nse_data))
    except Exception as exc:
        logger.warning("NSE scraper failed: %s", exc)
        source_log["nse"] = []

    logger.info(
        "Scraping complete. Total fields: %d. Sources: %s",
        len(rates),
        {k: len(v) for k, v in source_log.items()}
    )

    return rates


def scrape_all_global() -> Dict[str, Any]:
    """Scrape ALL sources including global macro data.

    Returns flat dict merging India + US + Europe + China rates.
    """
    global_data = scrape_global()
    return global_data.get("rates", {})


def get_source_priority(field: str) -> list[str]:
    """Get the priority order of sources for a given field."""
    field_lower = field.lower()

    # US fields
    if field_lower.startswith("us_"):
        return ["us_fed"]

    # European fields
    if field_lower.startswith(("ecb_", "euribor_", "de_bund_", "estr")):
        return ["ecb"]

    # China fields
    if field_lower.startswith(("cn_", "usdcny")):
        return ["pboc"]

    # EUR/USD
    if field_lower == "eurusd":
        return ["ecb"]

    # India fields
    if field_lower in {"repo", "reverse_repo", "sdf", "msf"}:
        return ["rbi", "fbil"]
    if "mibor" in field_lower:
        return ["fbil", "nse", "ccil"]
    if "call_money" in field_lower:
        return ["ccil", "fbil", "nse"]
    if "cblo" in field_lower or "treps" in field_lower:
        return ["ccil", "fbil"]
    if "tbill" in field_lower:
        return ["rbi", "fbil", "nse"]
    if "gsec" in field_lower:
        return ["rbi", "fbil"]
    if "usdinr" in field_lower:
        return ["rbi", "fbil"]

    return ["rbi", "fbil", "ccil", "nse", "us_fed", "ecb", "pboc"]


# Export convenience function
scrape = scrape_all


def scrape_all_extended() -> Dict[str, Any]:
    """Extended scraping — all standard scrapers PLUS mega data libraries.

    Combines India scrapers + global scrapers + mega libraries (BIS, akshare,
    World Bank, IMF) into a single comprehensive dataset.

    Returns:
        Dict with all scraped rates plus metadata about sources used.
    """
    rates: Dict[str, Any] = {}
    source_log: Dict[str, list] = {}

    # Start with standard Indian scrapers
    logger.info("Starting extended scrape with all sources...")

    for name, fn in [("rbi", scrape_rbi), ("ccil", scrape_ccil),
                     ("fbil", scrape_fbil), ("nse", scrape_nse)]:
        try:
            data = fn()
            rates.update(data)
            source_log[name] = list(data.keys())
            logger.info("%s: %d fields", name, len(data))
        except Exception as exc:
            logger.warning("%s failed: %s", name, exc)
            source_log[name] = []

    # Global macro data (US Fed, ECB, PBoC, yfinance, mega)
    try:
        global_data = scrape_global()
        global_rates = global_data.get("rates", {})
        # Only add non-India fields to avoid overwriting
        india_prefixes = ("repo", "reverse_repo", "sdf", "msf", "mibor",
                         "call_money", "cblo", "treps", "tbill", "gsec", "usdinr")
        for key, value in global_rates.items():
            if not any(key.startswith(p) for p in india_prefixes):
                rates[key] = value
        added = [k for k in global_rates if not any(k.startswith(p) for p in india_prefixes)]
        source_log["global_macro"] = added
        logger.info("Global macro: %d fields", len(added))
    except Exception as exc:
        logger.warning("Global macro failed: %s", exc)
        source_log["global_macro"] = []

    total_fields = len(rates)
    source_count = sum(1 for v in source_log.values() if v)

    logger.info(
        "Extended scraping complete. Total: %d fields from %d active sources.",
        total_fields, source_count,
    )

    return {
        "rates": rates,
        "metadata": {
            "total_fields": total_fields,
            "sources": source_log,
        }
    }

__all__ = [
    # India
    "scrape_all", "scrape", "scrape_rbi", "scrape_fbil", "scrape_ccil", "scrape_nse",
    # Global
    "scrape_us_fed", "scrape_ecb", "scrape_pboc", "scrape_yfinance",
    # Mega data libraries
    "scrape_mega",
    # US Treasury Fiscal
    "scrape_us_treasury_fiscal",
    # Unified
    "scrape_global", "scrape_all_global", "get_global_summary",
    "GLOBAL_RATE_FIELDS", "get_all_field_names",
    # Extended
    "scrape_all_extended",
    # Utilities
    "get_source_priority",
]
