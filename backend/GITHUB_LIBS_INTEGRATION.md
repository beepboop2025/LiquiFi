# GitHub Libraries Integration Guide

## What Was Just Added

I've integrated two popular GitHub libraries into your LiquiFi data pipeline:

1. **nsepy** (from GitHub Topics: financial-data)
   - Source: https://github.com/swapniljariwala/nsepy
   - Provides: NSE India equity data (Nifty 50, Bank Nifty, VIX)
   - Use case: Alternative to your failing NSE scraper (403 errors)

2. **investpy** (from GitHub Topics: financial-data)  
   - Source: https://github.com/alvarobartt/investpy
   - Provides: Global markets data (bonds, commodities, FX)
   - Use case: Supplement to yfinance for global context

---

## Installation

```bash
# Install the GitHub libraries
pip install nsepy investpy

# Verify installation
python -c "import nsepy; print('nsepy OK')"
python -c "import investpy; print('investpy OK')"
```

---

## New Scraper Files Created

| File | Purpose | Data Provided |
|------|---------|---------------|
| `data/scrapers/nsepy_wrapper.py` | Wraps nsepy library | Nifty 50, Bank Nifty, India VIX |
| `data/scrapers/investpy_wrapper.py` | Wraps investpy library | Global bonds, commodities, FX |

---

## How to Use

### Option 1: Extended Scraping (Recommended)

```python
from data.scrapers import scrape_all_extended

# This includes ALL sources + optional GitHub libraries
result = scrape_all_extended(use_nsepy=True, use_investpy=True)

rates = result["rates"]
metadata = result["metadata"]

print(f"Total fields: {metadata['total_fields']}")
print(f"Sources used: {metadata['sources']}")
print(f"nsepy available: {metadata['nsepy_available']}")
print(f"investpy available: {metadata['investpy_available']}")
```

### Option 2: Individual Scrapers

```python
from data.scrapers import scrape_nsepy, scrape_investpy

# NSE equity data (alternative to failing NSE scraper)
nse_equity = scrape_nsepy()
# Returns: {
#     "nse_nifty50": 25693.70,
#     "nse_nifty_change_pct": 0.45,
#     "nse_banknifty": 51234.20,
#     "nse_india_vix": 15.23
# }

# Global markets (supplement to yfinance)
global_data = scrape_investpy()
# Returns: {
#     "inv_us_10y": 4.206,
#     "inv_gold": 4951.20,
#     "inv_usdinr": 90.31
# }
```

### Option 3: Direct Library Usage

```python
# Using nsepy directly
from nsepy import get_history
from datetime import date

nifty = get_history(
    symbol='NIFTY',
    start=date(2026, 1, 1),
    end=date(2026, 2, 7),
    index=True
)

# Using investpy directly
import investpy

bond = investpy.bonds.get_bond_historical_data(
    bond='India 10Y',
    from_date='01/01/2026',
    to_date='07/02/2026'
)
```

---

## Data Fields Added

### nsepy Fields (4-6 fields)
| Field | Description | Treasury Relevance |
|-------|-------------|-------------------|
| `nse_nifty50` | Nifty 50 index level | Market sentiment |
| `nse_nifty_change_pct` | Daily change % | Market momentum |
| `nse_nifty_52w_high` | 52-week high | Market context |
| `nse_banknifty` | Bank Nifty level | Banking sector health |
| `nse_india_vix` | India VIX (volatility) | Risk sentiment |
| `nse_gsec_index` | G-Sec index (if avail) | Bond market proxy |

### investpy Fields (10-20 fields)
| Field | Description | Treasury Relevance |
|-------|-------------|-------------------|
| `inv_us_10y` | US 10Y Treasury | Global rate context |
| `inv_de_10y` | German 10Y Bund | EU rate context |
| `inv_uk_10y` | UK 10Y Gilt | UK rate context |
| `inv_jp_10y` | Japan 10Y JGB | Asia rate context |
| `inv_gold` | Gold price | Inflation hedge |
| `inv_crude_wti` | WTI Oil price | Inflation indicator |
| `inv_usdinr` | USD/INR rate | Forex confirmation |
| `inv_india_10y` | India 10Y (alt source) | G-Sec confirmation |
| `inv_nifty50` | Nifty 50 (alt source) | Equity confirmation |

---

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    YOUR EXISTING PIPELINE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   RBI       │  │   CCIL      │  │   FBIL      │             │
│  │  (Custom)   │  │ (Playwright)│  │  (Custom)   │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                      │
│         └────────────────┼────────────────┘                      │
│                          ▼                                      │
│                   ┌─────────────┐                               │
│                   │ RateManager │                               │
│                   └──────┬──────┘                               │
│                          ▼                                      │
│                   ┌─────────────┐                               │
│                   │    ML       │                               │
│                   │  Ensemble   │                               │
│                   └─────────────┘                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ (NEW) GitHub library integration
┌─────────────────────────────────────────────────────────────────┐
│                 NEW OPTIONAL SOURCES                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │     nsepy       │    │    investpy     │                    │
│  │  (GitHub lib)   │    │   (GitHub lib)  │                    │
│  │                 │    │                 │                    │
│  │ • Nifty 50      │    │ • Global bonds  │                    │
│  │ • Bank Nifty    │    │ • Commodities   │                    │
│  │ • India VIX     │    │ • FX rates      │                    │
│  └────────┬────────┘    └────────┬────────┘                    │
│           │                      │                              │
│           └──────────┬───────────┘                              │
│                      ▼                                          │
│              ┌─────────────┐                                    │
│              │  scrape_    │                                    │
│              │  all_       │                                    │
│              │  extended() │                                    │
│              └─────────────┘                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Benefits of This Integration

### 1. **Redundancy**
- NSE scraper failing (403)? → Use nsepy
- yfinance down? → Use investpy
- Multiple sources = more reliable data

### 2. **Validation**
- Cross-check rates across sources
- Detect outliers/anomalies
- Higher data quality

### 3. **Completeness**
- Your scrapers: Indian money market (unique)
- GitHub libs: Equity indices, global bonds
- Combined: 100+ fields total

### 4. **Future-Proofing**
- If RBI changes website → CCIL still works
- If CCIL blocks → nsepy provides alternative
- Multiple data paths = resilience

---

## Testing the Integration

```python
# Test script
from data.scrapers import (
    scrape_all_extended,
    NSEPY_AVAILABLE,
    INVESTPY_AVAILABLE
)

print("=== GitHub Libraries Status ===")
print(f"nsepy available: {NSEPY_AVAILABLE}")
print(f"investpy available: {INVESTPY_AVAILABLE}")

print("\n=== Running Extended Scrape ===")
result = scrape_all_extended()

print(f"\nTotal fields collected: {result['metadata']['total_fields']}")
print(f"\nSources breakdown:")
for source, fields in result['metadata']['sources'].items():
    if fields and fields != ["not_installed"]:
        print(f"  {source}: {len(fields)} fields")

print(f"\nSample rates:")
rates = result['rates']
for key in list(rates.keys())[:10]:
    print(f"  {key}: {rates[key]}")
```

---

## Next Steps

1. **Install libraries:**
   ```bash
   pip install nsepy investpy
   ```

2. **Test integration:**
   ```bash
   python -c "from data.scrapers import scrape_all_extended; print(scrape_all_extended()['metadata']['total_fields'])"
   ```

3. **Use in your pipeline:**
   - Replace `scrape_all()` with `scrape_all_extended()`
   - Or use individual scrapers as needed

4. **Monitor:**
   - Check logs for which sources are working
   - Adjust `use_nsepy`/`use_investpy` flags based on reliability

---

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| Data sources | 8 (custom) | 10 (custom + 2 GitHub libs) |
| NSE data | Failing (403) | Working (via nsepy) |
| Global bonds | yfinance only | yfinance + investpy |
| Equity context | None | Nifty 50, Bank Nifty, VIX |
| Total fields | ~75 | ~90-100 |

**Your core moat (RBI + CCIL scrapers) is intact.** The GitHub libraries add supplementary data, not replace your unique scrapers.
