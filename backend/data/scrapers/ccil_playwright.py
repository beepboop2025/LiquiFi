"""
Production-grade CCIL scraper using Playwright.

Extracts Call Money and TREPS rates from CCIL home page.
"""

import logging
import re
import time
from typing import Optional, Dict, Any
from datetime import datetime

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger("liquifi.ccil_playwright")

# CCIL URLs
CCIL_HOME = "https://www.ccilindia.com/web/ccil/home"
CCIL_TREPS = "https://www.ccilindia.com/web/ccil/treps1"
CCIL_CALL_MONEY = "https://www.ccilindia.com/tenor-wise-term-money"

# URL aliases for backward compatibility with tests
CCIL_HOME_URL = CCIL_HOME
CCIL_TREPS_URL = CCIL_TREPS


def _check_playwright(force_check: bool = False) -> bool:
    """Check if Playwright is available."""
    try:
        import playwright
        return True
    except ImportError:
        return False


def _extract_rates_from_element(element) -> Dict[str, float]:
    """
    Extract rates from a BeautifulSoup element.
    
    Args:
        element: BeautifulSoup element containing rate text
        
    Returns:
        Dictionary of extracted rates
    """
    rates = {}
    text = element.get_text()
    
    # Extract high rate
    high_match = re.search(r'High[:\s]+(\d+\.?\d*)', text, re.IGNORECASE)
    if high_match:
        rates["call_money_high"] = float(high_match.group(1))
    
    # Extract low rate
    low_match = re.search(r'Low[:\s]+(\d+\.?\d*)', text, re.IGNORECASE)
    if low_match:
        rates["call_money_low"] = float(low_match.group(1))
    
    # Extract weighted average / MIBOR
    war_patterns = [
        r'Weighted Average(?:\s+Rate)?[:\s]+(\d+\.?\d*)',
        r'WAR[:\s]+(\d+\.?\d*)',
        r'MIBOR[:\s]+(\d+\.?\d*)',
    ]
    for pattern in war_patterns:
        war_match = re.search(pattern, text, re.IGNORECASE)
        if war_match:
            rates["mibor_overnight"] = float(war_match.group(1))
            break
    
    # Extract TREPS/CBLO rate
    treps_match = re.search(r'TREPS(?:\s+Rate)?[:\s]+(\d+\.?\d*)', text, re.IGNORECASE)
    if treps_match:
        treps_war = float(treps_match.group(1))
        rates["cblo_bid"] = treps_war
        rates["cblo_ask"] = round(treps_war + 0.07, 4)
    
    return rates


def _scrape_static() -> Dict[str, float]:
    """
    Scrape CCIL using static HTTP requests (fallback method).
    
    Returns:
        Dictionary of scraped rates
    """
    rates = {}
    
    try:
        with httpx.Client(timeout=15) as client:
            resp = client.get(CCIL_HOME, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            })
            soup = BeautifulSoup(resp.text, "lxml")
            
            # Look for rate data in tables
            for table in soup.find_all("table"):
                for row in table.find_all("tr"):
                    cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
                    row_rates = _extract_rates_from_element(row)
                    rates.update(row_rates)
    except Exception as exc:
        logger.warning(f"Static scraping failed: {exc}")
    
    return rates


def _scrape_with_playwright() -> Dict[str, float]:
    """
    Scrape CCIL using Playwright browser automation.
    
    Returns:
        Dictionary of scraped rates
    """
    if not _check_playwright():
        return {}
    
    scraper = CCILPlaywrightScraper(headless=True)
    return scraper.scrape_with_playwright()


class CCILPlaywrightScraper:
    """Robust CCIL scraper using Playwright browser automation."""
    
    def __init__(self, headless: bool = True, timeout: int = 30):
        self.headless = headless
        self.timeout = timeout
        
    def _ensure_playwright(self) -> bool:
        """Check if Playwright is available."""
        try:
            import playwright
            return True
        except ImportError:
            logger.error("Playwright not installed. Run: pip install playwright && playwright install chromium")
            return False
            
    def scrape_with_playwright(self) -> Dict[str, float]:
        """
        Scrape CCIL using Playwright browser.
        
        Extracts from the home page Money Market table:
        - CALL Money rates (High, Low, WAR)
        - TREPS rates (WAR)
        """
        if not self._ensure_playwright():
            return {}
            
        from playwright.sync_api import sync_playwright
        
        rates = {}
        
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=self.headless)
                context = browser.new_context(
                    user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    viewport={"width": 1920, "height": 1080},
                )
                
                page = context.new_page()
                
                # Navigate to home page
                logger.info("Navigating to CCIL home page...")
                page.goto(CCIL_HOME, wait_until="networkidle", timeout=self.timeout * 1000)
                page.wait_for_timeout(5000)  # Wait for JS to render
                
                # Extract from page
                rates = self._extract_from_page(page)
                
                browser.close()
                
        except Exception as exc:
            logger.error(f"Playwright scraping failed: {exc}")
            
        return rates
        
    def _extract_from_page(self, page) -> Dict[str, float]:
        """Extract rate data from CCIL home page."""
        rates = {}
        
        # Get page content
        content = page.content()
        soup = BeautifulSoup(content, "lxml")
        
        # Find the Money Market table
        # Look for tables with specific headers
        for table in soup.find_all("table"):
            rows = table.find_all("tr")
            if not rows:
                continue
                
            # Check header
            header = [th.get_text(strip=True) for th in rows[0].find_all(["th", "td"])]
            header_text = " ".join(header).lower()
            
            # Look for Money Market table with WAR column
            if "war" in header_text and "market" in header_text:
                logger.info("Found Money Market table")
                
                # Process each row
                for row in rows[1:]:  # Skip header
                    cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
                    if len(cells) < 8:
                        continue
                        
                    market_type = cells[0].strip().upper()
                    
                    try:
                        if market_type == "CALL":
                            # CALL row: [Market, Open, High, Low, LTR, Volume, WAR, Prev_WAR, Prev_Vol]
                            rates["call_money_high"] = float(cells[2].replace(',', ''))
                            rates["call_money_low"] = float(cells[3].replace(',', ''))
                            rates["mibor_overnight"] = float(cells[6].replace(',', ''))
                            logger.info(f"CALL Money - High: {rates['call_money_high']}, Low: {rates['call_money_low']}, WAR: {rates['mibor_overnight']}")
                            
                        elif market_type in ["TREP", "TREPS"]:
                            # TREPS row
                            treps_war = float(cells[6].replace(',', ''))
                            rates["cblo_bid"] = treps_war
                            rates["cblo_ask"] = round(treps_war + 0.07, 4)
                            logger.info(f"TREPS - WAR: {treps_war}")
                            
                    except (ValueError, IndexError) as exc:
                        logger.debug(f"Error parsing row {cells}: {exc}")
                        continue
                        
        return rates


class CCILAlternativeSources:
    """Alternative sources for CCIL-like data when direct scraping fails."""
    
    @staticmethod
    def get_rbi_call_money() -> Dict[str, float]:
        """Get call money rates from RBI as fallback."""
        rates = {}
        
        try:
            # RBI publishes call money rates
            url = "https://www.rbi.org.in/scripts/BS_ViewMMOperations.aspx"
            
            with httpx.Client(timeout=15) as client:
                resp = client.get(url, headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                })
                soup = BeautifulSoup(resp.text, "lxml")
                
                # Look for call money rates in tables
                for table in soup.find_all("table"):
                    for row in table.find_all("tr"):
                        cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
                        text = " ".join(cells).lower()
                        
                        if "call" in text and "money" in text:
                            for cell in cells:
                                cell_clean = cell.replace(",", "").replace("%", "").strip()
                                try:
                                    val = float(cell_clean)
                                    if 3.0 < val < 15.0:
                                        if "high" in text and "call_money_high" not in rates:
                                            rates["call_money_high"] = round(val, 4)
                                        elif "low" in text and "call_money_low" not in rates:
                                            rates["call_money_low"] = round(val, 4)
                                except ValueError:
                                    continue
                                    
        except Exception as exc:
            logger.warning(f"RBI call money fallback failed: {exc}")
            
        return rates
    
    @staticmethod
    def get_fbil_call_money() -> Dict[str, float]:
        """Get call money proxy from FBIL MIBOR."""
        rates = {}
        
        try:
            from data.scrapers.fbil import scrape_fbil
            fbil_data = scrape_fbil()
            
            # Use overnight MIBOR as call money proxy
            if "mibor_overnight" in fbil_data:
                mibor = fbil_data["mibor_overnight"]
                rates["mibor_overnight"] = mibor
                # Estimate high/low based on typical spreads
                rates["call_money_high"] = round(mibor + 0.15, 4)
                rates["call_money_low"] = round(mibor - 0.15, 4)
                
        except Exception as exc:
            logger.warning(f"FBIL call money fallback failed: {exc}")
            
        return rates
    
    @staticmethod
    def get_derived_from_mibor_repo(mibor: float, repo: float) -> Dict[str, float]:
        """Derive call money rates from MIBOR-Repo spread."""
        mid = mibor
        
        return {
            "mibor_overnight": round(mid, 4),
            "call_money_high": round(mid + 0.20, 4),
            "call_money_low": round(mid - 0.10, 4),
            "_derived": True,
        }


def scrape_ccil_robust(use_playwright: bool = True, max_retries: int = 3) -> Dict[str, float]:
    """
    Robust CCIL scraper with multiple fallback strategies.
    
    Priority:
    1. Playwright browser automation (most accurate)
    2. RBI call money rates
    3. FBIL MIBOR as proxy
    """
    rates = {}
    
    # Strategy 1: Playwright (best quality)
    if use_playwright:
        for attempt in range(max_retries):
            try:
                scraper = CCILPlaywrightScraper(headless=True)
                rates = scraper.scrape_with_playwright()
                
                if rates and len(rates) >= 3:  # Got at least 3 fields
                    logger.info(f"Playwright success: {rates}")
                    return rates
                    
                logger.warning(f"Playwright attempt {attempt + 1} returned incomplete data: {rates}")
                time.sleep(2 ** attempt)
                
            except Exception as exc:
                logger.error(f"Playwright attempt {attempt + 1} failed: {exc}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                    
    # Strategy 2: RBI call money
    if not rates or len(rates) < 3:
        logger.info("Trying RBI call money fallback...")
        rbi_rates = CCILAlternativeSources.get_rbi_call_money()
        rates.update(rbi_rates)
        if len(rates) >= 3:
            logger.info(f"RBI fallback success: {rates}")
            return rates
            
    # Strategy 3: FBIL MIBOR proxy
    if not rates or len(rates) < 3:
        logger.info("Trying FBIL MIBOR fallback...")
        fbil_rates = CCILAlternativeSources.get_fbil_call_money()
        rates.update(fbil_rates)
        if len(rates) >= 3:
            logger.info(f"FBIL fallback success: {rates}")
            return rates
            
    return rates


def extract_rate_from_cells(cells: list) -> Optional[float]:
    """
    Extract a numeric rate value from a list of table cells.
    
    Searches each cell for numeric patterns that look like interest rates
    (values between 0 and 100, possibly with % sign).
    
    Args:
        cells: List of cell text values from a table row
        
    Returns:
        The first valid rate found as a float, or None if no rate found
    """
    for cell in cells:
        # Clean the cell text
        text = cell.strip()
        
        # Try to extract numeric value
        # Match patterns like "6.90%", "6.90", "6.90 %%"
        match = re.search(r'(\d+\.?\d*)', text.replace(',', ''))
        if match:
            try:
                value = float(match.group(1))
                # Validate it looks like an interest rate (0-100%)
                if 0 <= value <= 100:
                    return value
            except ValueError:
                continue
    return None


# Backward compatibility
scrape_ccil = scrape_ccil_robust


__all__ = [
    "scrape_ccil_robust",
    "scrape_ccil",
    "CCILPlaywrightScraper",
    "CCILAlternativeSources",
    "extract_rate_from_cells",
    "CCIL_HOME",
    "CCIL_TREPS",
    "CCIL_CALL_MONEY",
]
