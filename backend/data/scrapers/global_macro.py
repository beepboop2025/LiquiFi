"""Unified global macro data scraper — Bloomberg terminal-level coverage.

Orchestrates all regional scrapers, yfinance, and mega data libraries
to produce a single comprehensive snapshot of global money market and macro data.

Coverage:
- India: RBI, CCIL, FBIL (36 fields: MIBOR, T-bills, OIS, CD, swaps, FX, forward premia)
- US: FRED (Fed Funds, SOFR, full Treasury curve, VIX, DXY) (17+ rates)
- US Fiscal: Treasury Fiscal Data API (TGA balance, debt, auctions, avg rates) (30+ fields)
- Europe: ECB (policy rates, ESTR, Euribor, yield curve) (12+ rates)
- China: ChinaMoney CFETS (SHIBOR curve, LPR) (12+ rates)
- Global markets via yfinance: FX, bonds, commodities, indices (25+ rates)
- Mega libraries: BIS (49 central banks), akshare (China bonds), World Bank, IMF (70+ rates)

Total: 210+ real market data points from official sources.
"""

import logging
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional

from data import cache

logger = logging.getLogger("liquifi.global_macro")


def scrape_global() -> dict:
    """Scrape all global macro data from all regions.

    Returns a flat dict with region-prefixed keys, plus metadata.
    """
    cached = cache.get("global_macro")
    if cached:
        logger.debug("Using cached global macro data")
        return cached

    start = time.monotonic()
    rates: dict = {}
    sources: dict = {}
    errors: list = []

    # India (existing scrapers)
    rates_india, src = _scrape_region("india", _scrape_india)
    rates.update(rates_india)
    sources["india"] = src

    # US Fed / Treasury
    rates_us, src = _scrape_region("us", _scrape_us)
    rates.update(rates_us)
    sources["us"] = src

    # Europe / ECB
    rates_eu, src = _scrape_region("europe", _scrape_europe)
    rates.update(rates_eu)
    sources["europe"] = src

    # China / PBoC
    rates_cn, src = _scrape_region("china", _scrape_china)
    rates.update(rates_cn)
    sources["china"] = src

    # yfinance (global markets — FX, commodities, indices, bonds)
    rates_yf, src = _scrape_region("yfinance", _scrape_yfinance)
    # yfinance supplements but doesn't overwrite primary sources
    for k, v in rates_yf.items():
        rates.setdefault(k, v)
    sources["yfinance"] = src

    # US Treasury Fiscal Data (TGA, debt, auctions, avg rates)
    rates_fiscal, src = _scrape_region("us_fiscal", _scrape_us_fiscal)
    for k, v in rates_fiscal.items():
        rates.setdefault(k, v)
    sources["us_fiscal"] = src

    # Mega data libraries (BIS, akshare, World Bank, IMF)
    rates_mega, src = _scrape_region("mega", _scrape_mega)
    # Mega supplements — doesn't overwrite primary API sources
    for k, v in rates_mega.items():
        rates.setdefault(k, v)
    sources["mega"] = src

    elapsed = time.monotonic() - start

    result = {
        "rates": rates,
        "metadata": {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "total_fields": len(rates),
            "elapsed_seconds": round(elapsed, 2),
            "sources": sources,
            "regions": {
                "india": len(rates_india),
                "us": len(rates_us),
                "europe": len(rates_eu),
                "china": len(rates_cn),
                "yfinance": len(rates_yf),
                "us_fiscal": len(rates_fiscal),
                "mega": len(rates_mega),
            },
        },
    }

    if rates:
        cache.put("global_macro", result, ttl=180)  # 3 min cache
        logger.info(
            "Global macro: %d total fields (IN:%d US:%d EU:%d CN:%d YF:%d FISCAL:%d MEGA:%d) in %.1fs",
            len(rates), len(rates_india), len(rates_us), len(rates_eu),
            len(rates_cn), len(rates_yf), len(rates_fiscal), len(rates_mega), elapsed,
        )

    return result


def _scrape_region(name: str, fn) -> tuple[dict, dict]:
    """Scrape a region and return (rates, source_info)."""
    try:
        rates = fn()
        return rates, {"status": "ok", "fields": len(rates), "keys": list(rates.keys())}
    except Exception as exc:
        logger.warning("%s scrape failed: %s", name, exc)
        return {}, {"status": "error", "error": str(exc)}


def _scrape_india() -> dict:
    """Scrape all Indian market data."""
    from data.scrapers.rbi import scrape_rbi
    from data.scrapers.ccil import scrape_ccil
    from data.scrapers.fbil import scrape_fbil
    from data.scrapers.nse import scrape_nse

    rates: dict = {}

    # RBI (most authoritative for policy rates)
    try:
        rbi = scrape_rbi()
        rates.update(rbi)
    except Exception as exc:
        logger.debug("India/RBI failed: %s", exc)

    # FBIL (authoritative for MIBOR, T-bills, OIS, CD, swaps, FX, forward premia)
    try:
        fbil = scrape_fbil()
        for k, v in fbil.items():
            # FBIL is authoritative for benchmarks — overwrite non-RBI data
            if k not in rates or "mibor" in k or "tbill" in k or "ois" in k:
                rates[k] = v
            else:
                rates.setdefault(k, v)
    except Exception as exc:
        logger.debug("India/FBIL failed: %s", exc)

    # CCIL (best for call money)
    try:
        ccil = scrape_ccil()
        priority = {"call_money_high", "call_money_low", "cblo_bid", "cblo_ask"}
        for k, v in ccil.items():
            if k in priority or k not in rates:
                rates[k] = v
    except Exception as exc:
        logger.debug("India/CCIL failed: %s", exc)

    # NSE (fallback)
    try:
        nse = scrape_nse()
        for k, v in nse.items():
            rates.setdefault(k, v)
    except Exception as exc:
        logger.debug("India/NSE failed: %s", exc)

    return rates


def _scrape_us() -> dict:
    """Scrape US Fed / Treasury data."""
    from data.scrapers.us_fed import scrape_us_fed
    return scrape_us_fed()


def _scrape_europe() -> dict:
    """Scrape ECB / Eurozone data."""
    from data.scrapers.ecb import scrape_ecb
    return scrape_ecb()


def _scrape_china() -> dict:
    """Scrape PBoC / China data."""
    from data.scrapers.pboc import scrape_pboc
    return scrape_pboc()


def _scrape_yfinance() -> dict:
    """Scrape global market data via yfinance."""
    from data.scrapers.yfinance_global import scrape_yfinance
    return scrape_yfinance()


def _scrape_us_fiscal() -> dict:
    """Scrape US Treasury Fiscal Data (TGA, debt, auctions, avg rates)."""
    from data.scrapers.us_treasury_fiscal import scrape_us_treasury_fiscal
    return scrape_us_treasury_fiscal()


def _scrape_mega() -> dict:
    """Scrape deep data via mega libraries (BIS, akshare, World Bank, IMF)."""
    from data.scrapers.mega_scraper import scrape_mega
    result = scrape_mega()
    return result.get("rates", {})


def get_global_summary() -> dict:
    """Get a Bloomberg-style summary of global macro conditions."""
    data = scrape_global()
    rates = data.get("rates", {})

    summary = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "coverage": data.get("metadata", {}).get("regions", {}),
    }

    # India snapshot
    summary["india"] = {
        "repo": rates.get("repo"),
        "mibor_overnight": rates.get("mibor_overnight"),
        "mror_overnight": rates.get("mror_overnight"),
        "sorr_overnight": rates.get("sorr_overnight"),
        "gsec_10y": rates.get("gsec_10y"),
        "usdinr": rates.get("usdinr_spot"),
        "tbill_3m": rates.get("tbill_3m"),
        "tbill_12m": rates.get("tbill_12m"),
        "ois_1y": rates.get("ois_1y"),
        "ois_5y": rates.get("ois_5y"),
        "cd_3m": rates.get("cd_3m"),
        "swap_5y": rates.get("swap_5y"),
    }

    # US snapshot
    summary["us"] = {
        "fed_funds": rates.get("us_fed_funds"),
        "sofr": rates.get("us_sofr"),
        "tsy_2y": rates.get("us_tsy_2y"),
        "tsy_10y": rates.get("us_tsy_10y"),
        "tsy_30y": rates.get("us_tsy_30y"),
        "tsy_10y2y_spread": rates.get("us_tsy_10y2y_spread"),
        "vix": rates.get("us_vix"),
        "dxy": rates.get("us_dxy"),
    }

    # Europe snapshot
    summary["europe"] = {
        "ecb_deposit": rates.get("ecb_deposit"),
        "estr": rates.get("estr"),
        "euribor_3m": rates.get("euribor_3m"),
        "yield_10y": rates.get("eu_yield_10y"),
        "eurusd": rates.get("eurusd"),
    }

    # China snapshot
    summary["china"] = {
        "lpr_1y": rates.get("cn_lpr_1y"),
        "shibor_on": rates.get("cn_shibor_on"),
        "shibor_3m": rates.get("cn_shibor_3m"),
    }

    # Global markets (yfinance)
    summary["global_markets"] = {
        "gold": rates.get("yf_gold"),
        "crude_wti": rates.get("yf_crude_wti"),
        "sp500": rates.get("yf_sp500"),
        "nifty50": rates.get("yf_nifty50"),
        "usdinr": rates.get("yf_usdinr") or rates.get("usdinr_spot"),
        "usdcny": rates.get("yf_usdcny"),
    }

    # BIS central bank policy rates (mega scraper)
    bis_rates = {}
    for key, val in rates.items():
        if key.startswith("bis_") and key.endswith("_policy_rate"):
            country = key.replace("bis_", "").replace("_policy_rate", "")
            bis_rates[country] = val
    if bis_rates:
        summary["bis_policy_rates"] = bis_rates

    # World Bank macro indicators
    wb_data = {}
    for key, val in rates.items():
        if key.startswith("wb_"):
            wb_data[key] = val
    if wb_data:
        summary["world_bank"] = wb_data

    # akshare China bond curve
    ak_data = {}
    for key, val in rates.items():
        if key.startswith("ak_"):
            ak_data[key] = val
    if ak_data:
        summary["akshare_china"] = ak_data

    # US Fiscal (TGA, debt, auctions)
    summary["us_fiscal"] = {
        "tga_balance_mn": rates.get("tga_balance"),
        "tga_daily_change_mn": rates.get("tga_daily_change"),
        "total_debt_bn": rates.get("us_total_debt_bn"),
        "debt_headroom_mn": rates.get("us_debt_headroom_mn"),
        "avg_rate_bills": rates.get("us_avg_rate_bills"),
        "avg_rate_notes": rates.get("us_avg_rate_notes"),
    }

    # Cross-market indicators
    us_10y = rates.get("us_tsy_10y")
    in_10y = rates.get("gsec_10y")
    cn_10y = rates.get("ak_cn_gov_10y") or rates.get("cn_bond_10y")
    de_10y = rates.get("eu_yield_10y")

    spreads = {}
    if us_10y and in_10y:
        spreads["india_us_10y_spread"] = round(in_10y - us_10y, 4)
    if us_10y and de_10y:
        spreads["us_bund_10y_spread"] = round(us_10y - de_10y, 4)
    if us_10y and cn_10y:
        spreads["us_china_10y_spread"] = round(us_10y - cn_10y, 4)
    if in_10y and cn_10y:
        spreads["india_china_10y_spread"] = round(in_10y - cn_10y, 4)

    summary["cross_market_spreads"] = spreads

    return summary


# All available global rate fields
GLOBAL_RATE_FIELDS = {
    # India (RBI + CCIL + FBIL)
    "india": [
        # RBI policy
        "repo", "reverse_repo",
        # CCIL money market
        "cblo_bid", "cblo_ask", "call_money_high", "call_money_low", "gsec_10y",
        # FBIL MIBOR
        "mibor_overnight", "mibor_14d", "mibor_1m", "mibor_3m",
        # FBIL alternative overnight rates
        "mror_overnight", "sorr_overnight",
        # FBIL T-Bill curve (8 tenors)
        "tbill_7d", "tbill_14d", "tbill_1m", "tbill_2m", "tbill_3m",
        "tbill_6m", "tbill_9m", "tbill_12m",
        # FBIL FX reference rates
        "usdinr_spot", "gbpinr_spot", "eurinr_spot", "jpyinr_spot",
        # FBIL MIBOR-OIS curve (7 tenors)
        "ois_1m", "ois_3m", "ois_6m", "ois_1y", "ois_2y", "ois_3y", "ois_5y",
        # FBIL Certificate of Deposit
        "cd_1m", "cd_3m", "cd_6m", "cd_12m",
        # FBIL MM Swap rates
        "swap_2y", "swap_3y", "swap_5y",
        # FBIL Forward Premia
        "fwd_premia_1m", "fwd_premia_3m", "fwd_premia_6m", "fwd_premia_12m",
    ],
    # US
    "us": [
        "us_fed_funds", "us_fed_target_upper", "us_fed_target_lower", "us_sofr",
        "us_tsy_1m", "us_tsy_3m", "us_tsy_6m", "us_tsy_1y",
        "us_tsy_2y", "us_tsy_5y", "us_tsy_10y", "us_tsy_30y",
        "us_tsy_10y2y_spread", "us_vix", "us_dxy", "us_wti_crude", "us_hy_spread",
    ],
    # Europe
    "europe": [
        "ecb_main_refi", "ecb_deposit", "ecb_marginal", "estr",
        "euribor_1m", "euribor_3m", "euribor_6m", "euribor_12m",
        "eu_yield_2y", "eu_yield_5y", "eu_yield_10y", "eu_yield_30y", "eurusd",
    ],
    # China
    "china": [
        "cn_lpr_1y", "cn_lpr_5y",
        "cn_shibor_on", "cn_shibor_1w", "cn_shibor_2w", "cn_shibor_1m",
        "cn_shibor_3m", "cn_shibor_6m", "cn_shibor_9m", "cn_shibor_1y",
    ],
    # yfinance (global markets)
    "yfinance": [
        "yf_us_10y", "yf_us_5y", "yf_us_30y", "yf_us_2y", "yf_us_13w",
        "yf_dxy", "yf_usdinr", "yf_eurusd", "yf_usdcny", "yf_gbpusd", "yf_usdjpy",
        "yf_gold", "yf_crude_wti", "yf_crude_brent", "yf_natgas",
        "yf_sp500", "yf_nifty50", "yf_vix", "yf_shanghai", "yf_nikkei", "yf_dax", "yf_ftse",
    ],
    # US Treasury Fiscal Data
    "us_fiscal": [
        # TGA (Treasury General Account) — liquidity signal
        "tga_balance", "tga_daily_change", "tga_deposits_today", "tga_withdrawals_today",
        # National debt
        "us_total_debt_bn", "us_debt_public_bn", "us_debt_intragov_bn",
        # Debt ceiling
        "us_debt_ceiling_mn", "us_debt_subject_to_limit_mn", "us_debt_headroom_mn",
        # Average interest rates on Treasury securities
        "us_avg_rate_bills", "us_avg_rate_notes", "us_avg_rate_bonds",
        "us_avg_rate_tips", "us_avg_rate_frn", "us_avg_rate_total_mkt",
        # Recent auction bid-to-cover and rates (dynamic keys)
        "auction_bill_4week_btc", "auction_bill_4week_rate",
        "auction_bill_13week_btc", "auction_bill_13week_rate",
        "auction_bill_26week_btc", "auction_bill_26week_rate",
        "auction_note_2year_btc", "auction_note_7year_btc", "auction_note_7year_rate",
    ],
    # Mega libraries — BIS policy rates (30+ central banks)
    "bis": [
        "bis_india_policy_rate", "bis_us_policy_rate", "bis_china_policy_rate",
        "bis_eurozone_policy_rate", "bis_japan_policy_rate", "bis_uk_policy_rate",
        "bis_brazil_policy_rate", "bis_russia_policy_rate", "bis_korea_policy_rate",
        "bis_australia_policy_rate", "bis_canada_policy_rate", "bis_switzerland_policy_rate",
        "bis_mexico_policy_rate", "bis_south_africa_policy_rate", "bis_indonesia_policy_rate",
        "bis_turkey_policy_rate", "bis_thailand_policy_rate", "bis_philippines_policy_rate",
        "bis_malaysia_policy_rate", "bis_singapore_policy_rate", "bis_new_zealand_policy_rate",
        "bis_sweden_policy_rate", "bis_norway_policy_rate", "bis_denmark_policy_rate",
        "bis_poland_policy_rate", "bis_czech_policy_rate", "bis_hungary_policy_rate",
        "bis_israel_policy_rate", "bis_chile_policy_rate", "bis_colombia_policy_rate",
        "bis_peru_policy_rate", "bis_saudi_arabia_policy_rate", "bis_uae_policy_rate",
    ],
    # Mega libraries — akshare China bond yields
    "akshare": [
        "ak_cn_gov_3m", "ak_cn_gov_6m", "ak_cn_gov_1y", "ak_cn_gov_3y",
        "ak_cn_gov_5y", "ak_cn_gov_7y", "ak_cn_gov_10y", "ak_cn_gov_30y",
        "ak_cn_corp_aaa_1y", "ak_cn_corp_aaa_3y", "ak_cn_corp_aaa_5y",
        "ak_cn_lpr_1y", "ak_cn_lpr_5y",
    ],
    # Mega libraries — World Bank macro indicators
    "worldbank": [
        "wb_india_cpi_inflation", "wb_us_cpi_inflation", "wb_china_cpi_inflation",
        "wb_germany_cpi_inflation", "wb_japan_cpi_inflation", "wb_uk_cpi_inflation",
        "wb_brazil_cpi_inflation",
        "wb_india_lending_rate", "wb_us_lending_rate", "wb_china_lending_rate",
        "wb_india_deposit_rate", "wb_us_deposit_rate", "wb_china_deposit_rate",
        "wb_india_gdp_growth", "wb_us_gdp_growth", "wb_china_gdp_growth",
        "wb_germany_gdp_growth", "wb_japan_gdp_growth", "wb_uk_gdp_growth",
        "wb_brazil_gdp_growth",
        "wb_india_current_account_gdp", "wb_us_current_account_gdp",
        "wb_china_current_account_gdp",
    ],
    # Mega libraries — IMF commodity prices
    "imf": [
        "imf_oil_avg", "imf_gold", "imf_natgas", "imf_copper",
        "imf_aluminum", "imf_wheat", "imf_coffee",
    ],
}


def get_all_field_names() -> List[str]:
    """Get all possible field names across all regions."""
    fields = []
    for region_fields in GLOBAL_RATE_FIELDS.values():
        fields.extend(region_fields)
    return fields


# Convenience
scrape = scrape_global
