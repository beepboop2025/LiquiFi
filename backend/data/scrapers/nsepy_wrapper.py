"""NSE India data wrapper using nsepy library (from GitHub).

This provides an alternative/supplement to the custom NSE scraper
which is currently having 403 errors.

Install: pip install nsepy
"""

import logging
from typing import Dict, Optional
from datetime import date, timedelta

from data import cache

logger = logging.getLogger("liquifi.nsepy_wrapper")


def scrape_nsepy() -> Dict[str, float]:
    """Scrape NSE data using nsepy library.
    
    Returns dict with equity index data for treasury context:
    - Nifty 50 levels (market sentiment)
    - India VIX (volatility/risk)
    - Bank Nifty (banking sector health)
    - 10-year G-Sec yields (if available)
    
    This supplements RBI/CCIL data with equity market context
    that treasury managers care about.
    """
    cached = cache.get("nsepy")
    if cached:
        logger.debug("Using cached nsepy data")
        return cached
    
    try:
        from nsepy import get_history
    except ImportError:
        logger.warning("nsepy not installed. Run: pip install nsepy")
        return {}
    
    rates: Dict[str, float] = {}
    today = date.today()
    start_date = today - timedelta(days=5)  # Last 5 days
    
    try:
        # Nifty 50 - market sentiment indicator
        nifty = get_history(
            symbol='NIFTY',
            start=start_date,
            end=today,
            index=True
        )
        if not nifty.empty:
            latest_close = float(nifty['Close'].iloc[-1])
            rates['nse_nifty50'] = round(latest_close, 2)
            
            # Calculate daily change %
            if len(nifty) > 1:
                prev_close = float(nifty['Close'].iloc[-2])
                change_pct = ((latest_close - prev_close) / prev_close) * 100
                rates['nse_nifty_change_pct'] = round(change_pct, 2)
            
            # 52-week high context
            if 'High' in nifty.columns:
                high_52w = float(nifty['High'].max())
                rates['nse_nifty_52w_high'] = round(high_52w, 2)
        
        logger.info("nsepy: fetched Nifty 50 data")
        
    except Exception as exc:
        logger.warning("nsepy Nifty fetch failed: %s", exc)
    
    try:
        # Bank Nifty - banking sector health (affects rates)
        bank_nifty = get_history(
            symbol='BANKNIFTY',
            start=start_date,
            end=today,
            index=True
        )
        if not bank_nifty.empty:
            rates['nse_banknifty'] = round(float(bank_nifty['Close'].iloc[-1]), 2)
        
        logger.info("nsepy: fetched Bank Nifty data")
        
    except Exception as exc:
        logger.warning("nsepy Bank Nifty fetch failed: %s", exc)
    
    try:
        # India VIX - fear/volatility index (risk sentiment)
        # VIX data might not be available in all nsepy versions
        vix = get_history(
            symbol='INDIAVIX',
            start=start_date,
            end=today,
            index=True
        )
        if not vix.empty:
            rates['nse_india_vix'] = round(float(vix['Close'].iloc[-1]), 2)
            logger.info("nsepy: fetched India VIX data")
        
    except Exception as exc:
        logger.debug("nsepy VIX fetch failed (may not be available): %s", exc)
    
    try:
        # Nifty 10-year G-Sec index (if available)
        # This provides alternative G-Sec yield data
        gsec_index = get_history(
            symbol='NIFTY10Y',
            start=start_date,
            end=today,
            index=True
        )
        if not gsec_index.empty:
            rates['nse_gsec_index'] = round(float(gsec_index['Close'].iloc[-1]), 2)
            logger.info("nsepy: fetched G-Sec index data")
        
    except Exception as exc:
        logger.debug("nsepy G-Sec index fetch failed: %s", exc)
    
    if rates:
        logger.info("nsepy scraped %d fields", len(rates))
        cache.put("nsepy", rates, ttl=600)  # 10 min cache
    else:
        logger.warning("nsepy returned no data")
    
    return rates


def scrape_nsepy_equity(ticker: str) -> Optional[float]:
    """Get specific stock price (for corporate treasury use).
    
    Useful for:
    - Tracking client's stock price (if corporate treasury)
    - Sectoral analysis (banks, NBFCs)
    
    Args:
        ticker: NSE ticker symbol (e.g., 'RELIANCE', 'HDFCBANK')
    
    Returns:
        Latest closing price or None
    """
    try:
        from nsepy import get_history
    except ImportError:
        logger.warning("nsepy not installed")
        return None
    
    try:
        today = date.today()
        start = today - timedelta(days=5)
        
        hist = get_history(
            symbol=ticker,
            start=start,
            end=today
        )
        
        if not hist.empty:
            return round(float(hist['Close'].iloc[-1]), 2)
        
    except Exception as exc:
        logger.warning("nsepy %s fetch failed: %s", ticker, exc)
    
    return None


def get_nsepy_summary() -> Dict[str, str]:
    """Get summary of available nsepy data."""
    return {
        "indices": "Nifty 50, Bank Nifty, India VIX, G-Sec Index",
        "use_case": "Equity market context for treasury risk assessment",
        "frequency": "Real-time (delayed 15 min)",
        "install": "pip install nsepy",
    }


# Convenience alias
scrape = scrape_nsepy
