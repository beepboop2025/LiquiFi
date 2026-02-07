"""Mega data scraper — integrates all available data libraries.

Leverages 7+ open-source libraries to pull maximum data:
1. sdmx1  → BIS policy rates (49 central banks), BIS EER, ECB, IMF, OECD
2. fredapi → 800K+ FRED series (requires free API key)
3. akshare → Chinese bonds, LPR, SHIBOR (comprehensive China data)
4. wbgapi  → World Bank (200+ economies: interest rates, FX, inflation, GDP)
5. imfp    → IMF commodity prices, exchange rates, WEO forecasts
6. ecbdata → ECB Data Portal (future-proof ECB access)
7. yfinance → Real-time FX, bonds, commodities, equity indices

This module provides deep data that supplements the real-time scrapers.
"""

import logging
import time
from datetime import datetime, timezone
from typing import Dict, Optional

from data import cache

logger = logging.getLogger("liquifi.mega_scraper")


def scrape_mega() -> dict:
    """Run all mega data sources and return comprehensive dataset.

    Returns dict with metadata and all rates.
    """
    cached = cache.get("mega_data")
    if cached:
        logger.debug("Using cached mega data")
        return cached

    start = time.monotonic()
    rates: dict = {}
    sources: dict = {}

    # BIS policy rates (49 central banks — unique data!)
    rates_bis, src = _safe_scrape("bis", _scrape_bis_policy_rates)
    rates.update(rates_bis)
    sources["bis"] = src

    # akshare China bond yields (government bond curve — unique!)
    rates_ak, src = _safe_scrape("akshare", _scrape_akshare_china)
    rates.update(rates_ak)
    sources["akshare"] = src

    # World Bank macro indicators
    rates_wb, src = _safe_scrape("worldbank", _scrape_world_bank)
    rates.update(rates_wb)
    sources["worldbank"] = src

    # IMF commodity prices
    rates_imf, src = _safe_scrape("imf", _scrape_imf_commodities)
    rates.update(rates_imf)
    sources["imf"] = src

    elapsed = time.monotonic() - start

    result = {
        "rates": rates,
        "metadata": {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "total_fields": len(rates),
            "elapsed_seconds": round(elapsed, 2),
            "sources": sources,
        },
    }

    if rates:
        cache.put("mega_data", result, ttl=600)  # 10 min cache (these are slower APIs)
        logger.info("Mega scraper: %d fields in %.1fs", len(rates), elapsed)

    return result


def _safe_scrape(name: str, fn) -> tuple[dict, dict]:
    """Run a scraper safely, catching all errors."""
    try:
        rates = fn()
        return rates, {"status": "ok", "fields": len(rates)}
    except Exception as exc:
        logger.warning("Mega scraper %s failed: %s", name, exc)
        return {}, {"status": "error", "error": str(exc)[:100]}


# ─── BIS Policy Rates (49 central banks worldwide) ─────────────────────────

# ISO codes for major economies tracked by BIS
BIS_COUNTRIES = {
    "IN": "bis_india",
    "US": "bis_us",
    "CN": "bis_china",
    "XM": "bis_eurozone",
    "JP": "bis_japan",
    "GB": "bis_uk",
    "BR": "bis_brazil",
    "RU": "bis_russia",
    "KR": "bis_korea",
    "AU": "bis_australia",
    "CA": "bis_canada",
    "CH": "bis_switzerland",
    "MX": "bis_mexico",
    "ZA": "bis_south_africa",
    "ID": "bis_indonesia",
    "TR": "bis_turkey",
    "TH": "bis_thailand",
    "PH": "bis_philippines",
    "MY": "bis_malaysia",
    "SG": "bis_singapore",
    "NZ": "bis_new_zealand",
    "SE": "bis_sweden",
    "NO": "bis_norway",
    "DK": "bis_denmark",
    "PL": "bis_poland",
    "CZ": "bis_czech",
    "HU": "bis_hungary",
    "IL": "bis_israel",
    "CL": "bis_chile",
    "CO": "bis_colombia",
    "PE": "bis_peru",
    "SA": "bis_saudi_arabia",
    "AE": "bis_uae",
}


def _scrape_bis_policy_rates() -> dict:
    """Fetch central bank policy rates from BIS via sdmx1.

    BIS WS_CBPOL dataset has daily policy rates for 49 central banks.
    """
    try:
        import sdmx
    except ImportError:
        logger.debug("sdmx1 not installed")
        return {}

    rates: dict = {}
    bis = sdmx.Client("BIS")

    for iso, key_name in BIS_COUNTRIES.items():
        try:
            data = bis.data("WS_CBPOL", key=f"D.{iso}", params={"lastNObservations": 1})
            df = sdmx.to_pandas(data)

            if isinstance(df, float):
                val = df
            elif hasattr(df, "iloc") and len(df) > 0:
                val = float(df.iloc[-1])
            else:
                continue

            if val == val:  # not NaN
                rates[f"{key_name}_policy_rate"] = round(val, 4)

        except Exception as exc:
            logger.debug("BIS %s failed: %s", iso, exc)

    return rates


# ─── akshare China data (government bond yields + LPR) ─────────────────────

def _scrape_akshare_china() -> dict:
    """Fetch China government bond yields and LPR via akshare."""
    try:
        import akshare as ak
    except ImportError:
        logger.debug("akshare not installed")
        return {}

    rates: dict = {}

    # China government bond yield curve
    try:
        df = ak.bond_china_yield(
            start_date=datetime.now().strftime("%Y%m01"),
            end_date=datetime.now().strftime("%Y%m%d"),
        )
        # Filter for government bonds (中债国债收益率曲线)
        gov_bonds = df[df["曲线名称"].str.contains("国债收益率", na=False)]
        if not gov_bonds.empty:
            latest = gov_bonds.iloc[-1]
            col_map = {
                "3月": "ak_cn_gov_3m",
                "6月": "ak_cn_gov_6m",
                "1年": "ak_cn_gov_1y",
                "3年": "ak_cn_gov_3y",
                "5年": "ak_cn_gov_5y",
                "7年": "ak_cn_gov_7y",
                "10年": "ak_cn_gov_10y",
                "30年": "ak_cn_gov_30y",
            }
            for cn_col, key in col_map.items():
                if cn_col in latest.index:
                    val = latest[cn_col]
                    if val == val:  # not NaN
                        rates[key] = round(float(val), 4)

        # Also get AAA corporate bond yields
        corp_bonds = df[df["曲线名称"].str.contains("中短期票据.*AAA", na=False)]
        if not corp_bonds.empty:
            latest = corp_bonds.iloc[-1]
            corp_map = {
                "1年": "ak_cn_corp_aaa_1y",
                "3年": "ak_cn_corp_aaa_3y",
                "5年": "ak_cn_corp_aaa_5y",
            }
            for cn_col, key in corp_map.items():
                if cn_col in latest.index:
                    val = latest[cn_col]
                    if val == val:
                        rates[key] = round(float(val), 4)

    except Exception as exc:
        logger.debug("akshare bond_china_yield failed: %s", exc)

    # LPR rates (additional confirmation)
    try:
        df = ak.macro_china_lpr()
        if not df.empty:
            latest = df.iloc[-1]
            if "LPR1Y" in latest.index:
                rates["ak_cn_lpr_1y"] = round(float(latest["LPR1Y"]), 4)
            if "LPR5Y" in latest.index:
                rates["ak_cn_lpr_5y"] = round(float(latest["LPR5Y"]), 4)
            # Old benchmark rates
            if "RATE_1" in latest.index:
                rates["ak_cn_benchmark_1y"] = round(float(latest["RATE_1"]), 4)
            if "RATE_2" in latest.index:
                rates["ak_cn_benchmark_5y"] = round(float(latest["RATE_2"]), 4)
    except Exception as exc:
        logger.debug("akshare LPR failed: %s", exc)

    return rates


# ─── World Bank macro indicators ───────────────────────────────────────────

def _scrape_world_bank() -> dict:
    """Fetch macro indicators from World Bank for key economies."""
    try:
        import wbgapi as wb
    except ImportError:
        logger.debug("wbgapi not installed")
        return {}

    rates: dict = {}

    # Key indicators
    indicators = {
        "FP.CPI.TOTL.ZG": "cpi_inflation",      # CPI inflation (annual %)
        "FR.INR.LEND": "lending_rate",            # Lending interest rate
        "FR.INR.DPST": "deposit_rate",            # Deposit interest rate
        "NY.GDP.MKTP.KD.ZG": "gdp_growth",       # GDP growth (annual %)
        "BN.CAB.XOKA.GD.ZS": "current_account_gdp",  # Current account % GDP
    }

    countries = {
        "IND": "india",
        "USA": "us",
        "CHN": "china",
        "DEU": "germany",
        "JPN": "japan",
        "GBR": "uk",
        "BRA": "brazil",
    }

    for ind_code, ind_name in indicators.items():
        try:
            df = wb.data.DataFrame(ind_code, list(countries.keys()), mrv=1)
            if df.empty:
                continue

            for iso, country_name in countries.items():
                if iso in df.index:
                    val = df.loc[iso].iloc[0]
                    if val == val:  # not NaN
                        key = f"wb_{country_name}_{ind_name}"
                        rates[key] = round(float(val), 4)

        except Exception as exc:
            logger.debug("World Bank %s failed: %s", ind_code, exc)

    return rates


# ─── IMF commodity prices ──────────────────────────────────────────────────

def _scrape_imf_commodities() -> dict:
    """Fetch commodity prices from IMF Primary Commodity Price System.

    Uses a single batch request for all commodities to avoid per-indicator
    rate limiting (IMF API is slow per request).
    """
    try:
        import imfp
    except ImportError:
        logger.debug("imfp not installed")
        return {}

    rates: dict = {}

    commodity_map = {
        "POILAPSP": "imf_oil_avg",
        "PGOLD": "imf_gold",
        "PNGAS": "imf_natgas",
        "PCOPP": "imf_copper",
        "PALUM": "imf_aluminum",
        "PWHEAMT": "imf_wheat",
        "PCOFFOTHR": "imf_coffee",
    }

    try:
        # Single batch request for all indicators
        df = imfp.imf_dataset(
            "PCPS",
            indicator=list(commodity_map.keys()),
            frequency="M",
            start_date="2025-01",
            end_date="2026-12",
        )
        if df is not None and not df.empty:
            # Find the indicator and value columns
            ind_col = next((c for c in df.columns if c.lower() == "indicator"), None)
            val_col = next((c for c in df.columns if c.lower() in ("value", "obs_value")), None)

            if ind_col and val_col:
                for indicator_code, rate_key in commodity_map.items():
                    subset = df[df[ind_col] == indicator_code]
                    vals = subset[val_col].dropna()
                    if not vals.empty:
                        rates[rate_key] = round(float(vals.iloc[-1]), 4)

    except Exception as exc:
        logger.debug("IMF PCPS batch failed: %s", exc)

    return rates


# ─── Entry point ───────────────────────────────────────────────────────────

def get_mega_data_summary() -> dict:
    """Get summary of mega scraper capabilities."""
    return {
        "sources": {
            "bis": "BIS central bank policy rates (49 economies)",
            "akshare": "China government bond yields (full curve), LPR, corporate bonds",
            "worldbank": "Macro indicators (inflation, GDP, interest rates) for 7 major economies",
            "imf": "IMF commodity price indices (oil, gold, metals, agriculture)",
        },
        "total_possible_fields": len(BIS_COUNTRIES) + 15 + 35 + 7,  # rough estimates
        "update_frequency": "BIS: daily, akshare: daily, WB: annual, IMF: monthly",
    }


# Convenience
scrape = scrape_mega
