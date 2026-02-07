"""NSE (National Stock Exchange of India) scraper - Money market data.

Uses NSE's JSON API endpoints where available, with HTML fallback.
NSE aggressively blocks bots, so we:
1. Establish a session with cookies via the main page
2. Use the JSON API endpoints (faster, more reliable)
3. Fall back to legacy HTML tables
"""

import logging
import re
from typing import Optional

import httpx
from bs4 import BeautifulSoup

from data import cache

logger = logging.getLogger("liquifi.nse")

# NSE API base (current NSE uses client-side rendering + JSON APIs)
NSE_BASE = "https://www.nseindia.com"
NSE_API_MIBOR = "https://www.nseindia.com/api/mibor-mibid-daily"
NSE_API_DEBT = "https://www.nseindia.com/api/debt-market"
NSE_API_GSEC = "https://www.nseindia.com/api/liveBonds-traded-on-cm"

# Legacy fallback URL (older NSE subdomain, still serves HTML)
NSE_LEGACY_MIBOR = "https://www1.nseindia.com/products/content/debt/wdm/fimmda_mibid_mibor.htm"

TIMEOUT = 15
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Referer": "https://www.nseindia.com/",
}


def scrape_nse() -> dict:
    """Scrape money market rates from NSE with multiple strategies."""
    cached = cache.get("nse")
    if cached:
        logger.debug("Using cached NSE data")
        return cached

    rates: dict = {}

    # Strategy 1: NSE JSON API (requires session cookies)
    try:
        rates.update(_scrape_nse_api())
    except Exception as exc:
        logger.debug("NSE API scrape failed: %s", exc)

    # Strategy 2: Legacy HTML endpoint
    if not rates:
        try:
            rates.update(_scrape_legacy_mibor())
        except Exception as exc:
            logger.debug("NSE legacy MIBOR scrape failed: %s", exc)

    if rates:
        logger.info("NSE fields scraped: %s", list(rates.keys()))
        cache.put("nse", rates)
    else:
        logger.warning("No NSE data scraped (NSE anti-bot may be active)")

    return rates


def _get_session_client() -> httpx.Client:
    """Create an httpx client with NSE session cookies."""
    client = httpx.Client(timeout=TIMEOUT, headers=HEADERS, follow_redirects=True)
    try:
        # Hit the main page to get cookies (required by NSE)
        client.get(NSE_BASE)
    except Exception:
        pass  # Continue anyway; API might still work
    return client


def _scrape_nse_api() -> dict:
    """Scrape via NSE JSON API endpoints."""
    rates: dict = {}

    with _get_session_client() as client:
        # MIBOR/MIBID daily rates
        try:
            resp = client.get(NSE_API_MIBOR)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list) and data:
                    latest = data[0] if isinstance(data[0], dict) else {}
                elif isinstance(data, dict):
                    latest = data
                else:
                    latest = {}

                # Parse MIBOR rates from JSON
                for key_map in [
                    (["mibor", "MIBOR", "miborRate"], "mibor_overnight"),
                    (["mibid", "MIBID", "mibidRate"], "mibid_overnight"),
                ]:
                    src_keys, dst_key = key_map
                    for k in src_keys:
                        if k in latest:
                            val = _safe_float(latest[k])
                            if val and 3.0 < val < 15.0:
                                rates[dst_key] = round(val, 4)
                                break
        except Exception as exc:
            logger.debug("NSE MIBOR API failed: %s", exc)

        # Debt market data
        try:
            resp = client.get(NSE_API_DEBT)
            if resp.status_code == 200:
                data = resp.json()
                _parse_debt_data(data, rates)
        except Exception as exc:
            logger.debug("NSE debt API failed: %s", exc)

    return rates


def _parse_debt_data(data: dict, rates: dict) -> None:
    """Parse NSE debt market JSON response."""
    if not isinstance(data, dict):
        return

    # Look for T-bill and G-Sec data in various possible structures
    for section_key in ["data", "marketData", "debtData", "tradeData"]:
        section = data.get(section_key, [])
        if not isinstance(section, list):
            continue
        for item in section:
            if not isinstance(item, dict):
                continue
            desc = str(item.get("secDesc", "") or item.get("symbol", "")).lower()
            ytm = _safe_float(item.get("ytm") or item.get("yield") or item.get("lastPrice"))

            if ytm is None:
                continue

            if "91" in desc and ("tbill" in desc or "treasury" in desc):
                rates.setdefault("tbill_91d", round(ytm, 4))
            elif "182" in desc and ("tbill" in desc or "treasury" in desc):
                rates.setdefault("tbill_182d", round(ytm, 4))
            elif "364" in desc and ("tbill" in desc or "treasury" in desc):
                rates.setdefault("tbill_364d", round(ytm, 4))


def _scrape_legacy_mibor() -> dict:
    """Scrape from legacy NSE HTML page (www1.nseindia.com)."""
    rates: dict = {}

    resp = httpx.get(NSE_LEGACY_MIBOR, timeout=TIMEOUT, headers=HEADERS, follow_redirects=True)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "lxml")

    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        for row in rows:
            cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
            if len(cells) < 2:
                continue
            text = " ".join(cells).lower()
            rate_val = _extract_rate(cells)

            if rate_val is None:
                continue

            if any(x in text for x in ["overnight", "o/n", "1 day", "1d"]):
                rates.setdefault("mibor_overnight", rate_val)
            elif any(x in text for x in ["1 week", "1w", "7 day"]):
                rates.setdefault("mibor_1w", rate_val)
            elif any(x in text for x in ["14 day", "2 week", "2w"]):
                rates.setdefault("mibor_2w", rate_val)
            elif any(x in text for x in ["1 month", "1m", "30 day"]):
                rates.setdefault("mibor_1m", rate_val)
            elif any(x in text for x in ["3 month", "3m", "90 day"]):
                rates.setdefault("mibor_3m", rate_val)
            elif any(x in text for x in ["mibid", "bid"]):
                rates.setdefault("mibid_overnight", rate_val)

    return rates


def _extract_rate(cells: list[str]) -> Optional[float]:
    """Extract interest rate from table cells."""
    for cell in reversed(cells):
        cleaned = cell.replace(",", "").replace("%", "").strip()
        try:
            val = float(cleaned)
            if 3.0 < val < 15.0:
                return round(val, 4)
        except ValueError:
            continue
    return None


def _safe_float(val) -> Optional[float]:
    """Safely convert to float."""
    if val is None:
        return None
    try:
        return float(str(val).replace(",", "").replace("%", "").strip())
    except (ValueError, TypeError):
        return None


# Convenience
scrape = scrape_nse
