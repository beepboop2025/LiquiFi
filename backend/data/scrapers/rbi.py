"""Scrape key rates from the RBI website.

Strategy:
1. Try the RBI statistics page for key rates (repo, reverse repo, T-bills, G-Sec, USD/INR).
2. Fall back to hardcoded recent values from config.BASE_RATES.
"""

import logging
import re

import httpx
from bs4 import BeautifulSoup

from data import cache

logger = logging.getLogger("liquifi.rbi")

RBI_KEY_RATES_URL = "https://www.rbi.org.in/scripts/BS_NSDPDisplay.aspx?param=4"
RBI_HOMEPAGE_URL = "https://www.rbi.org.in"
TIMEOUT = 15


def scrape_rbi() -> dict:
    """Return a dict of real rate fields scraped from RBI, or empty dict on failure."""
    cached = cache.get("rbi")
    if cached:
        logger.debug("Using cached RBI data")
        return cached

    rates: dict = {}

    try:
        rates = _scrape_key_rates_page()
    except Exception as exc:
        logger.warning("RBI key-rates scrape failed: %s", exc)

    if not rates:
        try:
            rates = _scrape_homepage()
        except Exception as exc:
            logger.warning("RBI homepage scrape failed: %s", exc)

    if rates:
        cache.put("rbi", rates)
    return rates


def _scrape_key_rates_page() -> dict:
    """Parse the RBI NSDP key rates page for policy rates and T-bill yields."""
    resp = httpx.get(RBI_KEY_RATES_URL, timeout=TIMEOUT, follow_redirects=True)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "lxml")
    rates: dict = {}

    # Look for tables with rate data
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        for row in rows:
            cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
            text = " ".join(cells).lower()

            # Policy Repo Rate
            if "repo" in text and "reverse" not in text:
                val = _extract_rate(cells)
                if val is not None:
                    rates["repo"] = val

            # Reverse Repo / SDF
            if "reverse repo" in text or "standing deposit" in text:
                val = _extract_rate(cells)
                if val is not None:
                    rates["reverse_repo"] = val

            # T-bill yields
            if "91" in text and ("day" in text or "treasury" in text):
                val = _extract_rate(cells)
                if val is not None:
                    rates["tbill_91d"] = val
            if "182" in text and ("day" in text or "treasury" in text):
                val = _extract_rate(cells)
                if val is not None:
                    rates["tbill_182d"] = val
            if "364" in text and ("day" in text or "treasury" in text):
                val = _extract_rate(cells)
                if val is not None:
                    rates["tbill_364d"] = val

            # G-Sec 10Y
            if "10" in text and ("year" in text or "g-sec" in text or "gsec" in text or "par yield" in text):
                val = _extract_rate(cells)
                if val is not None:
                    rates["gsec_10y"] = val

            # USD/INR reference rate
            if "usd" in text and ("inr" in text or "reference" in text or "fbil" in text):
                val = _extract_rate(cells, fx=True)
                if val is not None:
                    rates["usdinr_spot"] = val

    return rates


def _scrape_homepage() -> dict:
    """Fallback: scrape RBI homepage for current rates displayed in the sidebar/marquee."""
    resp = httpx.get(RBI_HOMEPAGE_URL, timeout=TIMEOUT, follow_redirects=True)
    resp.raise_for_status()
    text = resp.text
    rates: dict = {}

    # Repo rate
    m = re.search(r"(?:repo|policy)\s*(?:rate)?\s*[:\-–]\s*([\d.]+)\s*%", text, re.IGNORECASE)
    if m:
        rates["repo"] = float(m.group(1))

    # USD/INR reference rate (FBIL)
    m = re.search(r"(?:usd\s*/?\s*inr|reference\s*rate)\s*[:\-–]\s*([\d.]+)", text, re.IGNORECASE)
    if m:
        rates["usdinr_spot"] = float(m.group(1))

    return rates


def _extract_rate(cells: list[str], fx: bool = False) -> float | None:
    """Extract the first plausible numeric rate from table cells."""
    for cell in reversed(cells):  # rates tend to be in later columns
        cleaned = cell.replace(",", "").replace("%", "").strip()
        try:
            val = float(cleaned)
            # USD/INR typically 70-110 range; reject values outside
            if fx and 70 < val < 110:
                return round(val, 4)
            if not fx and 0 < val < 30:
                return round(val, 4)
        except ValueError:
            continue
    return None
