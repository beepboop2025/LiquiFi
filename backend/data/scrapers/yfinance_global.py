"""yfinance-based global market data scraper — universal fallback.

Uses Yahoo Finance via yfinance library for:
- Government bond yields (US, Germany, Japan, UK, India, China)
- Major FX rates (DXY, USD/INR, EUR/USD, USD/CNY, GBP/USD, USD/JPY)
- Commodities (Gold, Crude Oil, Natural Gas)
- Equity indices (S&P500, Nifty50, VIX, Shanghai Composite)

This serves as a universal fallback and supplement to the primary
API-based scrapers (FRED, ECB SDW, ChinaMoney).
"""

import logging
from typing import Dict, Optional

from data import cache

logger = logging.getLogger("liquifi.yfinance_global")

# Yahoo Finance tickers for global data
TICKERS = {
    # Government bond yields (Yahoo Finance uses ^TNX format for US 10Y)
    "yf_us_10y": "^TNX",           # US 10Y Treasury Yield
    "yf_us_5y": "^FVX",            # US 5Y Treasury Yield
    "yf_us_30y": "^TYX",           # US 30Y Treasury Yield
    "yf_us_2y": "2YY=F",           # US 2Y Treasury Yield (futures)
    "yf_us_13w": "^IRX",           # US 13-Week T-Bill

    # Major FX rates
    "yf_dxy": "DX-Y.NYB",         # US Dollar Index
    "yf_usdinr": "INR=X",         # USD/INR
    "yf_eurusd": "EURUSD=X",      # EUR/USD
    "yf_usdcny": "CNY=X",         # USD/CNY
    "yf_gbpusd": "GBPUSD=X",      # GBP/USD
    "yf_usdjpy": "JPY=X",         # USD/JPY

    # Commodities
    "yf_gold": "GC=F",            # Gold Futures
    "yf_crude_wti": "CL=F",       # WTI Crude Oil Futures
    "yf_crude_brent": "BZ=F",     # Brent Crude Oil Futures
    "yf_natgas": "NG=F",          # Natural Gas Futures

    # Equity indices (risk sentiment)
    "yf_sp500": "^GSPC",          # S&P 500
    "yf_nifty50": "^NSEI",        # Nifty 50
    "yf_vix": "^VIX",             # VIX
    "yf_shanghai": "000001.SS",    # Shanghai Composite
    "yf_nikkei": "^N225",         # Nikkei 225
    "yf_dax": "^GDAXI",          # DAX
    "yf_ftse": "^FTSE",          # FTSE 100
}

# Validation bounds
YF_BOUNDS = {
    "yf_us_10y": (0.0, 10.0),
    "yf_us_5y": (0.0, 10.0),
    "yf_us_30y": (0.0, 10.0),
    "yf_us_2y": (0.0, 10.0),
    "yf_us_13w": (0.0, 10.0),
    "yf_dxy": (70.0, 160.0),
    "yf_usdinr": (60.0, 110.0),
    "yf_eurusd": (0.5, 2.0),
    "yf_usdcny": (5.0, 10.0),
    "yf_gbpusd": (0.5, 2.5),
    "yf_usdjpy": (80.0, 200.0),
    "yf_gold": (500.0, 5000.0),
    "yf_crude_wti": (10.0, 200.0),
    "yf_crude_brent": (10.0, 200.0),
    "yf_natgas": (0.5, 20.0),
    "yf_sp500": (1000.0, 10000.0),
    "yf_nifty50": (5000.0, 40000.0),
    "yf_vix": (5.0, 100.0),
    "yf_shanghai": (1000.0, 8000.0),
    "yf_nikkei": (10000.0, 60000.0),
    "yf_dax": (5000.0, 25000.0),
    "yf_ftse": (3000.0, 12000.0),
}


def scrape_yfinance() -> dict:
    """Scrape global market data using yfinance.

    Returns dict with yf_-prefixed keys.
    """
    cached = cache.get("yfinance")
    if cached:
        logger.debug("Using cached yfinance data")
        return cached

    try:
        import yfinance as yf
    except ImportError:
        logger.warning("yfinance not installed. Run: pip install yfinance")
        return {}

    rates: dict = {}

    try:
        # Batch download for efficiency — get all tickers at once
        ticker_list = list(TICKERS.values())
        tickers_str = " ".join(ticker_list)

        data = yf.download(tickers_str, period="5d", interval="1d", progress=False, threads=True)

        if data.empty:
            logger.warning("yfinance returned empty data")
            return {}

        # Get the last valid close price for each ticker
        close_data = data.get("Close", data)

        for rate_key, ticker in TICKERS.items():
            try:
                if ticker in close_data.columns:
                    series = close_data[ticker].dropna()
                    if not series.empty:
                        val = float(series.iloc[-1])
                        rates[rate_key] = round(val, 4)
                elif len(TICKERS) == 1:
                    # Single ticker download has different structure
                    series = close_data.dropna()
                    if not series.empty:
                        val = float(series.iloc[-1])
                        rates[rate_key] = round(val, 4)
            except (KeyError, IndexError, TypeError):
                continue

    except Exception as exc:
        logger.warning("yfinance batch download failed: %s", exc)
        # Fallback: individual downloads
        rates.update(_scrape_individual())

    # Validate
    validated = {}
    for key, val in rates.items():
        bounds = YF_BOUNDS.get(key)
        if bounds:
            lo, hi = bounds
            if lo <= val <= hi:
                validated[key] = val
            else:
                logger.debug("yfinance %s=%.4f outside bounds, skipping", key, val)
        else:
            validated[key] = val

    if validated:
        logger.info("yfinance scraped %d fields", len(validated))
        cache.put("yfinance", validated, ttl=600)  # 10 min cache
    else:
        logger.warning("No yfinance data scraped")

    return validated


def _scrape_individual() -> dict:
    """Fallback: download tickers one at a time."""
    try:
        import yfinance as yf
    except ImportError:
        return {}

    rates: dict = {}
    for rate_key, ticker in TICKERS.items():
        try:
            t = yf.Ticker(ticker)
            hist = t.history(period="5d")
            if not hist.empty:
                val = float(hist["Close"].iloc[-1])
                rates[rate_key] = round(val, 4)
        except Exception:
            continue

    return rates


def get_yfinance_summary() -> dict:
    """Get a summary of available yfinance data categories."""
    return {
        "bonds": ["yf_us_10y", "yf_us_5y", "yf_us_30y", "yf_us_2y", "yf_us_13w"],
        "fx": ["yf_dxy", "yf_usdinr", "yf_eurusd", "yf_usdcny", "yf_gbpusd", "yf_usdjpy"],
        "commodities": ["yf_gold", "yf_crude_wti", "yf_crude_brent", "yf_natgas"],
        "indices": ["yf_sp500", "yf_nifty50", "yf_vix", "yf_shanghai", "yf_nikkei", "yf_dax", "yf_ftse"],
        "total_tickers": len(TICKERS),
    }


# Convenience
scrape = scrape_yfinance
