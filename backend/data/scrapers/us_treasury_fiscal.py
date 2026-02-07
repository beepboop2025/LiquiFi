"""US Treasury Fiscal Data scraper — Daily fiscal liquidity signals.

Fetches from the public US Treasury Fiscal Data API (no auth required):
  - TGA (Treasury General Account) operating cash balance
  - Total national debt (Debt to the Penny)
  - Debt ceiling status
  - Latest auction results (bid-to-cover, discount rates)
  - Average interest rates on Treasury securities

Base URL: https://api.fiscaldata.treasury.gov/services/api/fiscal_service/
Docs: https://fiscaldata.treasury.gov/api-documentation/
"""

import logging
from typing import Optional

import httpx

from data import cache

logger = logging.getLogger("liquifi.us_treasury_fiscal")

BASE = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service"
TIMEOUT = 20
HEADERS = {
    "User-Agent": "LiquiFi/1.0 Treasury Automation",
    "Accept": "application/json",
}


def scrape_us_treasury_fiscal() -> dict:
    """Scrape daily fiscal data from the US Treasury API."""
    cached = cache.get("us_treasury_fiscal")
    if cached:
        logger.debug("Using cached US Treasury fiscal data")
        return cached

    rates: dict = {}

    with httpx.Client(timeout=TIMEOUT, headers=HEADERS, follow_redirects=True) as client:
        _fetch_tga_balance(client, rates)
        _fetch_debt_to_penny(client, rates)
        _fetch_debt_ceiling(client, rates)
        _fetch_latest_auctions(client, rates)
        _fetch_avg_interest_rates(client, rates)

    if rates:
        logger.info("US Treasury Fiscal: %d fields scraped", len(rates))
        cache.put("us_treasury_fiscal", rates, ttl=3600)  # 1hr cache (daily data)
    else:
        logger.warning("No US Treasury fiscal data scraped")

    return rates


def _api_get(client: httpx.Client, endpoint: str, params: dict) -> Optional[list]:
    """Make a GET request to the Fiscal Data API and return data list."""
    url = f"{BASE}/{endpoint}"
    try:
        resp = client.get(url, params=params)
        if resp.status_code != 200:
            logger.debug("US Treasury %s returned %d", endpoint, resp.status_code)
            return None
        body = resp.json()
        return body.get("data", [])
    except Exception as exc:
        logger.debug("US Treasury %s failed: %s", endpoint, exc)
        return None


def _fetch_tga_balance(client: httpx.Client, rates: dict) -> None:
    """Fetch Treasury General Account (TGA) operating cash balance.

    The TGA is the government's checking account at the Fed.
    Changes in TGA balance directly affect bank reserves and market liquidity.

    API quirk: close_today_bal is "null" — the actual balance is in
    open_today_bal for the "Closing Balance" row type.
    """
    data = _api_get(client, "v1/accounting/dts/operating_cash_balance", {
        "sort": "-record_date",
        "page[size]": "20",
    })
    if not data:
        return

    # Find latest date
    latest_date = data[0].get("record_date", "")

    closing_bal = None
    opening_bal = None
    deposits = None
    withdrawals = None

    for item in data:
        if item.get("record_date") != latest_date:
            continue
        acct = item.get("account_type", "")
        val = _safe_float(item.get("open_today_bal"))
        if val is None:
            continue

        if "Closing Balance" in acct:
            closing_bal = val
        elif "Opening Balance" in acct:
            opening_bal = val
        elif "Deposits" in acct:
            deposits = val
        elif "Withdrawals" in acct:
            withdrawals = val

    if closing_bal is not None:
        rates["tga_balance"] = round(closing_bal, 0)  # in millions
        rates["tga_balance_date"] = latest_date
    if closing_bal is not None and opening_bal is not None:
        rates["tga_daily_change"] = round(closing_bal - opening_bal, 0)
    if deposits is not None:
        rates["tga_deposits_today"] = round(deposits, 0)
    if withdrawals is not None:
        rates["tga_withdrawals_today"] = round(withdrawals, 0)


def _fetch_debt_to_penny(client: httpx.Client, rates: dict) -> None:
    """Fetch total national debt (Debt to the Penny)."""
    data = _api_get(client, "v2/accounting/od/debt_to_penny", {
        "sort": "-record_date",
        "page[size]": "1",
    })
    if not data:
        return

    latest = data[0]
    total = _safe_float(latest.get("tot_pub_debt_out_amt"))
    public = _safe_float(latest.get("debt_held_public_amt"))
    intragov = _safe_float(latest.get("intragov_hold_amt"))

    if total is not None:
        rates["us_total_debt_bn"] = round(total / 1e9, 2)  # in billions
    if public is not None:
        rates["us_debt_public_bn"] = round(public / 1e9, 2)
    if intragov is not None:
        rates["us_debt_intragov_bn"] = round(intragov / 1e9, 2)
    rates["us_debt_date"] = latest.get("record_date", "")


def _fetch_debt_ceiling(client: httpx.Client, rates: dict) -> None:
    """Fetch debt subject to statutory limit (debt ceiling monitoring).

    API uses debt_catg (not debt_catg_desc) for the key categories.
    """
    data = _api_get(client, "v1/accounting/dts/debt_subject_to_limit", {
        "sort": "-record_date",
        "page[size]": "10",
    })
    if not data:
        return

    latest_date = data[0].get("record_date", "")
    debt_public = None
    debt_intragov = None
    debt_ceiling = None

    for item in data:
        if item.get("record_date") != latest_date:
            continue
        catg = (item.get("debt_catg") or "").lower()
        close_bal = _safe_float(item.get("close_today_bal"))
        if close_bal is None:
            continue

        if "statutory debt limit" in catg:
            debt_ceiling = close_bal
        elif "debt held by the public" in catg:
            debt_public = close_bal
        elif "intragovernmental" in catg:
            debt_intragov = close_bal

    if debt_ceiling is not None:
        rates["us_debt_ceiling_mn"] = round(debt_ceiling, 0)
    if debt_public is not None and debt_intragov is not None:
        total_subject = debt_public + debt_intragov
        rates["us_debt_subject_to_limit_mn"] = round(total_subject, 0)
        if debt_ceiling:
            rates["us_debt_headroom_mn"] = round(debt_ceiling - total_subject, 0)


def _fetch_latest_auctions(client: httpx.Client, rates: dict) -> None:
    """Fetch latest Treasury auction results (bid-to-cover, discount rates).

    Bills use high_discnt_rate; Notes/Bonds use high_yield.
    """
    data = _api_get(client, "v1/accounting/od/auctions_query", {
        "sort": "-auction_date",
        "page[size]": "30",
        "fields": "security_type,security_term,auction_date,high_yield,"
                  "high_discnt_rate,bid_to_cover_ratio,offering_amt",
    })
    if not data:
        return

    seen = set()
    for item in data:
        sec_type = item.get("security_type", "")
        sec_term = item.get("security_term", "")
        if not sec_type or not sec_term:
            continue

        key = f"{sec_type}_{sec_term}"
        if key in seen:
            continue

        btc = _safe_float(item.get("bid_to_cover_ratio"))
        discount = _safe_float(item.get("high_discnt_rate"))
        yield_val = _safe_float(item.get("high_yield"))
        rate_val = yield_val or discount

        # Need at least btc or rate to be useful
        if btc is None and rate_val is None:
            continue

        seen.add(key)
        term_key = sec_term.lower().replace("-", "").replace(" ", "")
        type_key = sec_type.lower()

        if btc is not None:
            rates[f"auction_{type_key}_{term_key}_btc"] = round(btc, 3)
        if rate_val is not None:
            rates[f"auction_{type_key}_{term_key}_rate"] = round(rate_val, 4)

        if len(seen) >= 8:
            break


def _fetch_avg_interest_rates(client: httpx.Client, rates: dict) -> None:
    """Fetch average interest rates on Treasury securities (monthly).

    Uses security_desc field (not security_type_desc) for detailed names.
    """
    data = _api_get(client, "v2/accounting/od/avg_interest_rates", {
        "sort": "-record_date",
        "page[size]": "20",
        "fields": "record_date,security_desc,avg_interest_rate_amt",
    })
    if not data:
        return

    latest_date = data[0].get("record_date", "")
    rate_map = {
        "Treasury Bills": "us_avg_rate_bills",
        "Treasury Notes": "us_avg_rate_notes",
        "Treasury Bonds": "us_avg_rate_bonds",
        "Treasury Inflation-Protected Securities (TIPS)": "us_avg_rate_tips",
        "Treasury Floating Rate Notes (FRN)": "us_avg_rate_frn",
        "Total Marketable": "us_avg_rate_total_mkt",
    }

    for item in data:
        if item.get("record_date") != latest_date:
            continue
        desc = item.get("security_desc", "")
        if desc in rate_map:
            val = _safe_float(item.get("avg_interest_rate_amt"))
            if val is not None:
                rates[rate_map[desc]] = round(val, 4)


def _safe_float(val) -> Optional[float]:
    """Safely convert to float, handling currency formatting."""
    if val is None:
        return None
    try:
        cleaned = str(val).replace(",", "").replace("$", "").replace("%", "").strip()
        if not cleaned or cleaned == "null":
            return None
        return float(cleaned)
    except (ValueError, TypeError):
        return None


# Convenience
scrape = scrape_us_treasury_fiscal
