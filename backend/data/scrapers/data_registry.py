"""Unified Data Registry — structured catalog of all 200+ available data points.

This module is the single source of truth for what data LiquiFi can collect.
AI agents (Claude, Kimi, Codex) use this to understand what's available,
what categories exist, and how to request specific data.

Usage:
    from data.scrapers.data_registry import get_registry, get_field_info

    # Full registry
    registry = get_registry()

    # Info about a specific field
    info = get_field_info("us_tsy_10y")
    # {'source': 'us_fed', 'category': 'government_bonds', 'frequency': 'daily', ...}
"""

from typing import Dict, List, Optional


# Master registry: every field LiquiFi can scrape
# Format: field_name -> {source, category, subcategory, frequency, description, unit}
FIELD_REGISTRY: Dict[str, dict] = {}


def _reg(field: str, source: str, category: str, subcategory: str,
         frequency: str, description: str, unit: str = "percent"):
    """Register a data field."""
    FIELD_REGISTRY[field] = {
        "source": source,
        "category": category,
        "subcategory": subcategory,
        "frequency": frequency,
        "description": description,
        "unit": unit,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# INDIA — RBI, CCIL, FBIL, NSE (12+ real-time fields)
# ═══════════════════════════════════════════════════════════════════════════════

_reg("repo", "rbi", "policy_rates", "india", "30s", "RBI Repo Rate")
_reg("reverse_repo", "rbi", "policy_rates", "india", "30s", "RBI Reverse Repo Rate")
_reg("mibor_overnight", "fbil", "interbank_rates", "india", "30s", "MIBOR Overnight Rate")
_reg("mibor_14d", "fbil", "interbank_rates", "india", "daily", "MIBOR 14-Day Rate")
_reg("mibor_1m", "fbil", "interbank_rates", "india", "daily", "MIBOR 1-Month Rate")
_reg("mibor_3m", "fbil", "interbank_rates", "india", "daily", "MIBOR 3-Month Rate")
_reg("call_money_high", "ccil", "interbank_rates", "india", "30s", "Call Money High Rate")
_reg("call_money_low", "ccil", "interbank_rates", "india", "30s", "Call Money Low Rate")
_reg("cblo_bid", "ccil", "interbank_rates", "india", "30s", "CBLO/TREPS Bid Rate")
_reg("cblo_ask", "ccil", "interbank_rates", "india", "30s", "CBLO/TREPS Ask Rate")
_reg("tbill_91d", "rbi", "government_bonds", "india", "daily", "91-Day T-Bill Rate")
_reg("tbill_182d", "rbi", "government_bonds", "india", "daily", "182-Day T-Bill Rate")
_reg("tbill_364d", "rbi", "government_bonds", "india", "daily", "364-Day T-Bill Rate")
_reg("gsec_10y", "rbi", "government_bonds", "india", "daily", "10Y G-Sec Yield")
_reg("usdinr_spot", "rbi", "fx_rates", "india", "30s", "USD/INR Spot Rate", "price")
_reg("ois_1y", "fbil", "derivatives", "india", "daily", "OIS 1-Year Rate")
_reg("ois_3y", "fbil", "derivatives", "india", "daily", "OIS 3-Year Rate")
_reg("ois_5y", "fbil", "derivatives", "india", "daily", "OIS 5-Year Rate")

# ═══════════════════════════════════════════════════════════════════════════════
# US — FRED public CSV (17 fields, NO API key needed)
# ═══════════════════════════════════════════════════════════════════════════════

_reg("us_fed_funds", "us_fed", "policy_rates", "us", "daily", "Fed Funds Effective Rate")
_reg("us_fed_target_upper", "us_fed", "policy_rates", "us", "daily", "Fed Funds Target Upper Bound")
_reg("us_fed_target_lower", "us_fed", "policy_rates", "us", "daily", "Fed Funds Target Lower Bound")
_reg("us_sofr", "us_fed", "interbank_rates", "us", "daily", "Secured Overnight Financing Rate (SOFR)")
_reg("us_tsy_1m", "us_fed", "government_bonds", "us", "daily", "1-Month Treasury Yield")
_reg("us_tsy_3m", "us_fed", "government_bonds", "us", "daily", "3-Month Treasury Yield")
_reg("us_tsy_6m", "us_fed", "government_bonds", "us", "daily", "6-Month Treasury Yield")
_reg("us_tsy_1y", "us_fed", "government_bonds", "us", "daily", "1-Year Treasury Yield")
_reg("us_tsy_2y", "us_fed", "government_bonds", "us", "daily", "2-Year Treasury Yield")
_reg("us_tsy_5y", "us_fed", "government_bonds", "us", "daily", "5-Year Treasury Yield")
_reg("us_tsy_10y", "us_fed", "government_bonds", "us", "daily", "10-Year Treasury Yield (global benchmark)")
_reg("us_tsy_30y", "us_fed", "government_bonds", "us", "daily", "30-Year Treasury Yield")
_reg("us_tsy_10y2y_spread", "us_fed", "spreads", "us", "daily", "10Y-2Y Treasury Spread (recession indicator)", "bps")
_reg("us_vix", "us_fed", "volatility", "us", "daily", "VIX Volatility Index", "index")
_reg("us_dxy", "us_fed", "fx_rates", "us", "daily", "Trade Weighted Dollar Index", "index")
_reg("us_wti_crude", "us_fed", "commodities", "us", "daily", "WTI Crude Oil Price", "usd")
_reg("us_hy_spread", "us_fed", "credit_spreads", "us", "daily", "ICE BofA HY OAS Spread", "bps")

# ═══════════════════════════════════════════════════════════════════════════════
# EUROPE — ECB SDW API (13 fields)
# ═══════════════════════════════════════════════════════════════════════════════

_reg("ecb_main_refi", "ecb", "policy_rates", "europe", "daily", "ECB Main Refinancing Rate")
_reg("ecb_deposit", "ecb", "policy_rates", "europe", "daily", "ECB Deposit Facility Rate")
_reg("ecb_marginal", "ecb", "policy_rates", "europe", "daily", "ECB Marginal Lending Facility")
_reg("estr", "ecb", "interbank_rates", "europe", "daily", "Euro Short-Term Rate (ESTR)")
_reg("euribor_1m", "ecb", "interbank_rates", "europe", "monthly", "Euribor 1-Month")
_reg("euribor_3m", "ecb", "interbank_rates", "europe", "monthly", "Euribor 3-Month")
_reg("euribor_6m", "ecb", "interbank_rates", "europe", "monthly", "Euribor 6-Month")
_reg("euribor_12m", "ecb", "interbank_rates", "europe", "monthly", "Euribor 12-Month")
_reg("eu_yield_2y", "ecb", "government_bonds", "europe", "daily", "Eurozone AAA 2Y Yield")
_reg("eu_yield_5y", "ecb", "government_bonds", "europe", "daily", "Eurozone AAA 5Y Yield")
_reg("eu_yield_10y", "ecb", "government_bonds", "europe", "daily", "Eurozone AAA 10Y Yield")
_reg("eu_yield_30y", "ecb", "government_bonds", "europe", "daily", "Eurozone AAA 30Y Yield")
_reg("eurusd", "ecb", "fx_rates", "europe", "daily", "EUR/USD Exchange Rate", "price")

# ═══════════════════════════════════════════════════════════════════════════════
# CHINA — ChinaMoney CFETS (12 fields)
# ═══════════════════════════════════════════════════════════════════════════════

_reg("cn_lpr_1y", "pboc", "policy_rates", "china", "monthly", "Loan Prime Rate 1-Year")
_reg("cn_lpr_5y", "pboc", "policy_rates", "china", "monthly", "Loan Prime Rate 5-Year")
_reg("cn_shibor_on", "pboc", "interbank_rates", "china", "daily", "SHIBOR Overnight")
_reg("cn_shibor_1w", "pboc", "interbank_rates", "china", "daily", "SHIBOR 1-Week")
_reg("cn_shibor_2w", "pboc", "interbank_rates", "china", "daily", "SHIBOR 2-Week")
_reg("cn_shibor_1m", "pboc", "interbank_rates", "china", "daily", "SHIBOR 1-Month")
_reg("cn_shibor_3m", "pboc", "interbank_rates", "china", "daily", "SHIBOR 3-Month")
_reg("cn_shibor_6m", "pboc", "interbank_rates", "china", "daily", "SHIBOR 6-Month")
_reg("cn_shibor_9m", "pboc", "interbank_rates", "china", "daily", "SHIBOR 9-Month")
_reg("cn_shibor_1y", "pboc", "interbank_rates", "china", "daily", "SHIBOR 1-Year")

# ═══════════════════════════════════════════════════════════════════════════════
# YFINANCE — Real-time market data (21 fields)
# ═══════════════════════════════════════════════════════════════════════════════

_reg("yf_us_10y", "yfinance", "government_bonds", "us", "15min", "US 10Y Treasury (Yahoo Finance)", "percent")
_reg("yf_us_5y", "yfinance", "government_bonds", "us", "15min", "US 5Y Treasury (Yahoo Finance)")
_reg("yf_us_30y", "yfinance", "government_bonds", "us", "15min", "US 30Y Treasury (Yahoo Finance)")
_reg("yf_us_2y", "yfinance", "government_bonds", "us", "15min", "US 2Y Treasury (Yahoo Finance)")
_reg("yf_us_13w", "yfinance", "government_bonds", "us", "15min", "US 13W T-Bill (Yahoo Finance)")
_reg("yf_dxy", "yfinance", "fx_rates", "global", "15min", "US Dollar Index (DXY)", "index")
_reg("yf_usdinr", "yfinance", "fx_rates", "global", "15min", "USD/INR (Yahoo Finance)", "price")
_reg("yf_eurusd", "yfinance", "fx_rates", "global", "15min", "EUR/USD (Yahoo Finance)", "price")
_reg("yf_usdcny", "yfinance", "fx_rates", "global", "15min", "USD/CNY (Yahoo Finance)", "price")
_reg("yf_gbpusd", "yfinance", "fx_rates", "global", "15min", "GBP/USD (Yahoo Finance)", "price")
_reg("yf_usdjpy", "yfinance", "fx_rates", "global", "15min", "USD/JPY (Yahoo Finance)", "price")
_reg("yf_gold", "yfinance", "commodities", "global", "15min", "Gold Futures", "usd")
_reg("yf_crude_wti", "yfinance", "commodities", "global", "15min", "WTI Crude Oil Futures", "usd")
_reg("yf_crude_brent", "yfinance", "commodities", "global", "15min", "Brent Crude Oil Futures", "usd")
_reg("yf_natgas", "yfinance", "commodities", "global", "15min", "Natural Gas Futures", "usd")
_reg("yf_sp500", "yfinance", "equity_indices", "global", "15min", "S&P 500 Index", "index")
_reg("yf_nifty50", "yfinance", "equity_indices", "global", "15min", "Nifty 50 Index", "index")
_reg("yf_vix", "yfinance", "volatility", "global", "15min", "VIX (Yahoo Finance)", "index")
_reg("yf_shanghai", "yfinance", "equity_indices", "global", "15min", "Shanghai Composite", "index")
_reg("yf_nikkei", "yfinance", "equity_indices", "global", "15min", "Nikkei 225", "index")
_reg("yf_dax", "yfinance", "equity_indices", "global", "15min", "DAX Index", "index")
_reg("yf_ftse", "yfinance", "equity_indices", "global", "15min", "FTSE 100 Index", "index")

# ═══════════════════════════════════════════════════════════════════════════════
# BIS — Central bank policy rates for 33 economies (via sdmx1)
# ═══════════════════════════════════════════════════════════════════════════════

_bis_countries = [
    ("india", "India"), ("us", "United States"), ("china", "China"),
    ("eurozone", "Eurozone"), ("japan", "Japan"), ("uk", "United Kingdom"),
    ("brazil", "Brazil"), ("russia", "Russia"), ("korea", "South Korea"),
    ("australia", "Australia"), ("canada", "Canada"), ("switzerland", "Switzerland"),
    ("mexico", "Mexico"), ("south_africa", "South Africa"), ("indonesia", "Indonesia"),
    ("turkey", "Turkey"), ("thailand", "Thailand"), ("philippines", "Philippines"),
    ("malaysia", "Malaysia"), ("singapore", "Singapore"), ("new_zealand", "New Zealand"),
    ("sweden", "Sweden"), ("norway", "Norway"), ("denmark", "Denmark"),
    ("poland", "Poland"), ("czech", "Czech Republic"), ("hungary", "Hungary"),
    ("israel", "Israel"), ("chile", "Chile"), ("colombia", "Colombia"),
    ("peru", "Peru"), ("saudi_arabia", "Saudi Arabia"), ("uae", "UAE"),
]
for code, name in _bis_countries:
    _reg(f"bis_{code}_policy_rate", "bis", "policy_rates", code, "daily",
         f"{name} Central Bank Policy Rate (BIS)")

# ═══════════════════════════════════════════════════════════════════════════════
# AKSHARE — China government bond yields + corporate bonds
# ═══════════════════════════════════════════════════════════════════════════════

_reg("ak_cn_gov_3m", "akshare", "government_bonds", "china", "daily", "China Gov Bond 3M Yield")
_reg("ak_cn_gov_6m", "akshare", "government_bonds", "china", "daily", "China Gov Bond 6M Yield")
_reg("ak_cn_gov_1y", "akshare", "government_bonds", "china", "daily", "China Gov Bond 1Y Yield")
_reg("ak_cn_gov_3y", "akshare", "government_bonds", "china", "daily", "China Gov Bond 3Y Yield")
_reg("ak_cn_gov_5y", "akshare", "government_bonds", "china", "daily", "China Gov Bond 5Y Yield")
_reg("ak_cn_gov_7y", "akshare", "government_bonds", "china", "daily", "China Gov Bond 7Y Yield")
_reg("ak_cn_gov_10y", "akshare", "government_bonds", "china", "daily", "China Gov Bond 10Y Yield")
_reg("ak_cn_gov_30y", "akshare", "government_bonds", "china", "daily", "China Gov Bond 30Y Yield")
_reg("ak_cn_corp_aaa_1y", "akshare", "corporate_bonds", "china", "daily", "China AAA Corp Bond 1Y Yield")
_reg("ak_cn_corp_aaa_3y", "akshare", "corporate_bonds", "china", "daily", "China AAA Corp Bond 3Y Yield")
_reg("ak_cn_corp_aaa_5y", "akshare", "corporate_bonds", "china", "daily", "China AAA Corp Bond 5Y Yield")
_reg("ak_cn_lpr_1y", "akshare", "policy_rates", "china", "monthly", "China LPR 1Y (akshare confirmation)")
_reg("ak_cn_lpr_5y", "akshare", "policy_rates", "china", "monthly", "China LPR 5Y (akshare confirmation)")

# ═══════════════════════════════════════════════════════════════════════════════
# WORLD BANK — Macro indicators for 7 major economies
# ═══════════════════════════════════════════════════════════════════════════════

_wb_countries = ["india", "us", "china", "germany", "japan", "uk", "brazil"]
_wb_indicators = [
    ("cpi_inflation", "CPI Inflation (annual %)"),
    ("lending_rate", "Lending Interest Rate"),
    ("deposit_rate", "Deposit Interest Rate"),
    ("gdp_growth", "GDP Growth (annual %)"),
    ("current_account_gdp", "Current Account (% of GDP)"),
]
for country in _wb_countries:
    for ind_key, ind_desc in _wb_indicators:
        _reg(f"wb_{country}_{ind_key}", "worldbank", "macro_indicators", country,
             "annual", f"{country.title()} {ind_desc}")

# ═══════════════════════════════════════════════════════════════════════════════
# IMF — Commodity prices
# ═══════════════════════════════════════════════════════════════════════════════

_reg("imf_oil_avg", "imf", "commodities", "global", "monthly", "IMF Average Oil Price", "usd")
_reg("imf_gold", "imf", "commodities", "global", "monthly", "IMF Gold Price", "usd")
_reg("imf_natgas", "imf", "commodities", "global", "monthly", "IMF Natural Gas Price", "usd")
_reg("imf_copper", "imf", "commodities", "global", "monthly", "IMF Copper Price", "usd")
_reg("imf_aluminum", "imf", "commodities", "global", "monthly", "IMF Aluminum Price", "usd")
_reg("imf_wheat", "imf", "commodities", "global", "monthly", "IMF Wheat Price", "usd")
_reg("imf_coffee", "imf", "commodities", "global", "monthly", "IMF Coffee Price", "usd")


# ═══════════════════════════════════════════════════════════════════════════════
# Public API
# ═══════════════════════════════════════════════════════════════════════════════

def get_registry() -> dict:
    """Get the full data registry with summary statistics."""
    # Categorize
    by_source: Dict[str, list] = {}
    by_category: Dict[str, list] = {}
    by_region: Dict[str, list] = {}

    for field, info in FIELD_REGISTRY.items():
        by_source.setdefault(info["source"], []).append(field)
        by_category.setdefault(info["category"], []).append(field)
        by_region.setdefault(info["subcategory"], []).append(field)

    return {
        "total_fields": len(FIELD_REGISTRY),
        "by_source": {k: {"count": len(v), "fields": v} for k, v in sorted(by_source.items())},
        "by_category": {k: {"count": len(v), "fields": v} for k, v in sorted(by_category.items())},
        "by_region": {k: {"count": len(v), "fields": v} for k, v in sorted(by_region.items())},
        "sources": list(sorted(by_source.keys())),
        "categories": list(sorted(by_category.keys())),
    }


def get_field_info(field_name: str) -> Optional[dict]:
    """Get metadata for a specific field."""
    return FIELD_REGISTRY.get(field_name)


def get_fields_by_source(source: str) -> List[str]:
    """Get all field names from a specific source."""
    return [f for f, info in FIELD_REGISTRY.items() if info["source"] == source]


def get_fields_by_category(category: str) -> List[str]:
    """Get all field names in a specific category."""
    return [f for f, info in FIELD_REGISTRY.items() if info["category"] == category]


def get_fields_by_region(region: str) -> List[str]:
    """Get all field names for a specific region/subcategory."""
    return [f for f, info in FIELD_REGISTRY.items() if info["subcategory"] == region]


def check_availability(rates: dict) -> dict:
    """Check which registered fields are currently available in a rates dict."""
    available = []
    missing = []
    for field in FIELD_REGISTRY:
        if field in rates:
            available.append(field)
        else:
            missing.append(field)

    return {
        "total_registered": len(FIELD_REGISTRY),
        "available": len(available),
        "missing": len(missing),
        "coverage_pct": round(len(available) / len(FIELD_REGISTRY) * 100, 1),
        "available_fields": available,
        "missing_fields": missing,
    }
