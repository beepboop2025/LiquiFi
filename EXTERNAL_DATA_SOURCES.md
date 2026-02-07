# External Data Sources from GitHub Topics (financial-data)

## What You Asked
> "Can I use the repos from github.com/topics/financial-data for data gathering?"

## Short Answer: LIMITED Use for Indian Treasury Data

The GitHub "financial-data" topic has 1,200+ repos, but **most are for US/global markets, not India-specific data.**

However, some can supplement your existing RBI/CCIL scrapers.

---

## Useful Repos for Your Project

### 1. yfinance (15,000+ stars)
**What it gets:** Yahoo Finance data (global stocks, ETFs, currencies)
**Useful for you:**
- USD/INR forex rates
- Global indices (S&P 500, Nasdaq) for correlation
- Commodity prices (gold, oil)

```python
import yfinance as yf
# Get USD/INR rates
usdinr = yf.Ticker("USDINR=X")
hist = usdinr.history(period="1mo")
```

**Limitations:**
- ❌ No Indian money market rates (MIBOR, CALL)
- ❌ No RBI policy rates
- ❌ No CCIL data
- ⚠️ Delayed data (15-20 min)

---

### 2. AKShare (10,000+ stars)
**What it gets:** Chinese financial data
**Useful for you:**
- ⚠️ NOT directly useful (China-focused)
- Maybe: Asian market correlation analysis

**Verdict:** Skip this

---

### 3. alpha_vantage (2,000+ stars)
**What it gets:** Alpha Vantage API (forex, stocks, crypto)
**Useful for you:**
- USD/INR rates (daily)
- Forex conversion rates
- 500 free API calls/day

```python
from alpha_vantage.foreignexchange import ForeignExchange
cc = ForeignExchange(key='YOUR_API_KEY')
data, _ = cc.get_currency_exchange_rate(from_currency='USD', to_currency='INR')
```

**Limitations:**
- ⚠️ Requires API key (free tier limited)
- ❌ No Indian money market data
- ❌ No RBI data

---

### 4. OpenBB (30,000+ stars) - MOST USEFUL
**What it is:** Open source Bloomberg Terminal alternative
**Useful for you:**
- ✅ Already has Indian equity data (NSE/BSE)
- ✅ Has forex, commodities
- ✅ Has terminal UI you can learn from
- ✅ Open source (see how they structure things)

**How to use:**
```bash
# Install
pip install openbb

# Launch terminal
openbb

# In terminal:
/stocks/load RELIANCE.NS
```

**What you can learn from their code:**
- How they structure scrapers
- How they handle multiple data sources
- Terminal UI patterns
- Data validation approaches

---

### 5. sec-edgar-downloader (1,000+ stars)
**What it gets:** US SEC filings (10-K, 10-Q)
**Useful for you:**
- ⚠️ NOT for Indian companies
- Only if you're tracking US-listed Indian ADRs (INFY, WIT, etc.)

**Verdict:** Skip unless you need US data

---

### 6. investpy (2,000+ stars)
**What it gets:** Investing.com data (global)
**Useful for you:**
- Indian stocks (from Investing.com)
- Indian indices
- Commodities

```python
import investpy
# Get Indian stocks
df = investpy.get_stocks(country='india')
# Get historical data
hist = investpy.get_stock_historical_data(stock='RELIANCE', country='india')
```

**Limitations:**
- ⚠️ Web scraping based (fragile)
- ❌ No money market rates
- ❌ No RBI data

---

### 7. nsepy (Indian NSE data - 500+ stars)
**What it gets:** NSE India data
**Useful for you:**
- ✅ NSE stock prices
- ✅ Index data (Nifty 50)
- ✅ Futures & Options data
- ✅ FREE and India-focused

```python
from nsepy import get_history
from datetime import date

# Get stock data
hist = get_history(symbol='RELIANCE', start=date(2024,1,1), end=date(2024,12,31))

# Get index data
nifty = get_history(symbol='NIFTY', index=True, start=date(2024,1,1), end=date(2024,12,31))
```

**BEST for Indian equity data if you need it later.**

---

## What NONE of These Provide

| Data You Need | Available? | Your Solution |
|---------------|------------|---------------|
| RBI Repo Rate | ❌ No | Your RBI scraper ✅ |
| CCIL CALL Rates | ❌ No | Your CCIL scraper ✅ |
| CCIL TREP Rates | ❌ No | Your CCIL scraper ✅ |
| MIBOR Rates | ❌ No | Your scraper ✅ |
| Corporate Bond Yields | ⚠️ Limited | NSE getbhavcopy |
| TBill Rates | ⚠️ Partial | RBI press releases |

**Bottom line:** Your RBI + CCIL scrapers are UNIQUE. No open source repo has this.

---

## Recommended External Sources to ADD

### For Phase 2 Expansion (Not Core Treasury)

| Source | Use Case | Cost |
|--------|----------|------|
| **yfinance** | USD/INR, global correlations | Free |
| **nsepy** | NSE stocks, indices (Phase 2) | Free |
| **OpenBB** | Learn architecture, maybe integrate | Free |
| **RBI Press Releases** | Policy announcements | Free |
| **NSE Bhavcopy** | EOD stock prices | Free |

---

## What You Should NOT Use

| Repo | Why Not |
|------|---------|
| Any US SEC scraper | Wrong market |
| China data (AKShare) | Wrong market |
| European stock scrapers | Wrong market |
| Crypto-focused repos | Wrong asset class |

---

## Summary: Your Data Strategy

### Core Data (Keep Building Yourself):
- ✅ RBI rates (your scraper)
- ✅ CCIL money market (your scraper)
- ✅ FBIL rates (fix your scraper)
- ✅ Validation + ML (your system)

### Supplemental Data (Use External):
- ⚠️ USD/INR (yfinance)
- ⚠️ NSE stocks (nsepy - Phase 2)
- ⚠️ Global indices (yfinance - Phase 2)

### Inspiration (Learn From):
- 📚 OpenBB (architecture, UI)
- 📚 yfinance (clean API design)

---

## Bottom Line

**Can you use GitHub repos for data gathering?** 
- ⚠️ Limited for Indian treasury data
- ✅ Useful for Phase 2 expansion (equities, forex)
- ✅ Good for learning architecture

**Your RBI + CCIL scrapers are your moat.** 
No one else has this. Don't abandon them for generic yfinance data.

**Recommended approach:**
1. Keep building your treasury data pipeline (RBI/CCIL)
2. Add yfinance for USD/INR if needed
3. Use nsepy for Phase 2 equity expansion
4. Study OpenBB for terminal UI inspiration
