"""Investing.com data wrapper using investpy library (from GitHub).

Provides global market data as supplementary information.
Good for: Global bond yields, commodities, major FX pairs.

Install: pip install investpy
Note: investpy uses web scraping, so it may be less reliable
than direct APIs. Use as fallback/supplement only.
"""

import logging
from typing import Dict, Optional

from data import cache

logger = logging.getLogger("liquifi.investpy")


def scrape_investpy() -> Dict[str, float]:
    """Scrape global market data using investpy.
    
    Returns dict with:
    - Global bond yields (US, Germany, UK, Japan)
    - Major commodities (Gold, Oil)
    - Major FX rates
    
    This provides backup/alternative to yfinance for global data.
    """
    cached = cache.get("investpy")
    if cached:
        logger.debug("Using cached investpy data")
        return cached
    
    try:
        import investpy
    except ImportError:
        logger.warning("investpy not installed. Run: pip install investpy")
        return {}
    
    rates: Dict[str, float] = {}
    
    # Bond yields from major economies
    bonds_config = [
        ('United States', '10Y', 'inv_us_10y'),
        ('United States', '5Y', 'inv_us_5y'),
        ('United States', '2Y', 'inv_us_2y'),
        ('United States', '30Y', 'inv_us_30y'),
        ('Germany', '10Y', 'inv_de_10y'),
        ('United Kingdom', '10Y', 'inv_uk_10y'),
        ('Japan', '10Y', 'inv_jp_10y'),
    ]
    
    for country, maturity, key in bonds_config:
        try:
            bond_data = investpy.bonds.get_bond_historical_data(
                bond=f"{country} {maturity}",
                from_date='01/01/2026',
                to_date='31/12/2026',
                as_json=False,
                order='descending',
                interval='Daily'
            )
            if not bond_data.empty:
                latest_yield = float(bond_data['Close'].iloc[0])
                rates[key] = round(latest_yield, 4)
                logger.debug("investpy: %s = %.4f", key, latest_yield)
        except Exception as exc:
            logger.debug("investpy %s %s failed: %s", country, maturity, exc)
    
    # Commodities
    commodities_config = [
        ('Gold', 'inv_gold'),
        ('Crude Oil WTI', 'inv_crude_wti'),
        ('Brent Oil', 'inv_crude_brent'),
        ('Natural Gas', 'inv_natgas'),
        ('Silver', 'inv_silver'),
    ]
    
    for name, key in commodities_config:
        try:
            comm_data = investpy.commodities.get_commodity_historical_data(
                commodity=name,
                from_date='01/01/2026',
                to_date='31/12/2026',
                as_json=False,
                order='descending',
                interval='Daily'
            )
            if not comm_data.empty:
                price = float(comm_data['Close'].iloc[0])
                rates[key] = round(price, 2)
                logger.debug("investpy: %s = %.2f", key, price)
        except Exception as exc:
            logger.debug("investpy %s failed: %s", name, exc)
    
    # Major currency pairs
    fx_config = [
        ('USD/INR', 'inv_usdinr'),
        ('EUR/USD', 'inv_eurusd'),
        ('GBP/USD', 'inv_gbpusd'),
        ('USD/JPY', 'inv_usdjpy'),
    ]
    
    for pair, key in fx_config:
        try:
            fx_data = investpy.currency_crosses.get_currency_cross_historical_data(
                currency_cross=pair,
                from_date='01/01/2026',
                to_date='31/12/2026',
                as_json=False,
                order='descending',
                interval='Daily'
            )
            if not fx_data.empty:
                rate = float(fx_data['Close'].iloc[0])
                rates[key] = round(rate, 4)
                logger.debug("investpy: %s = %.4f", key, rate)
        except Exception as exc:
            logger.debug("investpy %s failed: %s", pair, exc)
    
    if rates:
        logger.info("investpy scraped %d fields", len(rates))
        cache.put("investpy", rates, ttl=600)  # 10 min cache
    else:
        logger.warning("investpy returned no data")
    
    return rates


def scrape_investpy_india() -> Dict[str, float]:
    """Scrape India-specific data from investpy.
    
    Alternative source for:
    - Indian government bonds
    - Nifty 50 data
    - India VIX
    """
    cached = cache.get("investpy_india")
    if cached:
        return cached
    
    try:
        import investpy
    except ImportError:
        logger.warning("investpy not installed")
        return {}
    
    rates: Dict[str, float] = {}
    
    try:
        # India 10Y bond yield
        india_bond = investpy.bonds.get_bond_historical_data(
            bond='India 10Y',
            from_date='01/01/2026',
            to_date='31/12/2026',
            as_json=False,
            order='descending',
            interval='Daily'
        )
        if not india_bond.empty:
            rates['inv_india_10y'] = round(float(india_bond['Close'].iloc[0]), 4)
    except Exception as exc:
        logger.debug("investpy India 10Y failed: %s", exc)
    
    try:
        # Nifty 50 via investpy
        nifty = investpy.indices.get_index_historical_data(
            index='Nifty 50',
            country='India',
            from_date='01/01/2026',
            to_date='31/12/2026',
            as_json=False,
            order='descending',
            interval='Daily'
        )
        if not nifty.empty:
            rates['inv_nifty50'] = round(float(nifty['Close'].iloc[0]), 2)
    except Exception as exc:
        logger.debug("investpy Nifty 50 failed: %s", exc)
    
    if rates:
        cache.put("investpy_india", rates, ttl=600)
    
    return rates


def get_investpy_summary() -> Dict[str, str]:
    """Get summary of available investpy data."""
    return {
        "global_bonds": "US, Germany, UK, Japan (2Y-30Y)",
        "commodities": "Gold, Oil (WTI/Brent), Natural Gas, Silver",
        "fx": "USD/INR, EUR/USD, GBP/USD, USD/JPY",
        "india": "10Y G-Sec, Nifty 50 (alternative source)",
        "reliability": "Medium (web scraping based)",
        "install": "pip install investpy",
    }


# Convenience alias
scrape = scrape_investpy
