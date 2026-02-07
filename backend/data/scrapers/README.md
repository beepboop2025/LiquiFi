# Money Market Data Scrapers

This package provides robust, multi-source scraping for Indian money market rates with intelligent fallback mechanisms.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Unified Scraper (scrape_all)                  │
│                   ┌─────────────────────────┐                   │
│                   │  Intelligent Merger     │                   │
│                   │  with Source Priority   │                   │
│                   └─────────────────────────┘                   │
└──────────┬────────────────┬────────────────┬────────────────────┘
           │                │                │
           ▼                ▼                ▼
     ┌──────────┐    ┌──────────┐    ┌──────────┐
     │   RBI    │    │   FBIL   │    │   CCIL   │    ┌──────────┐
     │ (Policy  │    │(MIBOR &  │    │(Call $  │    │   NSE    │
     │  Rates)  │    │Benchmarks│    │ TREPS)  │    │(Fallback)│
     └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

## Sources

### 1. RBI (Reserve Bank of India) - `rbi.py`
**Best for:** Policy rates, T-Bills, G-Sec, USD/INR
- **URL:** https://www.rbi.org.in/scripts/BS_NSDPDisplay.aspx?param=4
- **Fields:**
  - `repo` - Policy Repo Rate
  - `reverse_repo` - Reverse Repo / SDF Rate
  - `tbill_91d`, `tbill_182d`, `tbill_364d` - T-Bill rates
  - `gsec_10y` - 10-year G-Sec yield
  - `usdinr_spot` - USD/INR reference rate

### 2. FBIL (Financial Benchmarks India) - `fbil.py`
**Best for:** MIBOR rates, benchmark rates
- **URL:** https://www.fbil.org.in
- **Fields:**
  - `mibor_overnight` - Overnight MIBOR
  - `mibor_1w`, `mibor_1m`, `mibor_3m` - Term MIBOR rates
  - `tbill_*` - T-Bill rates (alternative to RBI)
  - `usdinr_spot` - Reference rate

### 3. CCIL (Clearing Corporation of India) - `ccil.py`
**Best for:** Call money rates, TREPS/CBLO
- **URLs:**
  - https://www.ccilindia.com/web/ccil/home
  - https://www.ccilindia.com/web/ccil/treps1
- **Fields:**
  - `call_money_high` - High call money rate
  - `call_money_low` - Low call money rate
  - `mibor_overnight` - Weighted average (MIBOR proxy)
  - `cblo_bid`, `cblo_ask` - CBLO/TREPS rates

**Note:** CCIL's website uses JavaScript. The scraper tries static HTML first, then falls back to Playwright headless browser if available.

### 4. NSE (National Stock Exchange) - `nse.py`
**Best for:** Fallback/confirmation data
- **URL:** https://www.nseindia.com
- **Fields:**
  - `mibor_*` - NSE MIBOR rates
  - Additional money market data

## Usage

### Quick Start

```python
from data.scrapers import scrape_all

# Scrape all sources with intelligent merging
rates = scrape_all()

print(rates)
# {
#     'repo': 6.50,
#     'mibor_overnight': 6.75,
#     'call_money_high': 6.90,
#     'call_money_low': 6.50,
#     ...
# }
```

### Individual Scrapers

```python
from data.scrapers import scrape_rbi, scrape_fbil, scrape_ccil, scrape_nse

# Get specific data
rbi_data = scrape_rbi()      # Policy rates
fbil_data = scrape_fbil()    # MIBOR rates
ccil_data = scrape_ccil()    # Call money rates
nse_data = scrape_nse()      # Fallback data
```

### With RateManager

```python
from data.rate_manager import RateManager

rm = RateManager()
rm.scrape()  # Uses unified scraper
snapshot = rm.snapshot()

# Check what data we got
stats = rm.get_scrape_stats()
print(stats['real_fields_count'])  # Number of real (non-simulated) fields
print(stats['source_log'])         # Which source provided each field
```

## Source Priority

When the same field is available from multiple sources, the following priority is used:

| Field Type | Priority Order |
|------------|----------------|
| Policy Rates (repo, etc.) | RBI > FBIL |
| MIBOR Rates | FBIL > NSE > CCIL |
| Call Money Rates | CCIL > FBIL > NSE |
| CBLO/TREPS | CCIL > FBIL |
| T-Bills | RBI > FBIL > NSE |
| G-Sec | RBI > FBIL |
| USD/INR | RBI > FBIL |

## Caching

All scrapers use a built-in cache to avoid hammering the websites:
- Cache TTL: 60 seconds (configurable in `data/cache.py`)
- Cache key per source

## Error Handling

The scrapers are designed to be resilient:
1. Each source is tried independently
2. If one fails, others continue
3. `RateManager` falls back to simulated values with micro-drift
4. All failures are logged

## Installation

### Basic Installation
```bash
pip install -r requirements.txt
```

### With Playwright (for enhanced CCIL scraping)
```bash
pip install playwright
playwright install chromium

# Or use the helper script:
./scripts/install_playwright.sh
```

## Testing

```bash
# Run all scraper tests
pytest tests/test_fbil_scraper.py tests/test_ccil_scraper.py tests/test_scrapers_init.py -v

# Skip slow integration tests
pytest tests/ -v -m "not slow"

# Run only integration tests (hits real websites)
pytest tests/ -v -m "slow"
```

## Adding a New Source

To add a new data source:

1. Create a new file in `data/scrapers/` (e.g., `new_source.py`)
2. Implement `scrape_new_source()` function returning a dict
3. Add to `data/scrapers/__init__.py`:
   - Import the function
   - Call it in `scrape_all()`
   - Define priority in `get_source_priority()`
4. Add tests in `tests/test_new_source.py`

## Troubleshooting

### CCIL Scraper Returns Empty Data
CCIL's website uses JavaScript. The scraper will work best with Playwright installed:
```bash
pip install playwright
playwright install chromium
```

### Rate Limiting / 403 Errors
If you see frequent HTTP errors:
1. Check your internet connection
2. The websites may be blocking - wait a few minutes
3. Try accessing the URLs manually in a browser

### Missing Fields
Some fields may be missing if:
1. The website changed its layout (update the CSS selectors)
2. The market is closed (no data published)
3. The website is down (check logs)

Check `RateManager.get_scrape_stats()` to see which fields are using fallback data.

## Data Quality

| Source | Reliability | Latency | Coverage |
|--------|-------------|---------|----------|
| RBI | ⭐⭐⭐⭐⭐ | ~1 day | Policy rates, T-Bills |
| FBIL | ⭐⭐⭐⭐⭐ | Real-time | MIBOR, benchmarks |
| CCIL | ⭐⭐⭐⭐ | Real-time | Call money, TREPS |
| NSE | ⭐⭐⭐ | Real-time | MIBOR (limited) |

## License

Internal use only - Treasury Automation App
