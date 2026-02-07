"""FBIL (Financial Benchmarks India) scraper — Official benchmark rates.

FBIL is India's official benchmark administrator. Their new WASDM REST API
provides comprehensive rate data without authentication.

Endpoints (all public, JSON, no auth required):
  /wasdm/ovnmibor/fetch      — Overnight MIBOR
  /wasdm/termmibor/fetch      — Term MIBOR (14D, 1M, 3M)
  /wasdm/mror/fetch           — Market Repo Overnight Rate
  /wasdm/sorr/fetch           — Secured Overnight Rupee Rate
  /wasdm/tbill/fetch          — T-Bill curve (7D to 12M, 14 tenors)
  /wasdm/refrates/fetch       — Reference FX rates (USD, GBP, EUR, JPY, AED, IDR)
  /wasdm/miborois/fetch       — MIBOR-OIS curve (1M to 5Y, 10 tenors)
  /wasdm/cd/fetch             — Certificate of Deposit rates (14D to 12M)
  /wasdm/mmswaprates/fetch    — MM Swap rates (2Y to 5Y)
  /wasdm/fwdpremia/fetch      — USD/INR Forward Premia curve
"""

import logging
from typing import Optional

import httpx

from data import cache

logger = logging.getLogger("liquifi.fbil")

FBIL_BASE = "https://www.fbil.org.in"
TIMEOUT = 15
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json",
}

# WASDM API endpoints (all append ?authenticated=false)
WASDM_ENDPOINTS = {
    "ovnmibor":    f"{FBIL_BASE}/wasdm/ovnmibor/fetch?authenticated=false",
    "termmibor":   f"{FBIL_BASE}/wasdm/termmibor/fetch?authenticated=false",
    "mror":        f"{FBIL_BASE}/wasdm/mror/fetch?authenticated=false",
    "sorr":        f"{FBIL_BASE}/wasdm/sorr/fetch?authenticated=false",
    "tbill":       f"{FBIL_BASE}/wasdm/tbill/fetch?authenticated=false",
    "refrates":    f"{FBIL_BASE}/wasdm/refrates/fetch?authenticated=false",
    "miborois":    f"{FBIL_BASE}/wasdm/miborois/fetch?authenticated=false",
    "cd":          f"{FBIL_BASE}/wasdm/cd/fetch?authenticated=false",
    "mmswaprates": f"{FBIL_BASE}/wasdm/mmswaprates/fetch?authenticated=false",
    "fwdpremia":   f"{FBIL_BASE}/wasdm/fwdpremia/fetch?authenticated=false",
}


def scrape_fbil() -> dict:
    """Scrape rates from FBIL WASDM REST API."""
    cached = cache.get("fbil")
    if cached:
        logger.debug("Using cached FBIL data")
        return cached

    rates: dict = {}

    with httpx.Client(timeout=TIMEOUT, headers=HEADERS, follow_redirects=True) as client:
        # Overnight MIBOR
        _fetch_latest(client, "ovnmibor", rates, {
            None: "mibor_overnight",  # single rate, no tenor filter
        })

        # Term MIBOR
        _fetch_latest(client, "termmibor", rates, {
            "14 DAYS": "mibor_14d",
            "1 MONTH": "mibor_1m",
            "3 MONTHS": "mibor_3m",
        })

        # Market Repo Overnight Rate
        _fetch_latest(client, "mror", rates, {
            None: "mror_overnight",
        })

        # Secured Overnight Rupee Rate
        _fetch_latest(client, "sorr", rates, {
            None: "sorr_overnight",
        })

        # T-Bill curve (14 tenors)
        _fetch_latest(client, "tbill", rates, {
            "7 Days": "tbill_7d",
            "14 Days": "tbill_14d",
            "1 Month": "tbill_1m",
            "2 Months": "tbill_2m",
            "3 Months": "tbill_3m",
            "6 Months": "tbill_6m",
            "9 Months": "tbill_9m",
            "12 Months": "tbill_12m",
        })

        # Reference FX rates
        _fetch_refrates(client, rates)

        # MIBOR-OIS curve
        _fetch_latest(client, "miborois", rates, {
            "1M": "ois_1m",
            "3M": "ois_3m",
            "6M": "ois_6m",
            "1Y": "ois_1y",
            "2Y": "ois_2y",
            "3Y": "ois_3y",
            "5Y": "ois_5y",
        })

        # Certificate of Deposit
        _fetch_latest(client, "cd", rates, {
            "1 Month": "cd_1m",
            "3 Months": "cd_3m",
            "6 Months": "cd_6m",
            "12 Months": "cd_12m",
        })

        # MM Swap rates
        _fetch_latest(client, "mmswaprates", rates, {
            "2YR": "swap_2y",
            "3YR": "swap_3y",
            "5YR": "swap_5y",
        })

        # Forward Premia
        _fetch_fwdpremia(client, rates)

    if rates:
        logger.info("FBIL fields scraped: %d (%s)", len(rates), ", ".join(sorted(rates.keys())))
        cache.put("fbil", rates)
    else:
        logger.warning("No FBIL data scraped")

    return rates


def _fetch_latest(client: httpx.Client, endpoint: str, rates: dict, tenor_map: dict) -> None:
    """Fetch data from a WASDM endpoint and extract latest rates by tenor."""
    url = WASDM_ENDPOINTS.get(endpoint)
    if not url:
        return

    try:
        resp = client.get(url)
        if resp.status_code != 200:
            logger.debug("FBIL %s returned %d", endpoint, resp.status_code)
            return

        data = resp.json()
        if not isinstance(data, list) or not data:
            return

        # Find latest date
        latest_date = data[0].get("processRunDate", "").split(" ")[0]

        for item in data:
            item_date = item.get("processRunDate", "").split(" ")[0]
            if item_date != latest_date:
                continue

            rate = _safe_float(item.get("rate"))
            if rate is None:
                continue

            # Get tenor from whichever field exists
            tenor = (item.get("tenor") or item.get("tenorName") or "").strip()

            if None in tenor_map and not tenor_map.get(None) in rates:
                # Single-rate endpoint (no tenor filtering)
                rates[tenor_map[None]] = round(rate, 4)
            elif tenor in tenor_map:
                rates[tenor_map[tenor]] = round(rate, 4)

    except Exception as exc:
        logger.debug("FBIL %s failed: %s", endpoint, exc)


def _fetch_refrates(client: httpx.Client, rates: dict) -> None:
    """Fetch FBIL reference FX rates."""
    url = WASDM_ENDPOINTS["refrates"]
    try:
        resp = client.get(url)
        if resp.status_code != 200:
            return

        data = resp.json()
        if not isinstance(data, list) or not data:
            return

        latest_date = data[0].get("processRunDate", "").split(" ")[0]

        ref_map = {
            "INR / 1 USD": "usdinr_spot",
            "INR / 1 GBP": "gbpinr_spot",
            "INR / 1 EUR": "eurinr_spot",
            "INR / 100 JPY": "jpyinr_spot",
        }

        for item in data:
            if item.get("processRunDate", "").split(" ")[0] != latest_date:
                continue
            prod = item.get("subProdName", "")
            if prod in ref_map:
                rate = _safe_float(item.get("rate"))
                if rate is not None:
                    rates[ref_map[prod]] = round(rate, 4)

    except Exception as exc:
        logger.debug("FBIL refrates failed: %s", exc)


def _fetch_fwdpremia(client: httpx.Client, rates: dict) -> None:
    """Fetch USD/INR forward premia curve."""
    url = WASDM_ENDPOINTS["fwdpremia"]
    try:
        resp = client.get(url)
        if resp.status_code != 200:
            return

        data = resp.json()
        if not isinstance(data, list) or not data:
            return

        latest_date = data[0].get("processRunDate", "").split(" ")[0]

        premia_map = {
            "1M": "fwd_premia_1m",
            "3M": "fwd_premia_3m",
            "6M": "fwd_premia_6m",
            "12M": "fwd_premia_12m",
        }

        for item in data:
            if item.get("processRunDate", "").split(" ")[0] != latest_date:
                continue
            tenor = item.get("tenorName", "").strip()
            if tenor in premia_map:
                rate = _safe_float(item.get("rate"))
                if rate is not None:
                    rates[premia_map[tenor]] = round(rate, 4)

    except Exception as exc:
        logger.debug("FBIL fwdpremia failed: %s", exc)


def _safe_float(val) -> Optional[float]:
    """Safely convert to float."""
    if val is None:
        return None
    try:
        return float(str(val).replace(",", "").replace("%", "").strip())
    except (ValueError, TypeError):
        return None


# Convenience
scrape = scrape_fbil
