"""ECB (European Central Bank) and Eurozone data scraper.

Data sources (all free, no API key needed):
1. ECB Statistical Data Warehouse (SDW) API — Key rates, ESTR, Euribor
2. ECB SDW Yield Curve — Eurozone AAA-rated sovereign yield curve
3. yfinance — German Bund yields, EUR/USD (fallback)

Eurozone rates affect global liquidity and EUR/INR via cross-currency dynamics.
"""

import logging
from typing import Optional

import httpx

from data import cache

logger = logging.getLogger("liquifi.ecb")

# ECB SDW API base (no API key needed)
ECB_SDW_BASE = "https://data-api.ecb.europa.eu/service/data"

# ECB policy rates (D=daily, B=business day frequency)
ECB_POLICY_SERIES = {
    "ecb_main_refi": "FM/B.U2.EUR.4F.KR.MRR_FR.LEV",    # Main Refinancing Rate
    "ecb_deposit": "FM/B.U2.EUR.4F.KR.DFR.LEV",          # Deposit Facility Rate
    "ecb_marginal": "FM/B.U2.EUR.4F.KR.MLFR.LEV",        # Marginal Lending Facility
}

# ESTR (Euro Short-Term Rate)
ESTR_SERIES = "EST/B.EU000A2X2A25.WT"

# Euribor rates (monthly frequency)
EURIBOR_SERIES = {
    "euribor_1m": "FM/M.U2.EUR.RT.MM.EURIBOR1MD_.HSTA",
    "euribor_3m": "FM/M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA",
    "euribor_6m": "FM/M.U2.EUR.RT.MM.EURIBOR6MD_.HSTA",
    "euribor_12m": "FM/M.U2.EUR.RT.MM.EURIBOR1YD_.HSTA",
}

# Eurozone AAA yield curve (sovereign) — from ECB SDW YC database
YIELD_CURVE_SERIES = {
    "eu_yield_2y": "YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y",
    "eu_yield_5y": "YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_5Y",
    "eu_yield_10y": "YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y",   # Key benchmark
    "eu_yield_30y": "YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_30Y",
}

# EUR/USD exchange rate
EURUSD_SERIES = "EXR/D.USD.EUR.SP00.A"

TIMEOUT = 20
HEADERS = {
    "User-Agent": "LiquiFi/1.0 (Treasury Automation Research)",
    "Accept": "application/json",
}

# Validation bounds
ECB_RATE_BOUNDS = {
    "ecb_main_refi": (-1.0, 8.0),
    "ecb_deposit": (-1.0, 8.0),
    "ecb_marginal": (-1.0, 8.0),
    "estr": (-1.0, 8.0),
    "euribor_1m": (-1.0, 8.0),
    "euribor_3m": (-1.0, 8.0),
    "euribor_6m": (-1.0, 8.0),
    "euribor_12m": (-1.0, 8.0),
    "eu_yield_2y": (-2.0, 8.0),
    "eu_yield_5y": (-2.0, 8.0),
    "eu_yield_10y": (-2.0, 8.0),
    "eu_yield_30y": (-2.0, 8.0),
    "eurusd": (0.5, 2.0),
}


def scrape_ecb() -> dict:
    """Scrape ECB, Euribor, and eurozone yield data.

    Returns dict with keys like ecb_deposit, euribor_3m, eu_yield_10y, etc.
    """
    cached = cache.get("ecb")
    if cached:
        logger.debug("Using cached ECB data")
        return cached

    rates: dict = {}

    # ECB key policy rates
    try:
        rates.update(_scrape_series_batch(ECB_POLICY_SERIES))
    except Exception as exc:
        logger.warning("ECB key rates scrape failed: %s", exc)

    # ESTR
    try:
        estr = _fetch_ecb_sdw(ESTR_SERIES)
        if estr is not None:
            rates["estr"] = estr
    except Exception as exc:
        logger.debug("ESTR scrape failed: %s", exc)

    # Euribor rates
    try:
        rates.update(_scrape_series_batch(EURIBOR_SERIES))
    except Exception as exc:
        logger.warning("Euribor scrape failed: %s", exc)

    # Eurozone yield curve
    try:
        rates.update(_scrape_series_batch(YIELD_CURVE_SERIES))
    except Exception as exc:
        logger.warning("EU yield curve scrape failed: %s", exc)

    # EUR/USD
    try:
        eurusd = _fetch_ecb_sdw(EURUSD_SERIES)
        if eurusd is not None:
            rates["eurusd"] = eurusd
    except Exception as exc:
        logger.debug("EUR/USD scrape failed: %s", exc)

    # Validate
    validated = {}
    for key, val in rates.items():
        bounds = ECB_RATE_BOUNDS.get(key)
        if bounds:
            lo, hi = bounds
            if lo <= val <= hi:
                validated[key] = val
            else:
                logger.warning("ECB rate %s=%.4f outside bounds, skipping", key, val)
        else:
            validated[key] = val

    if validated:
        logger.info("ECB scraped %d fields: %s", len(validated), list(validated.keys()))
        cache.put("ecb", validated)
    else:
        logger.warning("No ECB data scraped")

    return validated


def _scrape_series_batch(series_map: dict) -> dict:
    """Fetch multiple ECB SDW series."""
    rates: dict = {}
    for rate_key, series_key in series_map.items():
        try:
            val = _fetch_ecb_sdw(series_key)
            if val is not None:
                rates[rate_key] = val
        except Exception as exc:
            logger.debug("ECB series %s failed: %s", rate_key, exc)
    return rates


def _fetch_ecb_sdw(series_key: str) -> Optional[float]:
    """Fetch the latest value from ECB SDW API."""
    url = f"{ECB_SDW_BASE}/{series_key}"
    params = {"lastNObservations": 1, "format": "jsondata"}

    resp = httpx.get(url, params=params, timeout=TIMEOUT, headers=HEADERS, follow_redirects=True)
    if resp.status_code != 200:
        return None

    data = resp.json()
    return _extract_sdw_value(data)


def _extract_sdw_value(data: dict) -> Optional[float]:
    """Extract the latest observation value from ECB SDW JSON response."""
    try:
        datasets = data.get("dataSets", [])
        if not datasets:
            return None

        series = datasets[0].get("series", {})
        if not series:
            return None

        first_series = next(iter(series.values()))
        observations = first_series.get("observations", {})
        if not observations:
            return None

        last_key = max(observations.keys(), key=int)
        values = observations[last_key]
        if values and len(values) > 0 and values[0] is not None:
            return round(float(values[0]), 4)

    except (StopIteration, KeyError, IndexError, TypeError, ValueError) as exc:
        logger.debug("ECB SDW parse error: %s", exc)

    return None


# Convenience
scrape = scrape_ecb
