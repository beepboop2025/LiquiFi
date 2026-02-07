"""
Enhanced CCIL scraper - now uses Playwright as primary method with multiple fallbacks.

This module provides the most robust CCIL data extraction available:
1. Playwright browser automation (primary)
2. RBI call money rates (fallback 1)
3. FBIL MIBOR proxy (fallback 2)
4. Derived estimates (last resort)
"""

import logging
from typing import Dict

# Import the robust scraper
from data.scrapers.ccil_playwright import (
    scrape_ccil_robust,
    CCILAlternativeSources,
    extract_rate_from_cells,
    _extract_rates_from_element,
    _scrape_static,
    _check_playwright,
    _scrape_with_playwright,
    CCIL_HOME_URL,
    CCIL_TREPS_URL,
)

logger = logging.getLogger("liquifi.ccil")


def scrape_ccil() -> Dict[str, float]:
    """
    Scrape CCIL rates with maximum robustness.
    
    This function will try multiple strategies in order:
    1. Playwright browser automation (JavaScript rendering)
    2. RBI call money rates
    3. FBIL MIBOR as proxy
    
    Returns:
        Dictionary with keys like:
        - mibor_overnight (weighted average)
        - call_money_high
        - call_money_low
        - cblo_bid
        - cblo_ask
    """
    # Use the robust scraper with all fallbacks enabled
    return scrape_ccil_robust(use_playwright=True, max_retries=3)


# Keep backward compatibility
__all__ = [
    "scrape_ccil",
    "scrape_ccil_robust",
    "CCILAlternativeSources",
    "extract_rate_from_cells",
    "_extract_rates_from_element",
    "_scrape_static",
    "_check_playwright",
    "_scrape_with_playwright",
    "CCIL_HOME_URL",
    "CCIL_TREPS_URL",
]
